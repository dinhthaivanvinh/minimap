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
