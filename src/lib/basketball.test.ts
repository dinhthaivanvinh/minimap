import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aimAt,
  targetWidth,
  replay,
  shoot,
  EMPTY_RESULT,
  rank,
  weekKey,
  MAX_ROUND_SCORE,
} from '../../shared/basketball.ts';

test('meter reverses, streaks narrow the target, and every third basket adds a bonus', () => {
  assert.equal(aimAt(300, 0), 0.5);
  assert.equal(aimAt(900, 0), 0.5);
  assert.equal(aimAt(1200, 0), 0);
  const result = replay([300, 900, 1500], 0);
  assert.deepEqual(result, { hit: true, made: 3, streak: 3, score: 7 });
  assert.equal(shoot(result, 1800, 0).streak, 0);
  assert.equal(shoot(result, 1800, 0).score, 7);
  assert.ok(targetWidth(3) < targetWidth(0));
  assert.equal(targetWidth(100), 0.08);
  assert.equal(EMPTY_RESULT.score, 0);
});
test('harder timing allows a 144ms opening window and narrows to 48ms for long streaks', () => {
  assert.equal(shoot(EMPTY_RESULT, 229, 0).hit, true);
  assert.equal(shoot(EMPTY_RESULT, 371, 0).hit, true);
  assert.equal(shoot(EMPTY_RESULT, 227, 0).hit, false);
  assert.equal(shoot(EMPTY_RESULT, 373, 0).hit, false);
  const combo = { ...EMPTY_RESULT, streak: 8 };
  assert.equal(shoot(combo, 277, 0).hit, true);
  assert.equal(shoot(combo, 275, 0).hit, false);
  assert.equal(shoot(EMPTY_RESULT, 400, 0).hit, false);
});
test('replay rejects impossible cadence, malformed input and shots outside the round', () => {
  for (const shots of [null, {}, [0, 1], [-1], [60000], [1.5], [NaN], [450, 0], Array(140).fill(450)]) {
    assert.throws(() => replay(shots, 0));
  }
  assert.equal(replay([], 0).score, 0);
});
test('weekly periods start Monday UTC across years and ties use earliest result', () => {
  assert.equal(weekKey(new Date('2027-01-03T23:59:59Z')), '2026-12-28');
  assert.equal(weekKey(new Date('2027-01-04T00:00:00Z')), '2027-01-04');
  const rows = [
    { username: 'b', score: 5, at: '2026-11-02' },
    { username: 'a', score: 5, at: '2026-11-01' },
  ];
  assert.equal(rank(rows)[0]?.username, 'a');
  assert.equal(rows[0]?.username, 'b');
});

test('a perfect boundary-to-boundary round reaches the shared backup score cap', () => {
  const shots = [...Array.from({ length: 100 }, (_, i) => i * 600), 59999];
  const result = replay(shots, 300);
  assert.equal(result.made, 101);
  assert.equal(result.score, 667);
  assert.equal(result.score, MAX_ROUND_SCORE);
});
