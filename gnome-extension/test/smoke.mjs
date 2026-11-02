// Run: node --import ./register.mjs smoke.mjs   (after ../build.sh has generated ../web/riddle.js)
import assert from 'node:assert/strict';
import {Main, GLib, log} from './mocks.mjs';
import MathClockExtension from '../extension.js';
import MathClockPreferences from '../prefs.js';

const ext = new MathClockExtension({uuid: 'mathclock@cbandera.github.io'});
const bg = Main.layoutManager._backgroundGroup;
const date = Main.panel.statusArea.dateMenu.container;

for (let round = 0; round < 2; round++) {
  // enable/disable twice: must leave no traces
  ext.enable();
  assert.equal(GLib.timers.size, 1, 'one tick timer');
  assert.equal(Main.panel.boxes.right.length, 1, 'indicator in right box');
  assert.equal(bg.children.length, 1, 'desktop widget added');

  const ind = Main.panel.boxes.right[0];
  console.log('panel label:', ind._label.text);
  assert.match(ind._label.text, /^\S+ : \S+$/);
  for (const fn of GLib.timers.values()) fn(); // a tick

  // Riddles in the menu evaluate to the current time.
  const now = new Date();
  const val = (t) => Function(`return ${t.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')}`)();
  const h = val(ind._riddleLines.hour.expr.text),
    m = val(ind._riddleLines.minute.expr.text);
  console.log(
    `menu: ${ind._riddleLines.hour.expr.text} ${ind._riddleLines.hour.answer.text} | ${ind._riddleLines.minute.expr.text} ${ind._riddleLines.minute.answer.text}`,
  );
  assert.equal(h, now.getHours());
  assert.equal(m, now.getMinutes());

  // Manual reveal shows answers in menu and on the desktop.
  ext.setReveal(true);
  assert.equal(ind._riddleLines.hour.answer.opacity, 255);
  assert.equal(ext._desktop._riddleLines.hour.answer.opacity, 255);
  assert.equal(ind._revealSwitch.state, true);
  ext.setReveal(false);

  // Desktop widget placed top-right inside the work area.
  const d = ext._desktop.actor;
  d.emit('notify::width');
  assert.equal(d.x, 1920 - 300 - 48);
  assert.equal(d.y, 32 + 48);

  // Changing difficulty via the menu rebuilds with the new level.
  const levelItem = ext._indicator._levelItems.find(([n]) => n === 4)[1];
  levelItem.emit('activate');
  assert.equal(ext.settings.get_int('level'), 4);
  assert.equal(Main.panel.boxes.right.length, 1, 'old indicator removed on rebuild');
  assert.equal(bg.children.length, 1, 'old desktop widget removed on rebuild');
  assert.match(ext._indicator._levelMenu.label.text, /Expert/);
  console.log('expert panel label:', ext._indicator._label.text);

  // Replace system clock: indicator moves to centre, date menu hidden.
  ext.settings.set_boolean('hide-system-clock', true);
  assert.equal(Main.panel.boxes.center.length, 1);
  assert.equal(Main.panel.boxes.right.length, 0);
  assert.equal(date.visible, false);

  // Desktop off, bottom-left position.
  ext.settings.set_string('desktop-position', 'bottom-left');
  ext._desktop.actor.emit('notify::height');
  assert.equal(ext._desktop.actor.x, 48);
  assert.equal(ext._desktop.actor.y, 32 + 1048 - 120 - 48);
  ext.settings.set_boolean('show-on-desktop', false);
  assert.equal(bg.children.length, 0);

  ext._indicator.menu.items.at(-1).emit('activate'); // "Settings"
  assert.equal(log.at(-1), 'prefs');

  ext.disable();
  assert.equal(GLib.timers.size, 0, 'timer removed');
  assert.equal(Main.panel.boxes.center.length + Main.panel.boxes.right.length, 0, 'indicator removed');
  assert.equal(bg.children.length, 0, 'desktop widget removed');
  assert.equal(date.visible, true, 'system clock restored');

  // reset settings for the next round
  ext._settings.v = {
    ...ext._settings.v,
    level: 2,
    'hide-system-clock': false,
    'show-on-desktop': true,
    'desktop-position': 'top-right',
  };
}

// Preferences window builds without errors.
const win = {
  children: [],
  add(p) {
    this.children.push(p);
  },
};
new MathClockPreferences().fillPreferencesWindow(win);
const groups = win.children[0].children;
assert.equal(groups.length, 3);
console.log('prefs groups:', groups.map((g) => `${g.title} (${g.children.length} rows)`).join(', '));

console.log('\nSmoke test passed');
