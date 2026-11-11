// Confirmed edits update only the saved member and never recreate deleted accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { TeamState, TeamUser } from '../../shared/types.ts';
import { diffUpdates } from './recentUpdates.ts';
import { replaceSavedMember } from './memberUpdates.ts';
const member = (username: string): TeamUser => ({
  username,
  nickname: username,
  place: null,
  status: '',
  updatedAt: null,
  claimed: true,
  look: null,
});

test('a confirmed edit replaces canonical values while preserving other members', () => {
  const before = [member('alex'), member('mina')];
  const saved: TeamUser = {
    ...before[0]!,
    nickname: 'Alex',
    status: 'Focused',
    place: 'out',
    scheduled: null,
    updatedAt: '2026-11-11T09:00:00Z',
    look: { color: '#abcdef', wearing: ['hat'], strokes: [] },
  };
  const after = replaceSavedMember(before, saved);
  assert.equal(after[0]!.nickname, 'Alex');
  assert.equal(after[0]!.place, 'out');
  assert.equal(after[0]!.status, 'Focused');
  assert.equal(after[0]!.scheduled, null);
  assert.equal(after[0]!.look!.color, '#abcdef');
  assert.equal(after[0]!.updatedAt, saved.updatedAt);
  assert.equal(after[1], before[1]);
  assert.equal(before[0]!.place, null, 'the previous snapshot is unchanged');
});

test('a late save result never recreates a deleted account or alters the roster', () => {
  const users = [member('mina')];
  assert.equal(replaceSavedMember(users, member('alex')), users);
  assert.deepEqual(replaceSavedMember([], member('alex')), []);
});

test('a confirmed edit creates one Recent update and the later live echo creates none', () => {
  const before: TeamState = {
    places: [],
    settings: { publicUrl: '', clocks: [], officeName: '', mapWeather: true },
    weather: null,
    users: [member('alex')],
  };
  const saved = { ...before.users[0]!, status: 'Focused', place: 'out', updatedAt: '2026-11-11T09:00:00Z' };
  const confirmed = { ...before, users: replaceSavedMember(before.users, saved) };
  assert.equal(diffUpdates(before, confirmed).length, 1);
  assert.deepEqual(diffUpdates(confirmed, structuredClone(confirmed)), []);
  const renamed = {
    ...confirmed,
    users: replaceSavedMember(confirmed.users, { ...saved, nickname: 'Alex' }),
  };
  assert.deepEqual(diffUpdates(confirmed, renamed), []);
});
