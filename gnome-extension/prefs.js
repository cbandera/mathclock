import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const LEVELS = [
  'Easy (1 step, + −)',
  'Medium (2 steps, + − ×)',
  'Hard (2–3 steps, all operators)',
  'Expert (3 steps, all operators)',
];
const POSITIONS = [
  ['top-left', 'Top left'],
  ['top-right', 'Top right'],
  ['bottom-left', 'Bottom left'],
  ['bottom-right', 'Bottom right'],
  ['center', 'Centre'],
];

function switchRow(settings, key, title, subtitle) {
  const row = new Adw.SwitchRow({title, subtitle: subtitle ?? ''});
  settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
  return row;
}

export default class MathClockPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();
    window._settings = settings;

    const page = new Adw.PreferencesPage({title: 'Math Clock', icon_name: 'preferences-system-time-symbolic'});
    window.add(page);

    // Riddles
    const riddles = new Adw.PreferencesGroup({title: 'Riddles'});
    page.add(riddles);

    const level = new Adw.ComboRow({title: 'Difficulty', model: Gtk.StringList.new(LEVELS)});
    level.selected = settings.get_int('level') - 1;
    level.connect('notify::selected', () => settings.set_int('level', level.selected + 1));
    riddles.add(level);

    riddles.add(switchRow(settings, 'twelve-hour', '12-hour clock', 'The hour riddle solves to 1–12 instead of 0–23'));
    riddles.add(
      switchRow(settings, 'auto-reveal', 'Reveal answers automatically', 'During the last 10 seconds of each minute'),
    );

    const salt = new Adw.EntryRow({title: 'Seed text (optional)'});
    settings.bind('salt', salt, 'text', Gio.SettingsBindFlags.DEFAULT);
    riddles.add(salt);

    // Top bar
    const panel = new Adw.PreferencesGroup({title: 'Top bar'});
    page.add(panel);
    panel.add(switchRow(settings, 'show-in-panel', 'Show riddles in the top bar'));
    panel.add(
      switchRow(
        settings,
        'hide-system-clock',
        'Replace the system clock',
        'Hides the normal clock. Notifications and the calendar are hidden with it.',
      ),
    );

    // Desktop
    const desktop = new Adw.PreferencesGroup({title: 'Desktop'});
    page.add(desktop);
    const showDesktop = switchRow(
      settings,
      'show-on-desktop',
      'Show clock on the desktop',
      'Click it to show or hide the answers',
    );
    desktop.add(showDesktop);

    const position = new Adw.ComboRow({
      title: 'Position',
      model: Gtk.StringList.new(POSITIONS.map(([, label]) => label)),
    });
    position.selected = Math.max(
      0,
      POSITIONS.findIndex(([id]) => id === settings.get_string('desktop-position')),
    );
    position.connect('notify::selected', () =>
      settings.set_string('desktop-position', POSITIONS[position.selected][0]),
    );
    desktop.add(position);

    const fontSize = Adw.SpinRow.new_with_range(16, 200, 2);
    fontSize.title = 'Font size';
    fontSize.subtitle = 'In pixels';
    settings.bind('desktop-font-size', fontSize, 'value', Gio.SettingsBindFlags.DEFAULT);
    desktop.add(fontSize);

    for (const row of [position, fontSize])
      showDesktop.bind_property('active', row, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
  }
}
