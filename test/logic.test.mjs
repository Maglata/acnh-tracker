import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const L = createRequire(import.meta.url)('../public/js/logic.js');
const src = readFileSync(new URL('../public/data/critters.js', import.meta.url), 'utf8');
const { critters } = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
const byCat = (cat) => critters.filter((c) => c.category === cat);
const counts = (cat, hemi, month) => {
  const s = L.monthSections(byCat(cat), hemi, month);
  return [s.available.length, s.new.length, s.leaving.length];
};

test('generated data contains every critter', () => {
  assert.deepEqual(['fish', 'bug', 'sea'].map((c) => byCat(c).length), [80, 80, 40]);
});

test('November sections match the wiki guide pages', () => {
  const NOV = 10;
  assert.deepEqual(counts('sea', 'north', NOV), [25, 5, 3]);
  // The wiki intro says 2, but its own "Leaving after November" table lists 3.
  assert.deepEqual(counts('sea', 'south', NOV), [22, 5, 3]);
  assert.deepEqual(counts('fish', 'north', NOV), [37, 5, 10]);
  assert.deepEqual(counts('fish', 'south', NOV), [44, 8, 3]);
});

test('isAvailableAt handles ranges that wrap past midnight', () => {
  const c = { schedule: { north: Array(12).fill([[16, 9]]) } };
  assert.equal(L.isAvailableAt(c, 'north', 0, 23), true);
  assert.equal(L.isAvailableAt(c, 'north', 0, 3), true);
  assert.equal(L.isAvailableAt(c, 'north', 0, 9), false);
  assert.equal(L.isAvailableAt(c, 'north', 0, 12), false);
});

test('setFlag keeps caught and donated consistent', () => {
  let s = L.defaultState();
  s = L.setFlag(s, 'fish-koi', 'donated', true);
  assert.deepEqual(s.progress['fish-koi'], { caught: true, donated: true });
  s = L.setFlag(s, 'fish-koi', 'caught', false);
  assert.equal(s.progress['fish-koi'], undefined);
});

test('normalizeState validates imports and drops junk entries', () => {
  const s = L.normalizeState({
    app: 'acnh-tracker',
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    settings: { hemisphere: 'south' },
    progress: { a: { donated: true }, b: { caught: true }, c: { caught: false }, d: 'bad' },
  });
  assert.equal(s.settings.hemisphere, 'south');
  assert.deepEqual(s.progress, { a: { caught: true, donated: true }, b: { caught: true } });
  assert.throws(() => L.normalizeState({ app: 'other' }), /not an ACNH tracker export/);
  assert.throws(() => L.normalizeState([]), /expected a JSON object/);
  assert.throws(() => L.normalizeState({ app: 'acnh-tracker', version: 99 }), /newer version/);
});

test('toCsv exports one row per critter with escaped cells', () => {
  const c = { id: 'x', category: 'bug', number: 1, name: 'Bug, "big"', price: 10, location: 'On trees', schedule: { north: Array(12).fill(null) } };
  const csv = L.toCsv([c], L.setFlag(L.defaultState(), 'x', 'caught', true), 'north').split('\n');
  assert.equal(csv[1].startsWith('bug,1,"Bug, ""big""",yes,no,10,On trees,'), true);
});

test('mergeStates keeps the side that changed since the last sync', () => {
  const s = (progress, updatedAt) => ({ ...L.defaultState(), updatedAt, progress });
  const base = s({ a: { caught: true }, b: { caught: true } }, '1');
  const local = s({ a: { caught: true, donated: true }, b: { caught: true } }, '3');
  const remote = s({ b: { caught: true }, c: { caught: true } }, '2');
  // a: donated locally, removed remotely -> both changed, flags combined; c: added remotely.
  assert.deepEqual(L.mergeStates(base, local, remote).progress, {
    a: { caught: true, donated: true },
    b: { caught: true },
    c: { caught: true },
  });
  // Unchecked locally while remote is unchanged -> stays unchecked.
  assert.deepEqual(L.mergeStates(base, s({ b: { caught: true } }, '3'), base).progress, { b: { caught: true } });
});

test('mergeStates without a previous sync never drops progress from either side', () => {
  const s = (progress, updatedAt) => ({ ...L.defaultState(), updatedAt, progress });
  const merged = L.mergeStates(null, s({ x: { caught: true } }, '9'), s({ y: { caught: true, donated: true } }, '1'));
  assert.deepEqual(merged.progress, { x: { caught: true }, y: { caught: true, donated: true } });
  assert.equal(L.sameState(merged, s(merged.progress)), true);
  assert.equal(L.sameState(merged, s({ x: { caught: true } })), false);
});
