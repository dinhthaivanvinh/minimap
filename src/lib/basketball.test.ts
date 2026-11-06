import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aimAt,
  targetWidth,
  targetCenter,
  AIM_PERIOD,
  replay,
  shoot,
  EMPTY_RESULT,
  rank,
  weekKey,
  MAX_ROUND_SCORE,
} from '../../shared/basketball.ts';

test('slower meter, random targets, streak bonuses and server replay agree', () => {
  assert.equal(aimAt(600, 0), 0.5);
  assert.equal(aimAt(1800, 0), 0.5);
  assert.equal(aimAt(2400, 0), 0);
  const shots: number[] = [];
  let result = EMPTY_RESULT;
  for (let i = 0; i < 12; i++) {
    let ms = (shots.at(-1) ?? -450) + 450;
    while (Math.abs(aimAt(ms, 0) - targetCenter(0, result.attempts)) > 0.005) ms++;
    shots.push(ms);
    result = shoot(result, ms, 0);
    assert.equal(result.hit, true);
  }
  assert.deepEqual(replay(shots, 0), result);
  assert.equal(result.attempts, 12);
  assert.equal(result.streak, 12);
  assert.ok(result.score > 24);
  const miss = shoot(result, Math.ceil(shots.at(-1)! / AIM_PERIOD) * AIM_PERIOD, 0);
  assert.equal(miss.streak, 0);
  assert.equal(miss.attempts, 13);
});
test('forgiving target offers a 408ms opening window and at least 216ms in streaks', () => {
  const center = targetCenter(0, 0) * 1200;
  assert.equal(shoot(EMPTY_RESULT, Math.round(center + 200), 0).hit, true);
  assert.equal(shoot(EMPTY_RESULT, Math.round(center + 206), 0).hit, false);
  const combo = { ...EMPTY_RESULT, streak: 20 };
  assert.equal(targetWidth(combo.streak), 0.18);
  assert.equal(shoot(combo, Math.round(center + 105), 0).hit, true);
  assert.equal(shoot(combo, Math.round(center + 111), 0).hit, false);
});
test('targets vary per attempt, stay inside the meter and reproduce from the signed seed', () => {
  for (const seed of [0, 1, 12345, 0xffffffff]) {
    const positions = Array.from({ length: 100 }, (_, attempt) => targetCenter(seed, attempt));
    assert.ok(new Set(positions).size > 95);
    for (let attempt = 0; attempt < positions.length; attempt++) {
      const center = positions[attempt]!;
      assert.equal(center, targetCenter(seed, attempt));
      if (attempt > 0) assert.ok(Math.abs(center - positions[attempt - 1]!) >= 0.14);
      assert.ok(center - targetWidth(0) / 2 >= 0 && center + targetWidth(0) / 2 <= 1);
    }
  }
  assert.notEqual(targetCenter(1, 0), targetCenter(2, 0));
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

test('backup score cap preserves existing records and bounds any cadence-valid round', () => {
  assert.ok(MAX_ROUND_SCORE >= 667);
  const shots = Array.from({ length: Math.ceil(60000 / 450) }, (_, i) => i * 450);
  for (const seed of [0, 300, 12345, 0xffffffff]) assert.ok(replay(shots, seed).score <= MAX_ROUND_SCORE);
});
