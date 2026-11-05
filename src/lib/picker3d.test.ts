import test from 'node:test';
import assert from 'node:assert/strict';
import { BODY_CENTER_Y } from './drawing.ts';
import { createDraw, MAX_SHOWN, trayLayout } from './picker.ts';
import {
  CHARACTER_HEIGHT,
  characterScale,
  clawPose,
  clawSize,
  ease,
  FRONT_Z,
  prizePose,
  ROW_DEPTH,
  rowZ,
  slotPose,
} from './picker3d.ts';

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

const team = (count: number) => Array.from({ length: count }, (_, i) => `member${i + 1}`);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test('the 3D claw closes around the middle of the winner, in whichever row they stand', () => {
  for (let seed = 1; seed < 40; seed++) {
    const draw = createDraw(team(12), { random: seeded(seed), nextUint32: () => seed * 7919 });
    const grab = draw.steps.find((step) => !step.open)!;
    const claw = clawPose(grab, draw.layout);
    const spot = slotPose(draw.layout, draw.winnerSlot);
    assert.ok(near(claw.x, spot.x) && near(claw.z, spot.z));
    assert.ok(near(claw.y, BODY_CENTER_Y * characterScale(draw.layout.size)));
  }
});

test('the winner moves with the claw without jumping when picked up or dropped', () => {
  const draw = createDraw(team(9), { random: seeded(2), nextUint32: () => 5 });
  const i = draw.steps.findIndex((step) => step.prize === 'claw');
  const before = draw.steps[i - 1]!;
  const lift = draw.steps[i]!;
  // At the start of the lift the claw is still where it grabbed.
  const picked = prizePose({ ...lift, x: before.x, y: before.y, slot: before.slot }, draw.layout, draw.winnerSlot);
  const resting = prizePose(before, draw.layout, draw.winnerSlot);
  assert.ok(near(picked.x, resting.x) && near(picked.y, resting.y) && near(picked.z, resting.z));

  const dropped = prizePose(draw.steps.at(-1)!, draw.layout, draw.winnerSlot);
  assert.deepEqual(dropped, { x: clawPose(draw.steps.at(-1)!, draw.layout).x, y: 0, z: FRONT_Z });
});

test('the travelling claw clears every character in 3D', () => {
  for (let count = 1; count <= MAX_SHOWN; count++) {
    const layout = trayLayout(count);
    const draw = createDraw(team(count), { random: seeded(count) });
    const tallest = CHARACTER_HEIGHT * characterScale(layout.size);
    for (const step of draw.steps) {
      if (step.phase !== 'searching' && step.phase !== 'delivering') continue;
      const tips = clawPose(step, draw.layout).y - clawSize(layout.size) * 0.4;
      assert.ok(tips > tallest, `${count}: the claw's fingers are at ${tips.toFixed(2)}, people are ${tallest.toFixed(2)} tall`);
    }
  }
});

test('rows stand one behind another', () => {
  assert.equal(rowZ(0), FRONT_Z);
  assert.equal(rowZ(2), FRONT_Z - 2 * ROW_DEPTH);
});

test('easing starts at rest and arrives exactly', () => {
  for (const kind of ['move', 'drop'] as const) {
    assert.equal(ease(kind, 0), 0);
    assert.equal(ease(kind, 1), 1);
    assert.equal(ease(kind, 2), 1);
  }
  assert.ok(ease('drop', 0.5) < 0.5, 'falls speed up');
});
