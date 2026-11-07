import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSEMBLY_MS, heroGrid, heroPose, heroFormation, officeAssembly } from './assembly.ts';
import type { TeamUser } from '../../shared/types.ts';
const places = [
  { id: 'main', name: 'Main', kind: 'office' as const },
  { id: 'other', name: 'Other', kind: 'office' as const },
];
const user = (name: string, place: string | null): TeamUser => ({
  username: name,
  nickname: name,
  place,
  look: null,
  status: '',
  updatedAt: null,
  claimed: true,
});
test('75% uses the whole team and counts both configured offices, with no empty-team unlock', () => {
  assert.equal(officeAssembly({ places, users: [] }).unlocked, false);
  const users = [user('a', 'main'), user('b', 'other'), user('c', 'main'), user('d', 'wfh')];
  assert.equal(officeAssembly({ places, users }).unlocked, true);
  assert.deepEqual(
    officeAssembly({ places, users }).members.map((u) => u.username),
    ['a', 'b', 'c'],
  );
  users[2]!.place = 'removed-office';
  assert.equal(officeAssembly({ places, users }).unlocked, false);
  assert.equal(officeAssembly({ places, users: [user('a', 'main')] }).unlocked, true);
});
test('small teams round up and unclaimed/offline members still count in the denominator', () => {
  const users = [user('a', 'main'), user('b', 'main'), { ...user('c', null), claimed: false }];
  assert.equal(officeAssembly({ places, users }).required, 3);
  assert.equal(officeAssembly({ places, users }).unlocked, false);
  users[2]!.place = 'other';
  assert.equal(officeAssembly({ places, users }).unlocked, true);
});
test('all office heroes finish their entrances; reduced motion is an immediate still lineup', () => {
  for (const count of [1, 9, 100]) {
    const grid = heroGrid(count);
    assert.ok(grid.columns * grid.rows >= count);
    for (let i = 0; i < count; i++) {
      assert.equal(heroPose(i, count, 0).visible, false);
      const final = heroPose(i, count, ASSEMBLY_MS);
      assert.equal(final.visible, true);
      assert.equal(final.x, 0);
      assert.equal(final.y, 0);
      assert.equal(final.scale, 1);
      const reduced = heroPose(i, count, 0, true);
      assert.equal(reduced.visible, true);
      assert.equal(reduced.portal, 0);
      assert.equal(reduced.lean, 0);
    }
  }
});

test('the formation has a lead and staggered wings, with bounded positions for large teams', () => {
  const lead = heroFormation(0, 9);
  assert.equal(lead.x, 0.5);
  assert.ok(heroFormation(1, 9).x < lead.x && heroFormation(2, 9).x > lead.x);
  assert.ok(heroFormation(1, 9).y < lead.y);
  for (const count of [1, 9, 40, 100])
    for (let i = 0; i < count; i++) {
      const at = heroFormation(i, count);
      assert.ok(at.x > 0 && at.x < 1 && at.y > 0 && at.y < 1 && at.scale > 0);
      assert.equal(heroPose(i, count, 0, true).impact, 0);
    }
});

test('a doorway opens before emergence, stays open through crossing, then closes', () => {
  const at = (p: number) => heroPose(0, 1, 1200 + p * 1400);
  assert.equal(at(0).portalScale, 0);
  assert.equal(at(0.1).visible, false);
  assert.ok(at(0.1).portalScale > 0 && at(0.1).portalScale < 1);
  assert.equal(at(0.18).portalScale, 1);
  assert.equal(at(0.18).emerge, 0);
  const crossing = at(0.45);
  assert.ok(crossing.visible && crossing.emerge > 0 && crossing.emerge < 1);
  assert.ok(crossing.depthScale > 0.025 && crossing.depthScale < 1);
  assert.equal(crossing.portalScale, 1);
  const through = at(0.75);
  assert.equal(through.emerge, 1);
  assert.equal(through.depthScale, 1);
  assert.equal(through.portalScale, 1);
  assert.ok(through.forward > crossing.forward);
  assert.ok(at(0.9).portalScale > 0 && at(0.9).portalScale < 1);
  assert.equal(at(1).portalScale, 0);
  assert.equal(at(1).portal, 0);
  assert.equal(at(1).forward, 1);
  assert.ok(at(0.6).portalRotation > at(0.3).portalRotation);
  for (let step = 0; step <= 100; step++) assert.equal(at(step / 100).x, 0);
});

test('doorways remain staggered and every portal closes before the finale', () => {
  assert.ok(heroPose(0, 9, 1400).portalScale > 0);
  assert.equal(heroPose(1, 9, 1400).portalScale, 0);
  assert.equal(heroPose(8, 9, 1400).portalScale, 0);
  for (const count of [1, 9, 100]) {
    for (let index = 0; index < count; index++) {
      const end = heroPose(index, count, 6500);
      assert.equal(end.portalScale, 0);
      assert.equal(end.emerge, 1);
      assert.equal(end.forward, 1);
      const still = heroPose(index, count, 0, true);
      assert.equal(still.portalScale, 0);
      assert.equal(still.opacity, 1);
      assert.equal(still.scale, 1);
      assert.equal(still.depthScale, 1);
      assert.equal(still.y, 0);
    }
  }
  assert.equal(ASSEMBLY_MS, 10_500);
});
