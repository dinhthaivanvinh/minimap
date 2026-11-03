import test from 'node:test';
import assert from 'node:assert/strict';
import { isOnFace, type Stroke } from '../../shared/look.ts';
import { clampToFace, countPoints, extendStroke, pointPairs, strokePath, surfacePoint } from './drawing.ts';
import { wornStrokes } from './wornItems.ts';

const stroke = (points: number[]): Stroke => ({ color: '#000000', width: 3, points });

test('strokes become SVG paths, and a tap becomes a dot', () => {
  assert.equal(strokePath(stroke([1, 2, 3, 4, 5, 6])), 'M1 2L3 4 5 6');
  assert.equal(strokePath(stroke([1, 2])), 'M1 2h.01');
  assert.equal(strokePath(stroke([])), '');
});

test('points are paired and counted', () => {
  assert.deepEqual(pointPairs(stroke([1, 2, 3, 4])), [[1, 2], [3, 4]]);
  assert.equal(countPoints([stroke([1, 2, 3, 4]), stroke([5, 6])]), 3);
});

test('points on the face stay put, rounded', () => {
  assert.deepEqual(clampToFace(30.26, 40.04), [30.3, 40]);
});

test('points off the face move to its edge, and the server accepts them', () => {
  for (const [x, y] of [[32, -50], [200, 35], [-100, -100], [60, 60], [32, 13], [8, 35.5]] as const) {
    const [cx, cy] = clampToFace(x, y);
    assert.ok(isOnFace(cx, cy), `${x},${y} became ${cx},${cy}`);
  }
  assert.deepEqual(clampToFace(32, -50), [32, 13]);
});

test('hats and other drawings past the face are not allowed', () => {
  assert.equal(isOnFace(32, 36), true);
  assert.equal(isOnFace(32, 5), false);
  assert.equal(isOnFace(2, 36), false);
});

test('points too close to the last one are skipped', () => {
  const start = stroke([10, 10]);
  assert.equal(extendStroke(start, 10.2, 10.2), start);
  assert.deepEqual(extendStroke(start, 12, 10).points, [10, 10, 12, 10]);
});

test('the drawn face lines up with the 3D face', () => {
  const [leftX, leftY, leftZ] = surfacePoint(23, 36);
  const [rightX] = surfacePoint(41, 36);
  assert.ok(Math.abs(leftX + 0.46) < 0.01, 'left eye x');
  assert.ok(Math.abs(rightX - 0.46) < 0.01, 'right eye x');
  assert.ok(Math.abs(leftY - 1.42) < 0.01, 'eye height');
  assert.ok(Math.abs(leftZ - 1.21) < 0.03, 'eye sits on the front of the body');
});

test('glasses and the mustache are only there when worn, and sit on the face', () => {
  assert.deepEqual(wornStrokes([]), []);
  assert.deepEqual(wornStrokes(['hat']), [], 'the hat is a solid shape, not lines');
  const both = wornStrokes(['glasses', 'mustache']);
  assert.equal(both.length, wornStrokes(['glasses']).length + wornStrokes(['mustache']).length);
  for (const line of both) {
    for (const [x, y] of pointPairs(line)) assert.ok(isOnFace(x, y), `${x},${y}`);
  }
});

test('drawings wrap around the 3D body', () => {
  const [, , centerZ] = surfacePoint(32, 39);
  const [, , cheekZ] = surfacePoint(12, 39);
  assert.ok(centerZ > cheekZ, 'the middle of the face is nearest the viewer');
  assert.equal(surfacePoint(32, -200, 0.1)[2], 0.1, 'lift moves a point forward');
});
