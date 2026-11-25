import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule, parseCategory, parseRanges } from '../scripts/lib/wiki.mjs';

const ALL = Array(12).fill(true);

test('parseRanges handles all day, wrapping and multiple ranges', () => {
  assert.deepEqual(parseRanges('All day'), [[0, 24]]);
  assert.deepEqual(parseRanges('4pm - 9am'), [[16, 9]]);
  assert.deepEqual(parseRanges('9am - 4pm & 9pm - 4am'), [[9, 16], [21, 4]]);
  assert.deepEqual(parseRanges('12am - 12pm'), [[0, 12]]);
});

test('buildSchedule applies seasonal times and leaves unavailable months empty', () => {
  const months = [false, false, true, true, true, true, false, false, true, true, true, false];
  const schedule = buildSchedule('<small>4pm - 9am (Mar-Jun)\nAll day (Sep-Nov)</small>', months);
  assert.equal(schedule[0], null);
  assert.deepEqual(schedule[2], [[16, 9]]);
  assert.deepEqual(schedule[5], [[16, 9]]);
  assert.deepEqual(schedule[9], [[0, 24]]);
  assert.equal(schedule[11], null);
  assert.deepEqual(buildSchedule('All day', ALL)[6], [[0, 24]]);
});

const row = (hemi, name, months, extra = '') => `{{TableContent|type=fish${hemi === 'south' ? '|hemi=south' : ''}
| ${name}
| [[File:NH-Icon-${extra || 'x'}.png|64px]]
| 1,500
| Sea
| 6 (Fin)
| <small>All day</small>
${months.map((m) => `| ${m ? '✓' : '-'}`).join('\n')}
}}`;

test('parseCategory merges hemispheres by icon even when labels differ', () => {
  const north = [true, ...Array(11).fill(false)];
  const south = [...Array(6).fill(false), true, ...Array(5).fill(false)];
  const text = [
    row('north', '[[Clownfish|Clown fish]]', north, 'clownfish'),
    row('north', '[[Suckerfish]]', north, 'suckerfish'),
    row('south', '[[Clownfish]]', south, 'clownfish'),
    row('south', '[[Suckerfish]]', south, 'suckerfish'),
  ].join('\n\n');
  const [clown, sucker] = parseCategory('fish', text);
  assert.equal(clown.id, 'fish-clown-fish');
  assert.equal(clown.name, 'Clown fish');
  assert.equal(clown.page, 'Clownfish');
  assert.equal(clown.price, 1500);
  assert.equal(clown.shadow, 'Huge with fin');
  assert.equal(sucker.shadow, 'Medium with fin');
  assert.deepEqual(clown.schedule.north[0], [[0, 24]]);
  assert.equal(clown.schedule.south[0], null);
  assert.deepEqual(clown.schedule.south[6], [[0, 24]]);
  assert.deepEqual([clown.number, sucker.number], [1, 2]);
});

test('parseCategory fails loudly when a hemisphere is missing', () => {
  assert.throws(() => parseCategory('fish', row('north', '[[Koi]]', ALL)), /missing southern/);
});
