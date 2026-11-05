import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARACTER_ASPECT,
  CHUTE,
  clawWidth,
  CLAW_GRIP,
  createDraw,
  FLOOR_Y,
  MAX_SHOWN,
  PHASES,
  pickIndex,
  prizeFoot,
  RAIL_Y,
  totalDuration,
  TRAY,
  trayLayout,
  travelY,
} from './picker.ts';

// The same "random" numbers every run.
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function seededUint32(seed: number) {
  const next = seeded(seed);
  return () => Math.floor(next() * 0x1_0000_0000);
}

const team = (count: number) => Array.from({ length: count }, (_, i) => `member${i + 1}`);

test('every member is equally likely to win', () => {
  const counts = new Array(6).fill(0);
  const next = seededUint32(11);
  const draws = 60_000;
  for (let i = 0; i < draws; i++) counts[pickIndex(6, next)]++;
  for (const count of counts) assert.ok(Math.abs(count - draws / 6) < draws * 0.01, `counts were ${counts.join(', ')}`);
});

test('values that would favour some members are thrown away', () => {
  // 2^32 is not a multiple of 3, so the very top value would make index 0 a little more likely.
  const values = [0xffff_ffff, 0xffff_fffe];
  assert.equal(pickIndex(3, () => values.shift()!), 0xffff_fffe % 3);
  assert.equal(values.length, 0, 'the top value was skipped');
  assert.throws(() => pickIndex(0));
});

test('the claw wandering never changes who wins', () => {
  const pool = team(9);
  for (let seed = 1; seed < 40; seed++) {
    const a = createDraw(pool, { nextUint32: seededUint32(seed), random: seeded(1) });
    const b = createDraw(pool, { nextUint32: seededUint32(seed), random: seeded(999) });
    assert.equal(a.winner, b.winner);
    assert.notDeepEqual(a.steps, b.steps, 'the claw takes a different path');
  }
});

test('previous winners can win again', () => {
  const pool = team(2);
  const next = seededUint32(5);
  const winners = new Set(Array.from({ length: 50 }, () => createDraw(pool, { nextUint32: next }).winner));
  assert.equal(winners.size, 2);
});

test('the draw lasts five to seven seconds and plays its phases in order', () => {
  for (let seed = 1; seed < 60; seed++) {
    for (const size of [1, 2, 5, 15, 40]) {
      const draw = createDraw(team(size), { random: seeded(seed) });
      const total = totalDuration(draw.steps);
      assert.ok(total >= 5000 && total <= 7000, `took ${total}ms`);
      const order = draw.steps.map((step) => PHASES.indexOf(step.phase));
      assert.deepEqual(order, [...order].sort((x, y) => x - y));
      for (const phase of PHASES.slice(1)) assert.ok(draw.steps.some((step) => step.phase === phase), `has ${phase}`);
      assert.equal(draw.steps.at(-1)?.phase, 'completed');
    }
  }
});

test('the claw grabs the winner, lifts it and drops it in the chute', () => {
  const draw = createDraw(team(8), { nextUint32: seededUint32(3), random: seeded(4) });
  const slot = draw.layout.slots[draw.winnerSlot]!;
  assert.equal(draw.shown[draw.winnerSlot], draw.winner);

  const closed = draw.steps.findIndex((step) => !step.open);
  const grab = draw.steps[closed]!;
  assert.equal(grab.x, slot.x);
  assert.equal(grab.prize, 'tray');
  const middle = slot.foot - (draw.layout.size * CHARACTER_ASPECT) / 2;
  assert.ok(Math.abs(grab.y - middle) < 1e-9, 'the claw closes around the middle of the character');

  const lift = draw.steps[closed + 1]!;
  assert.equal(lift.prize, 'claw');
  assert.ok(Math.abs(prizeFoot(grab, slot, draw.layout.size).foot - slot.foot) < 1e-9);
  assert.ok(Math.abs(prizeFoot({ ...lift, y: grab.y }, slot, draw.layout.size).foot - slot.foot) < 1e-9, 'no jump when picked up');

  const drop = draw.steps.find((step) => step.prize === 'chute')!;
  assert.equal(drop.x, CHUTE.x);
  assert.ok(drop.open);
  assert.ok(draw.steps.filter((step) => step.prize === 'claw').every((step) => !step.open), 'held tight while carried');
});

test('a big pool shows a handful of characters, always with the winner', () => {
  const pool = team(40);
  for (let seed = 1; seed < 30; seed++) {
    const draw = createDraw(pool, { nextUint32: seededUint32(seed), random: seeded(seed) });
    assert.equal(draw.shown.length, MAX_SHOWN);
    assert.ok(draw.shown.includes(draw.winner));
    assert.equal(new Set(draw.shown).size, MAX_SHOWN);
  }
});

test('characters fit in the tray without overlapping, and the claw passes over them', () => {
  for (let count = 1; count <= MAX_SHOWN; count++) {
    const { size, slots } = trayLayout(count);
    assert.equal(slots.length, count);
    const height = size * CHARACTER_ASPECT;
    const clawBottom = travelY(size) + clawWidth(size) * (1 - CLAW_GRIP);
    for (const [i, a] of slots.entries()) {
      assert.ok(a.x - size / 2 >= TRAY.left && a.x + size / 2 <= TRAY.right, `${count}: slot ${i} is inside the tray`);
      assert.ok(a.foot <= FLOOR_Y && a.foot - height > RAIL_Y);
      assert.ok(a.foot - height > clawBottom, `${count}: the travelling claw clears slot ${i}`);
      for (const b of slots.slice(i + 1)) {
        const apart = Math.abs(a.x - b.x) >= size || Math.abs(a.foot - b.foot) >= height;
        assert.ok(apart, `${count}: slots overlap`);
      }
    }
  }
});
