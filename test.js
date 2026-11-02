// Exhaustive check: every hour/minute value at every level, many seeds.
// Run with: node test.js
const assert = require('node:assert/strict');
const {riddle, LEVELS, isRevealWindow, progress, formatAnswer, normalizeSettings} = require('./web/riddle.js');

// Shared clock rules
assert.equal(isRevealWindow(49), false);
assert.equal(isRevealWindow(50), true);
assert.equal(isRevealWindow(59), true);
assert.equal(progress(0), 1 / 60);
assert.equal(progress(59), 1);
assert.equal(formatAnswer(5, true), '= 05');
assert.equal(formatAnswer(5, false), '= 5');
assert.equal(normalizeSettings({level: 9}).level, 2);
assert.equal(normalizeSettings({level: '3'}).level, 3);
assert.equal(normalizeSettings().salt, '');

let failures = 0;
const stats = {};
for (const level of Object.keys(LEVELS)) {
  const cfg = LEVELS[level];
  const s = (stats[cfg.name] = {total: 0, parens: 0, ops: {}, distinct: new Set()});
  for (let target = 0; target <= 59; target++) {
    for (let seed = 0; seed < 200; seed++) {
      const r = riddle(target, Number(level), `test-${seed}`);
      const value = Function(`return (${r.ascii});`)();
      const numbers = r.ascii.match(/\d+/g).map(Number);
      const nOps = (r.ascii.match(/[-+*/]/g) || []).length;
      const ok = value === target && numbers.every((n) => n >= 0 && n <= 99) && nOps >= 1 && nOps <= 3;
      if (!ok) {
        failures++;
        if (failures < 10) console.log('FAIL', cfg.name, target, r.ascii, '=', value);
      }
      s.total++;
      if (r.ascii.includes('(')) s.parens++;
      s.ops[nOps] = (s.ops[nOps] || 0) + 1;
      if (target === 42) s.distinct.add(r.text);
    }
  }
}
for (const [name, s] of Object.entries(stats)) {
  console.log(
    `${name.padEnd(7)} riddles=${s.total} withParens=${s.parens} opCounts=${JSON.stringify(s.ops)} distinctFor42=${s.distinct.size}/200`,
  );
}
for (const level of Object.keys(LEVELS)) {
  console.log(`\n${LEVELS[level].name} samples:`);
  for (const t of [0, 7, 13, 23, 42, 59])
    console.log(`  ${String(t).padStart(2)} = ${riddle(t, Number(level), 'demo').text}`);
}
console.log(failures ? `\n${failures} FAILURES` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
