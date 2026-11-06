// Tests for where the towers of a vote's 3D results go.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { OptionView } from '../../shared/vote.ts';
import { skylineTowers, TOWER_GAP } from './skyline.ts';

const option = (id: string, count: number): OptionView => ({ id, text: id.toUpperCase(), count });

test('towers stand in the order options were added, centred, as tall as their counts', () => {
  const towers = skylineTowers({ options: [option('a', 1), option('b', 4), option('c', 0)], voted: ['x', 'y', 'z', 'w', 'v'] }, false);
  assert.deepEqual(towers.map((t) => t.id), ['a', 'b', 'c']);
  assert.deepEqual(towers.map((t) => t.x), [-TOWER_GAP, 0, TOWER_GAP]);
  assert.equal(towers[1]!.height, 6, 'the most votes reach the top');
  assert.ok(towers[0]!.height > towers[2]!.height && towers[2]!.height > 0, 'an option with no votes is a low step');
  assert.equal(towers.some((t) => t.gold), false, 'nobody has won while the vote is open');
});

test('once closed, the winner, or every tied winner, gets a gold top', () => {
  assert.deepEqual(skylineTowers({ options: [option('a', 2), option('b', 3)], voted: ['x'] }, true).map((t) => t.gold), [false, true]);
  assert.deepEqual(skylineTowers({ options: [option('a', 2), option('b', 2)], voted: ['x'] }, true).map((t) => t.gold), [true, true]);
  assert.deepEqual(skylineTowers({ options: [option('a', 0), option('b', 0)], voted: [] }, true).map((t) => t.gold), [false, false]);
});
