import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// Generated from ../web/riddle.js by build.sh, so browser and extension share one generator.
import MathClock from './riddle.js';

const REVEAL_SECONDS = 10; // auto-reveal window at the end of each minute
const DESKTOP_MARGIN = 48;

// "H  2 × 2 + 15  = 19": a small label, the riddle, and its (hidden) answer.
function makeLine(labelText, styleClass) {
  const box = new St.BoxLayout({style_class: `${styleClass}-line`});
  const label = new St.Label({
    text: labelText,
    style_class: `${styleClass}-label`,
    y_align: Clutter.ActorAlign.CENTER,
  });
  const expr = new St.Label({style_class: `${styleClass}-expr`, y_align: Clutter.ActorAlign.CENTER});
  const answer = new St.Label({style_class: `${styleClass}-answer`, y_align: Clutter.ActorAlign.CENTER, opacity: 0});
  box.add_child(label);
  box.add_child(expr);
  box.add_child(answer);
  return {box, label, expr, answer};
}

function fillLine(line, riddle, pad) {
  line.expr.text = riddle.text;
  line.answer.text = `= ${pad ? String(riddle.value).padStart(2, '0') : riddle.value}`;
}

// The top bar uses a compact form: "2×2+15 : 5+10×5".
function compact(text) {
  return text.replaceAll(' ', '');
}

const MathClockIndicator = GObject.registerClass(
  class MathClockIndicator extends PanelMenu.Button {
    _init(ext) {
      super._init(0.5, 'Math Clock');
      this._ext = ext;

      this._label = new St.Label({
        style_class: 'mathclock-panel-label',
        y_align: Clutter.ActorAlign.CENTER,
      });
      this.add_child(this._label);

      // Large view of both riddles inside the menu.
      const riddleItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
      const box = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        style_class: 'mathclock-menu-box',
        x_expand: true,
      });
      this._hour = makeLine('H', 'mathclock-menu');
      this._minute = makeLine('M', 'mathclock-menu');
      box.add_child(this._hour.box);
      box.add_child(this._minute.box);
      riddleItem.add_child(box);
      this.menu.addMenuItem(riddleItem);

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      this._revealSwitch = new PopupMenu.PopupSwitchMenuItem('Show answers', false);
      this._revealSwitch.connect('toggled', (_item, state) => ext.setReveal(state));
      this.menu.addMenuItem(this._revealSwitch);

      this._levelMenu = new PopupMenu.PopupSubMenuMenuItem('Difficulty');
      this._levelItems = [];
      for (const [n, cfg] of Object.entries(MathClock.LEVELS)) {
        const item = new PopupMenu.PopupMenuItem(`${n}  ${cfg.name}`);
        item.connect('activate', () => ext.settings.set_int('level', Number(n)));
        this._levelMenu.menu.addMenuItem(item);
        this._levelItems.push([Number(n), item]);
      }
      this.menu.addMenuItem(this._levelMenu);

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      this.menu.addAction('Settings', () => ext.openPreferences());
    }

    update(riddles, reveal, manualReveal, level) {
      this._label.text = `${compact(riddles.hours.text)} : ${compact(riddles.minutes.text)}`;
      fillLine(this._hour, riddles.hours, false);
      fillLine(this._minute, riddles.minutes, true);
      this._hour.answer.opacity = this._minute.answer.opacity = reveal ? 255 : 0;
      this._revealSwitch.setToggleState(manualReveal);
      this._levelMenu.label.text = `Difficulty: ${MathClock.LEVELS[level].name}`;
      for (const [n, item] of this._levelItems)
        item.setOrnament(n === level ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
    }
  },
);

// Large clock drawn on the desktop background, below all windows.
class DesktopClock {
  constructor(ext) {
    const settings = ext.settings;
    const size = settings.get_int('desktop-font-size');
    this._position = settings.get_string('desktop-position');
    const alignRight = this._position.endsWith('right');

    this.actor = new St.BoxLayout({
      orientation: Clutter.Orientation.VERTICAL,
      style_class: 'mathclock-desktop',
      style: `font-size: ${size}px; spacing: ${Math.round(size * 0.25)}px;`,
      reactive: true,
    });

    this._hour = makeLine('H', 'mathclock-desktop');
    this._minute = makeLine('M', 'mathclock-desktop');
    for (const line of [this._hour, this._minute]) {
      line.box.style = `spacing: ${Math.round(size * 0.4)}px;`;
      line.box.x_align = alignRight ? Clutter.ActorAlign.END : Clutter.ActorAlign.START;
      line.label.style = `font-size: ${Math.round(size * 0.3)}px;`;
      this.actor.add_child(line.box);
    }

    this._track = new St.Widget({style_class: 'mathclock-desktop-track', x_expand: true});
    this._fill = new St.Widget({style_class: 'mathclock-desktop-fill'});
    this._track.add_child(this._fill);
    this.actor.add_child(this._track);

    // Click the clock to toggle the answers.
    this.actor.connect('button-press-event', () => {
      ext.setReveal(!ext.manualReveal);
      return Clutter.EVENT_STOP;
    });

    // Re-place whenever the text changes size or monitors change.
    this.actor.connect('notify::width', () => this._place());
    this.actor.connect('notify::height', () => this._place());
    this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => this._place());

    // _backgroundGroup is not public API, but it is the layer that sits
    // between the wallpaper and the windows, which is what a desktop widget needs.
    const group = Main.layoutManager._backgroundGroup;
    group.add_child(this.actor);
    group.set_child_above_sibling(this.actor, null);
    this._revealed = false;
  }

  _place() {
    const layout = Main.layoutManager;
    if (!layout.primaryMonitor) return;
    const area = layout.getWorkAreaForMonitor(layout.primaryIndex);
    const [w, h] = [this.actor.width, this.actor.height];
    let x = area.x + DESKTOP_MARGIN;
    let y = area.y + DESKTOP_MARGIN;
    if (this._position.endsWith('right')) x = area.x + area.width - w - DESKTOP_MARGIN;
    if (this._position.startsWith('bottom')) y = area.y + area.height - h - DESKTOP_MARGIN;
    if (this._position === 'center') {
      x = area.x + (area.width - w) / 2;
      y = area.y + (area.height - h) / 2;
    }
    this.actor.set_position(Math.round(x), Math.round(y));
  }

  update(riddles, reveal, progress) {
    fillLine(this._hour, riddles.hours, false);
    fillLine(this._minute, riddles.minutes, true);
    if (reveal !== this._revealed) {
      this._revealed = reveal;
      for (const answer of [this._hour.answer, this._minute.answer]) {
        answer.ease({
          opacity: reveal ? 255 : 0,
          duration: 400,
          mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
      }
    }
    this._fill.width = Math.round(this._track.width * progress);
  }

  destroy() {
    Main.layoutManager.disconnect(this._monitorsChangedId);
    this.actor.destroy();
  }
}

export default class MathClockExtension extends Extension {
  enable() {
    this.settings = this.getSettings();
    this.manualReveal = false;
    this._settingsChangedId = this.settings.connect('changed', () => this._rebuild());
    this._rebuild();
    this._tickId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      this._tick();
      return GLib.SOURCE_CONTINUE;
    });
  }

  disable() {
    GLib.source_remove(this._tickId);
    this._tickId = 0;
    this.settings.disconnect(this._settingsChangedId);
    this._destroyUi();
    this.settings = null;
    this._riddles = null;
  }

  setReveal(reveal) {
    this.manualReveal = reveal;
    this._tick();
  }

  // Any settings change simply rebuilds the UI; it is small and cheap.
  _rebuild() {
    this._destroyUi();
    const replaceClock = this.settings.get_boolean('hide-system-clock');

    if (this.settings.get_boolean('show-in-panel')) {
      this._indicator = new MathClockIndicator(this);
      Main.panel.addToStatusArea(this.uuid, this._indicator, 0, replaceClock ? 'center' : 'right');
    }
    if (replaceClock) {
      Main.panel.statusArea.dateMenu.container.hide();
      this._clockHidden = true;
    }
    if (this.settings.get_boolean('show-on-desktop')) this._desktop = new DesktopClock(this);

    this._lastKey = null;
    this._tick();
  }

  _destroyUi() {
    this._indicator?.destroy();
    this._indicator = null;
    this._desktop?.destroy();
    this._desktop = null;
    if (this._clockHidden) {
      Main.panel.statusArea.dateMenu.container.show();
      this._clockHidden = false;
    }
  }

  _tick() {
    const now = new Date();
    const level = this.settings.get_int('level');
    const twelveHour = this.settings.get_boolean('twelve-hour');
    const salt = this.settings.get_string('salt');

    // New riddles once per minute (or straight away after a settings change).
    const key = `${now.getHours()}:${now.getMinutes()}`;
    if (key !== this._lastKey) {
      if (this._lastKey !== null) this.manualReveal = false;
      this._lastKey = key;
      this._riddles = MathClock.riddlesFor(now, {level, twelveHour, salt});
    }

    const seconds = now.getSeconds();
    const autoReveal = this.settings.get_boolean('auto-reveal') && seconds >= 60 - REVEAL_SECONDS;
    const reveal = this.manualReveal || autoReveal;

    this._indicator?.update(this._riddles, reveal, this.manualReveal, level);
    this._desktop?.update(this._riddles, reveal, (seconds + 1) / 60);
  }
}
