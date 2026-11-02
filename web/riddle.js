/*
 * Math-clock riddle generator.
 * Plain script (no modules) so the same file works in a browser via <script>,
 * in Node via require(), and can be copied into a GNOME Shell extension later.
 */
(function (root) {
  'use strict';

  const MAX = 99; // every number shown (and every intermediate result) stays in 0..99
  const MIN_ADD = 2; // smallest operand for + and - (avoids dull "1 + 1 + 5")

  // pointFirst: when a riddle mixes × ÷ with + −, a × ÷ group is written first
  // ("3 × 4 + 5", not "5 + 3 × 4") or, where that is impossible, put in brackets
  // ("20 − (3 × 4)"), so nobody needs to know the precedence rule.
  const LEVELS = {
    1: {
      name: 'Easy',
      description: 'Easy (1 step, + −)',
      opCount: {min: 1, max: 1},
      operators: ['+', '-'],
      maxFactor: 10,
      parens: false,
    },
    2: {
      name: 'Medium',
      description: 'Medium (2 steps, + − ×)',
      opCount: {min: 2, max: 2},
      operators: ['+', '-', '*'],
      maxFactor: 10,
      parens: false,
      pointFirst: true,
      require: ['*'],
      weights: {'*': 3},
    },
    3: {
      name: 'Hard',
      description: 'Hard (2–3 steps, all operators)',
      opCount: {min: 2, max: 3},
      operators: ['+', '-', '*', '/'],
      maxFactor: 12,
      parens: true,
      pointFirst: true,
      require: ['*', '/'],
      weights: {'*': 2, '/': 2},
    },
    4: {
      name: 'Expert',
      description: 'Expert (3 steps, all operators)',
      opCount: {min: 3, max: 3},
      operators: ['+', '-', '*', '/'],
      maxFactor: MAX,
      parens: true,
      require: ['*', '/'],
      weights: {'*': 3, '/': 3},
    },
  };

  const PREC = {'+': 1, '-': 1, '*': 2, '/': 2};
  const POINT = ['*', '/'];
  const SYMBOL = {'+': '+', '-': '−', '*': '×', '/': '÷'};

  // --- Entropy -------------------------------------------------------------

  // FNV-1a: turns the seed string (salt + minute + line + level) into 32 bits.
  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // mulberry32: tiny seeded PRNG, so a given seed always yields the same riddle.
  function makeRng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = int(0, i);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    // Weighted shuffle: heavier operators tend to be tried first.
    const weightedOrder = (items, weights) => {
      const pool = items.slice();
      const out = [];
      while (pool.length) {
        const total = pool.reduce((s, x) => s + ((weights && weights[x]) || 1), 0);
        let r = next() * total;
        let i = 0;
        while ((r -= (weights && weights[pool[i]]) || 1) > 0) i++;
        out.push(pool.splice(i, 1)[0]);
      }
      return out;
    };
    return {next, int, shuffle, weightedOrder};
  }

  // --- Generation (work backwards from the answer) ------------------------

  // Split `value` into [a, b] so that a <op> b === value, or null if impossible.
  // Trivial forms (x+0, x-0, x*1, x/1, x*0, 0/x) are never produced.
  function split(value, op, levelConfig, rng) {
    switch (op) {
      case '+': {
        if (value < 2 * MIN_ADD) return null;
        const a = rng.int(MIN_ADD, value - MIN_ADD);
        return [a, value - a];
      }
      case '-': {
        if (value > MAX - MIN_ADD) return null;
        const b = rng.int(MIN_ADD, MAX - value);
        return [value + b, b];
      }
      case '*': {
        const pairs = [];
        for (let f = 2; f <= levelConfig.maxFactor && f <= value; f++) {
          const g = value / f;
          if (Number.isInteger(g) && g >= 2 && g <= levelConfig.maxFactor) pairs.push([f, g]);
        }
        return pairs.length ? pairs[rng.int(0, pairs.length - 1)] : null;
      }
      case '/': {
        if (value < 1) return null;
        const maxB = Math.min(levelConfig.maxFactor, Math.floor(MAX / value));
        if (maxB < 2) return null;
        const b = rng.int(2, maxB);
        return [value * b, b];
      }
    }
    return null;
  }

  // Grow an expression tree: start with the answer as a single leaf and
  // repeatedly replace a random leaf by an operation that evaluates to it.
  function attempt(target, levelConfig, rng) {
    const nOps = rng.int(levelConfig.opCount.min, levelConfig.opCount.max);
    const root = {v: target};
    const leaves = [root];
    for (let i = 0; i < nOps; i++) {
      let grown = false;
      // Choose the operator first, then any leaf that can take it, so the
      // weights really steer which operators show up.
      for (const op of rng.weightedOrder(levelConfig.operators, levelConfig.weights)) {
        for (const leaf of rng.shuffle(leaves.slice())) {
          const parts = split(leaf.v, op, levelConfig, rng);
          if (!parts) continue;
          leaf.op = op;
          leaf.left = {v: parts[0]};
          leaf.right = {v: parts[1]};
          leaves.splice(leaves.indexOf(leaf), 1, leaf.left, leaf.right);
          grown = true;
          break;
        }
        if (grown) break;
      }
      if (!grown) return null;
    }
    return {root, leaves};
  }

  // Render with the minimum parentheses needed under normal precedence rules.
  // Same-precedence right operands are bracketed unless associative (a+b+c, a*b*c),
  // so reading left to right never passes through a value outside 0..99.
  // With `pointFirst`, a × ÷ group to the right of + − is bracketed as well.
  function render(node, ascii, pointFirst) {
    if (!node.op) return String(node.v);
    const wrap = (child, isRight) => {
      const s = render(child, ascii, pointFirst);
      if (!child.op) return s;
      const lower = PREC[child.op] < PREC[node.op];
      const sameRight =
        isRight && PREC[child.op] === PREC[node.op] && !(child.op === node.op && (node.op === '+' || node.op === '*'));
      const pointRight = pointFirst && isRight && PREC[child.op] > PREC[node.op];
      return lower || sameRight || pointRight ? `(${s})` : s;
    };
    const sym = ascii ? node.op : SYMBOL[node.op];
    return `${wrap(node.left, false)} ${sym} ${wrap(node.right, true)}`;
  }

  // Swap the operands of + so the side holding × ÷ is written first ("5 + 3 × 4"
  // becomes "3 × 4 + 5"). − can't be swapped; render() brackets those instead.
  function pointToFront(node) {
    if (!node.op) return;
    pointToFront(node.left);
    pointToFront(node.right);
    if (node.op === '+' && hasOp(node.right, POINT) && !hasOp(node.left, POINT)) {
      [node.left, node.right] = [node.right, node.left];
    }
  }

  function acceptable(result, target, levelConfig) {
    // Only brackets forced by precedence count here, not the pointFirst ones.
    if (!levelConfig.parens && render(result.root, true).includes('(')) return false;
    // Don't give the answer away as one of the operands.
    if (result.leaves.some((l) => l.v === target)) return false;
    // Harder levels must contain at least one of their "interesting" operators.
    if (levelConfig.require && !hasOp(result.root, levelConfig.require)) return false;
    return true;
  }

  function hasOp(node, ops) {
    return !!node.op && (ops.includes(node.op) || hasOp(node.left, ops) || hasOp(node.right, ops));
  }

  function generate(target, levelConfig, rng) {
    for (let i = 0; i < 300; i++) {
      const r = attempt(target, levelConfig, rng);
      if (r && levelConfig.pointFirst) pointToFront(r.root);
      if (r && acceptable(r, target, levelConfig)) return r.root;
    }
    // Rare fallback: relax the rules step by step rather than show nothing.
    const relaxed = Object.assign({}, levelConfig, {parens: true, require: null, operators: ['+', '-', '*', '/']});
    for (let i = 0; i < 300; i++) {
      const r = attempt(target, relaxed, rng);
      if (r && acceptable(r, target, relaxed)) return r.root;
    }
    return attempt(target, Object.assign({}, relaxed, {opCount: {min: 1, max: 1}}), rng).root;
  }

  // --- Public API ----------------------------------------------------------

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function minuteKey(date) {
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
  }

  // --- Clock rules shared by every front end -------------------------------

  const DEFAULT_LEVEL = 2;
  const REVEAL_SECONDS = 10; // auto-reveal window at the end of each minute

  function isRevealWindow(seconds) {
    return seconds >= 60 - REVEAL_SECONDS;
  }

  // Fraction of the current minute that has elapsed (the bar is full at :59).
  function progress(seconds) {
    return (seconds + 1) / 60;
  }

  // Minutes are zero-padded ("= 05"), hours are not ("= 5").
  function formatAnswer(value, isMinutes) {
    return '= ' + (isMinutes ? pad(value) : value);
  }

  // Coerce loosely-typed settings (URL params, GSettings) into a known-good shape.
  function normalizeSettings(raw) {
    raw = raw || {};
    const level = Number(raw.level);
    return {
      level: LEVELS[level] ? level : DEFAULT_LEVEL,
      twelveHour: !!raw.twelveHour,
      autoReveal: !!raw.autoReveal,
      salt: raw.salt == null ? '' : String(raw.salt),
    };
  }

  function riddle(target, level, seedString) {
    const levelConfig = LEVELS[level] || LEVELS[DEFAULT_LEVEL];
    const rng = makeRng(hashString(seedString));
    const tree = generate(target, levelConfig, rng);
    const pointFirst = !!levelConfig.pointFirst;
    return {value: target, text: render(tree, false, pointFirst), ascii: render(tree, true, pointFirst)};
  }

  /**
   * Riddles for a given moment. Deterministic: same date + level + salt
   * always gives the same riddles (handy for syncing several displays).
   */
  function riddlesFor(date, opts) {
    opts = opts || {};
    const level = opts.level || DEFAULT_LEVEL;
    const salt = opts.salt || '';
    let hours = date.getHours();
    if (opts.twelveHour) hours = hours % 12 || 12;
    const key = `${salt}|${minuteKey(date)}|L${level}`;
    return {
      hours: riddle(hours, level, key + '|h'),
      minutes: riddle(date.getMinutes(), level, key + '|m'),
    };
  }

  const api = {
    LEVELS,
    MAX,
    REVEAL_SECONDS,
    riddle,
    riddlesFor,
    hashString,
    makeRng,
    render,
    isRevealWindow,
    progress,
    formatAnswer,
    normalizeSettings,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MathClock = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
