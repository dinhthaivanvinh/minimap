// Tests for dragging your own character to another room.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Place, TeamState, TeamUser } from '../../shared/types.ts';
import { dropPlace, moverFor, placeOfZone, withMove, zoneAt } from './dragMove.ts';
import { computeLayout } from './layout.ts';

const places: Place[] = [
  { id: 'main', name: 'Main', kind: 'office' },
  { id: 'other', name: 'Other', kind: 'office' },
];

const user = (username: string, place: string | null, extra: Partial<TeamUser> = {}): TeamUser => ({
  username,
  nickname: username,
  place,
  status: '',
  updatedAt: null,
  claimed: true,
  look: null,
  ...extra,
});

const middle = (layout: ReturnType<typeof computeLayout>, id: string) => {
  const z = layout.zones.find((zone) => zone.id === id)!;
  return [z.x + z.w / 2, z.y + z.h / 2] as const;
};

for (const portrait of [false, true]) {
  test(`${portrait ? 'portrait' : 'landscape'}: the room under each room's middle is that room`, () => {
    const layout = computeLayout(places, [user('ana', 'main')], { portrait });
    for (const z of layout.zones) assert.equal(zoneAt(layout, ...middle(layout, z.id))?.id, z.id);
    assert.equal(zoneAt(layout, -5, -5), null);
    if (layout.park) assert.equal(zoneAt(layout, layout.park.x + layout.park.w / 2, layout.park.y + layout.park.h / 2), null);
  });
}

test('dropping on another room asks for its place, and the lobby means not checked in', () => {
  const layout = computeLayout(places, [user('ana', 'main')]);
  assert.equal(dropPlace(layout, 'ana', ...middle(layout, 'wfh')), 'wfh');
  assert.equal(dropPlace(layout, 'ana', ...middle(layout, 'out')), 'out');
  assert.equal(dropPlace(layout, 'ana', ...middle(layout, 'other')), 'other');
  assert.equal(dropPlace(layout, 'ana', ...middle(layout, 'lobby')), null);
  assert.equal(placeOfZone(layout.zones.find((z) => z.id === 'off')!), 'off');
});

test('dropping back in the same room, or off the rooms, changes nothing', () => {
  const layout = computeLayout(places, [user('ana', 'main'), user('bo', null)]);
  assert.equal(dropPlace(layout, 'ana', ...middle(layout, 'main')), undefined);
  assert.equal(dropPlace(layout, 'bo', ...middle(layout, 'lobby')), undefined);
  assert.equal(dropPlace(layout, 'ana', 500, 500), undefined);
});

test('only a logged-in teammate who has claimed their username may drag', () => {
  const users = [user('ana', 'main'), user('bo', null, { claimed: false })];
  assert.equal(moverFor(users, 'ana'), 'ana');
  assert.equal(moverFor(users, 'bo'), null);
  assert.equal(moverFor(users, 'gone'), null);
  assert.equal(moverFor(users, null), null);
});

test('a pending move shows straight away, and going to a scheduled place cancels the schedule', () => {
  const scheduled = { at: '2026-11-10T10:00:00.000Z', place: 'out', status: 'Dentist' };
  const state: TeamState = {
    places,
    settings: { publicUrl: '', clocks: [], officeName: '', mapWeather: true },
    weather: null,
    users: [user('ana', 'main', { scheduled }), user('bo', 'wfh')],
  };
  assert.equal(withMove(state, null), state);
  assert.equal(withMove(state, { username: 'ana', place: 'main' }), state, 'nothing to change');

  const home = withMove(state, { username: 'ana', place: 'wfh' });
  assert.equal(home.users[0]!.place, 'wfh');
  assert.deepEqual(home.users[0]!.scheduled, scheduled, 'another place keeps the schedule');
  assert.equal(home.users[1], state.users[1]);
  assert.equal(state.users[0]!.place, 'main', 'the real state is left alone');

  const out = withMove(state, { username: 'ana', place: 'out' });
  assert.equal(out.users[0]!.scheduled, null);
});
