import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hopHeight, box, clampTo, contains, grow, MAX_HOP, pickSpot, steer, type Point } from './wander.ts';

// The same "random" numbers every run.
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

const room = box(0, 0, 40, 30);

test('wander spots stay inside the room, a short walk away, and off the furniture', () => {
  const random = seeded(7);
  const desk = box(10, 10, 6, 3);
  for (let i = 0; i < 200; i++) {
    const from = { x: random() * 40, z: random() * 30 };
    const spot = pickSpot(room, from, [], [desk], random);
    assert.ok(spot, 'there is always somewhere to go in an empty room');
    assert.ok(contains(room, spot));
    assert.ok(!contains(desk, spot));
    assert.ok(Math.abs(spot.x - from.x) <= MAX_HOP && Math.abs(spot.z - from.z) <= MAX_HOP);
  }
});

test('wander spots keep away from other people', () => {
  const crowd: Point[] = [{ x: 5, z: 5 }, { x: 8, z: 6 }, { x: 6, z: 9 }];
  const spot = pickSpot(box(0, 0, 30, 30), { x: 15, z: 15 }, crowd, [], seeded(3))!;
  const nearest = Math.min(...crowd.map((p) => Math.hypot(p.x - spot.x, p.z - spot.z)));
  assert.ok(nearest > 8, `nearest person is ${nearest.toFixed(1)} away`);
});

test('there is nowhere to go when the whole room is furniture', () => {
  assert.equal(pickSpot(room, { x: 5, z: 5 }, [], [grow(room, 1)], seeded(1)), null);
});

test('with nothing in the way, people walk straight at their goal', () => {
  const dir = steer({ x: 0, z: 0 }, { x: 3, z: 4 }, [], 1.5);
  assert.ok(Math.abs(dir.x - 0.6) < 1e-9 && Math.abs(dir.z - 0.8) < 1e-9);
  assert.deepEqual(steer({ x: 2, z: 2 }, { x: 2, z: 2 }, [], 1.5), { x: 0, z: 0 });
});

test('walking around a desk in the way reaches the other side without going through it', () => {
  const desk = box(-3, 4, 6, 2);
  const goal = { x: 0.3, z: 12 };
  const at = { x: 0, z: 0 };
  for (let i = 0; i < 400 && Math.hypot(goal.x - at.x, goal.z - at.z) > 0.2; i++) {
    const dir = steer(at, goal, [desk], 1.4);
    at.x += dir.x * 0.1;
    at.z += dir.z * 0.1;
    assert.ok(!contains(desk, at), `walked into the desk at ${at.x.toFixed(2)}, ${at.z.toFixed(2)}`);
  }
  assert.ok(Math.hypot(goal.x - at.x, goal.z - at.z) <= 0.2, 'got there');
});

test('clamping keeps people inside, and a room shrunk to nothing keeps them in its middle', () => {
  assert.deepEqual(clampTo(room, { x: -5, z: 50 }), { x: 0, z: 30 });
  assert.deepEqual(clampTo(grow(box(0, 0, 2, 2), -3), { x: 9, z: -9 }), { x: 1, z: 1 });
});

test('a happy hop goes up once and lands where it started', () => {
  assert.equal(hopHeight(0, 0.6), 0);
  assert.equal(hopHeight(0.3, 0.6), 1.4, 'highest halfway');
  assert.ok(hopHeight(0.15, 0.6) > 0 && hopHeight(0.15, 0.6) < 1.4);
  assert.equal(hopHeight(0.6, 0.6), 0);
  assert.equal(hopHeight(5, 0.6), 0, 'and stays down');
});
