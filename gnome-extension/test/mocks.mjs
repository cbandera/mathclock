// Minimal stand-ins for the GNOME Shell / GI APIs the extension touches.
export const log = [];

class Signals {
  connect(name, fn) {
    (this._h ??= {})[name] ??= [];
    this._h[name].push(fn);
    return ++Signals.id;
  }
  disconnect() {}
  emit(name, ...a) {
    for (const fn of this._h?.[name] ?? []) fn(this, ...a);
  }
}
Signals.id = 0;

class Widget extends Signals {
  constructor(props = {}) {
    super();
    Object.assign(this, {children: [], width: 300, height: 120, opacity: 255}, props);
  }
  add_child(c) {
    this.children.push(c);
    c.parent = this;
  }
  remove_child(c) {
    this.children = this.children.filter((x) => x !== c);
  }
  set_child_above_sibling() {}
  set_position(x, y) {
    this.x = x;
    this.y = y;
  }
  ease(p) {
    Object.assign(this, p);
  }
  hide() {
    this.visible = false;
  }
  show() {
    this.visible = true;
  }
  destroy() {
    this.destroyed = true;
    this.parent?.remove_child(this);
  }
}

export const St = {
  Widget,
  BoxLayout: class extends Widget {},
  Label: class extends Widget {
    constructor(p) {
      super({text: '', ...p});
    }
  },
  Bin: Widget,
};
export const Clutter = {
  ActorAlign: {START: 1, CENTER: 2, END: 3},
  Orientation: {VERTICAL: 1},
  AnimationMode: {EASE_OUT_QUAD: 1},
  EVENT_STOP: true,
};
const timers = new Map();
export const GLib = {
  PRIORITY_DEFAULT: 0,
  SOURCE_CONTINUE: true,
  timers,
  timeout_add(_p, _ms, fn) {
    const id = timers.size + 1 + Math.random();
    timers.set(id, fn);
    return id;
  },
  source_remove(id) {
    if (!timers.delete(id)) throw new Error('removed unknown source');
  },
};
export const GObject = {registerClass: (c) => c, BindingFlags: {SYNC_CREATE: 2}};
export const Gio = {SettingsBindFlags: {DEFAULT: 0}};

export class Settings extends Signals {
  constructor(v) {
    super();
    this.v = v;
  }
  get_int(k) {
    return this.v[k];
  }
  get_boolean(k) {
    return this.v[k];
  }
  get_string(k) {
    return this.v[k];
  }
  set(k, x) {
    this.v[k] = x;
    this.emit('changed', k);
  }
  set_int(k, x) {
    this.set(k, x);
  }
  set_string(k, x) {
    this.set(k, x);
  }
  set_boolean(k, x) {
    this.set(k, x);
  }
  bind() {}
}
export const defaults = {
  level: 2,
  'twelve-hour': false,
  'auto-reveal': true,
  salt: '',
  'show-in-panel': true,
  'hide-system-clock': false,
  'show-on-desktop': true,
  'desktop-position': 'top-right',
  'desktop-font-size': 56,
};
export const Extension = {
  Extension: class extends Signals {
    constructor(meta) {
      super();
      this.uuid = meta.uuid;
      this._settings = new Settings({...defaults});
    }
    getSettings() {
      return this._settings;
    }
    openPreferences() {
      log.push('prefs');
    }
  },
};

const backgroundGroup = new Widget();
const dateContainer = new Widget({visible: true});
const panelBoxes = {right: [], center: []};
export const Main = {
  layoutManager: Object.assign(new Signals(), {
    _backgroundGroup: backgroundGroup,
    primaryMonitor: {},
    primaryIndex: 0,
    getWorkAreaForMonitor: () => ({x: 0, y: 32, width: 1920, height: 1048}),
  }),
  panel: {
    statusArea: {dateMenu: {container: dateContainer}},
    boxes: panelBoxes,
    addToStatusArea(role, ind, _pos, box) {
      panelBoxes[box].push(ind);
      ind.parent = {
        remove_child: (c) => {
          panelBoxes[box] = panelBoxes[box].filter((x) => x !== c);
        },
      };
    },
  },
};

class Menu {
  constructor() {
    this.items = [];
  }
  addMenuItem(i) {
    this.items.push(i);
  }
  addAction(t, fn) {
    const i = new PopupMenuItem(t);
    i.connect('activate', fn);
    this.items.push(i);
  }
}
class PopupBaseMenuItem extends Widget {}
class PopupMenuItem extends PopupBaseMenuItem {
  constructor(t) {
    super({label: new St.Label({text: t})});
  }
  setOrnament(o) {
    this.ornament = o;
  }
}
class PopupSwitchMenuItem extends PopupMenuItem {
  setToggleState(s) {
    this.state = s;
  }
}
class PopupSubMenuMenuItem extends PopupMenuItem {
  constructor(t) {
    super(t);
    this.menu = new Menu();
  }
}
export const PopupMenu = {
  PopupBaseMenuItem,
  PopupMenuItem,
  PopupSwitchMenuItem,
  PopupSubMenuMenuItem,
  PopupSeparatorMenuItem: PopupBaseMenuItem,
  Ornament: {NONE: 0, CHECK: 1},
};
export const PanelMenu = {
  Button: class extends Widget {
    constructor(...a) {
      super();
      this.menu = new Menu();
      this._init(...a);
    }
    _init() {}
  },
};

// Adw/Gtk for prefs.js: every class is a generic widget that records what was added.
class AdwWidget extends Widget {
  add(c) {
    this.add_child(c);
  }
  bind_property(src, target, prop) {
    target[prop] = this[src];
  }
  static new_with_range(min, max) {
    return new this({min, max});
  }
}
export const Adw = new Proxy({}, {get: () => AdwWidget});
export const Gtk = {StringList: {new: (items) => ({items})}};
export const Prefs = {
  ExtensionPreferences: class {
    getSettings() {
      return new Settings({...defaults});
    }
  },
};
