import {readFileSync} from 'node:fs';
import * as mocks from './mocks.mjs';

const MOCKS = new URL('./mocks.mjs', import.meta.url).href;
const MAP = {
  'gi://St': 'St',
  'gi://Clutter': 'Clutter',
  'gi://GLib': 'GLib',
  'gi://GObject': 'GObject',
  'gi://Gio': 'Gio',
  'gi://Adw': 'Adw',
  'gi://Gtk': 'Gtk',
  'resource:///org/gnome/shell/extensions/extension.js': 'Extension',
  'resource:///org/gnome/shell/ui/main.js': 'Main',
  'resource:///org/gnome/shell/ui/panelMenu.js': 'PanelMenu',
  'resource:///org/gnome/shell/ui/popupMenu.js': 'PopupMenu',
  'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js': 'Prefs',
};

export async function resolve(spec, ctx, next) {
  if (spec in MAP) return {url: `mock:${MAP[spec]}`, shortCircuit: true};
  if (spec.startsWith('gi://') || spec.startsWith('resource://')) throw new Error(`unmocked import ${spec}`);
  return next(spec, ctx);
}

export async function load(url, ctx, next) {
  if (url.startsWith('mock:')) {
    const name = url.slice(5);
    const keys = Object.keys(mocks[name]).filter((k) => /^[A-Za-z_]\w*$/.test(k));
    const names = name === 'Adw' ? [] : keys;
    const source =
      `import * as M from '${MOCKS}'; const ns = M.${name}; export default ns;` +
      names.map((k) => `export const ${k} = ns.${k};`).join('');
    return {format: 'module', source, shortCircuit: true};
  }
  if (url.includes('/gnome-extension/') && !url.includes('/test/') && url.endsWith('.js'))
    return {format: 'module', source: readFileSync(new URL(url)), shortCircuit: true};
  return next(url, ctx);
}
