// Tests for the rules of the home page's Recent updates card.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Place, TeamState, TeamUser } from '../../shared/types.ts';
import {
  MAX_RECENT,
  RECENT_MS,
  agoText,
  closeTime,
  diffUpdates,
  mergeUpdates,
  seedUpdates,
  updateText,
  visibleUpdates,
  type RecentUpdate,
} from './recentUpdates.ts';

const NOW = new Date('2026-11-10T09:00:00Z');
/** The time this many seconds after NOW, or before it when negative. */
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
const iso = (seconds: number) => at(seconds).toISOString();

const PLACES: Place[] = [
  { id: 'main', name: 'Main Office', kind: 'office' },
  { id: 'a', name: 'Room A', kind: 'office' },
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

const team = (...users: TeamUser[]): TeamState => ({
  places: PLACES,
  settings: { publicUrl: '', clocks: [], officeName: '', mapWeather: true },
  weather: null,
  users,
});

/** A row as the card holds it, for the tests about merging and showing. */
const row = (username: string, seconds: number): RecentUpdate => ({
  username,
  at: at(seconds).getTime(),
  place: 'wfh',
  status: '',
  from: { place: null, status: '' },
  scheduled: false,
});

/** The one row a change makes, as the card words it for someone called Lan. */
function said(before: TeamUser, after: TeamUser): string {
  const rows = diffUpdates(team(before), team(after));
  assert.equal(rows.length, 1);
  return `Lan${updateText(rows[0]!, PLACES)}`;
}

test('a place change, a status change, both, and a cleared status each make one row with the right text', () => {
  const before = user('lan', 'main', { status: 'In a meeting', updatedAt: iso(-600) });
  const after = (change: Partial<TeamUser>) => ({ ...before, updatedAt: iso(-5), ...change });

  assert.equal(said(before, after({ place: 'wfh' })), 'Lan moved to Work from home', 'the status that stayed is not repeated');
  assert.equal(said(before, after({ status: 'Out for lunch' })), 'Lan: "Out for lunch"');
  assert.equal(said(before, after({ place: 'a', status: 'Back at 3' })), 'Lan moved to Room A: "Back at 3"');
  assert.equal(said(before, after({ status: '' })), 'Lan cleared their status');
  assert.equal(said(before, after({ place: 'out', status: '' })), 'Lan moved to Out of Office', 'the move is the news');
  assert.equal(said(before, after({ place: null })), 'Lan moved to Not checked in');

  const [made] = diffUpdates(team(before), team(after({ place: 'wfh' })));
  assert.deepEqual(made, {
    username: 'lan',
    at: at(-5).getTime(),
    place: 'wfh',
    status: 'In a meeting',
    from: { place: 'main', status: 'In a meeting' },
    scheduled: false,
  });
});

test('a new nickname or character makes no row, and neither does saving the same place again', () => {
  const before = user('lan', 'main', { status: 'Busy', updatedAt: iso(-600) });
  const look = { color: '#8d5524', wearing: [], strokes: [] };
  assert.deepEqual(diffUpdates(team(before), team({ ...before, nickname: 'Lan Anh' })), []);
  assert.deepEqual(diffUpdates(team(before), team({ ...before, look })), []);
  assert.deepEqual(diffUpdates(team(before), team({ ...before, updatedAt: iso(-5) })), [], 'the time moved, but nothing else did');
});

test('the morning reset makes no rows, because it leaves "updated at" alone', () => {
  const names = Array.from({ length: 30 }, (_, i) => `user${i}`);
  const before = team(...names.map((name) => user(name, 'main', { status: 'Busy', updatedAt: iso(-3600), scheduled: { at: iso(600), place: 'out', status: '' } })));
  const after = team(...names.map((name) => user(name, null, { updatedAt: iso(-3600), scheduled: null })));
  assert.deepEqual(diffUpdates(before, after), []);
});

test('someone added to the team or removed from it makes no row', () => {
  const lan = user('lan', 'main', { updatedAt: iso(-600) });
  assert.deepEqual(diffUpdates(team(lan), team(lan, user('new', null))), []);
  assert.deepEqual(diffUpdates(team(lan), team(lan, user('restored', 'wfh', { updatedAt: iso(-5) }))), [], 'nothing to compare with');
  assert.deepEqual(diffUpdates(team(lan, user('gone', 'wfh', { updatedAt: iso(-600) })), team(lan)), []);
});

test('a scheduled change that fires is marked as scheduled, and going there by hand is not', () => {
  const plan = { at: iso(-10), place: 'out', status: 'Dentist' };
  const before = user('tu', 'main', { status: 'Busy', updatedAt: iso(-600), scheduled: plan });

  const [fired] = diffUpdates(team(before), team({ ...before, place: 'out', status: 'Dentist', updatedAt: iso(-5), scheduled: null }));
  assert.equal(fired?.scheduled, true);
  assert.equal(`Tú${updateText(fired!, PLACES)}`, 'Tú moved to Out of Office: "Dentist" (scheduled)');

  const quiet = { ...before, status: '', scheduled: { ...plan, status: '' } };
  const [noMessage] = diffUpdates(team(quiet), team({ ...quiet, place: 'out', updatedAt: iso(-5), scheduled: null }));
  assert.equal(`Tú${updateText(noMessage!, PLACES)}`, 'Tú moved to Out of Office (scheduled)');

  const [byHand] = diffUpdates(team(before), team({ ...before, place: 'out', updatedAt: iso(-20), scheduled: null }));
  assert.equal(byHand?.scheduled, false, 'they went before the scheduled time, which also ends the schedule');

  const [elsewhere] = diffUpdates(team(before), team({ ...before, place: 'wfh', updatedAt: iso(-5) }));
  assert.equal(elsewhere?.scheduled, false, 'the schedule is still waiting');

  const [cancelled] = diffUpdates(team(before), team({ ...before, status: 'Lunch', updatedAt: iso(-5), scheduled: null }));
  assert.equal(cancelled?.scheduled, false, 'not in the place the schedule named');

  const there = { ...before, place: 'out' };
  const [newStatus] = diffUpdates(team(there), team({ ...there, status: 'Dentist', updatedAt: iso(-5), scheduled: null }));
  assert.equal(`Tú${updateText(newStatus!, PLACES)}`, 'Tú: "Dentist" (scheduled)', 'already there, so only the status changed');
});

test('the same person twice keeps one row, the newest, at the top', () => {
  const first = mergeUpdates([], [row('lan', -120), row('minh', -60)], NOW);
  assert.deepEqual(first.map((r) => r.username), ['minh', 'lan']);

  const again = { ...row('lan', -10), status: 'Lunch' };
  const second = mergeUpdates(first, [again], NOW);
  assert.deepEqual(second.map((r) => r.username), ['lan', 'minh']);
  assert.deepEqual(second[0], again);
});

test('rows older than 5 minutes drop off, and there are never more than 5 rows', () => {
  const list = mergeUpdates([], [row('old', -301), row('edge', -300), row('young', -299)], NOW);
  assert.deepEqual(list.map((r) => r.username), ['young']);
  assert.deepEqual(mergeUpdates(list, [], at(2)), [], 'a later look drops the rest');

  const many = Array.from({ length: 8 }, (_, i) => row(`user${i}`, -10 * i));
  const kept = mergeUpdates([], many, NOW);
  assert.equal(kept.length, MAX_RECENT);
  assert.deepEqual(kept.map((r) => r.username), ['user0', 'user1', 'user2', 'user3', 'user4'], 'the newest ones stay');
  assert.equal(RECENT_MS, 5 * 60 * 1000);
});

test('the card shows rows newer than the close and younger than 5 minutes', () => {
  const list = [row('minh', -30), row('lan', -90), row('old', -400)];
  assert.deepEqual(visibleUpdates(list, NOW, 0).map((r) => r.username), ['minh', 'lan'], 'never closed');

  const closedAt = closeTime(visibleUpdates(list, NOW, 0));
  assert.equal(closedAt, at(-30).getTime());
  assert.deepEqual(visibleUpdates(list, NOW, closedAt), [], 'Close hides everything that was showing');
  assert.deepEqual(visibleUpdates(seedUpdates(team(user('minh', 'wfh', { updatedAt: iso(-30) })), NOW), NOW, closedAt), [], 'a reload does not bring it back');

  const newer = mergeUpdates(list, [row('tu', -5)], NOW);
  assert.deepEqual(visibleUpdates(newer, NOW, closedAt).map((r) => r.username), ['tu'], 'a newer update brings the card back');
});

test('Close works when the server clock is ahead of the screen, or behind it', () => {
  // Ahead: the row is in this screen's future, and still has to go when it is closed.
  const ahead = [row('lan', 120)];
  const closedAhead = closeTime(visibleUpdates(ahead, NOW, 0));
  assert.deepEqual(visibleUpdates(ahead, NOW, closedAhead), []);
  assert.deepEqual(visibleUpdates([row('minh', 121), ...ahead], NOW, closedAhead).map((r) => r.username), ['minh']);

  // Behind: an update just after the close looks older than the moment Close was pressed.
  const behind = [row('lan', -120)];
  const closedBehind = closeTime(visibleUpdates(behind, NOW, 0));
  assert.deepEqual(visibleUpdates([row('minh', -119), ...behind], NOW, closedBehind).map((r) => r.username), ['minh']);
});

test('a page that has just opened shows only people updated in the last 5 minutes', () => {
  const state = team(
    user('lan', 'wfh', { updatedAt: iso(-60) }),
    user('minh', 'a', { status: 'In a meeting', updatedAt: iso(-299) }),
    user('old', 'main', { updatedAt: iso(-300) }),
    user('never', null),
    user('broken', 'main', { updatedAt: 'not a date' }),
    user('ahead', 'out', { updatedAt: iso(90) }),
  );
  const rows = mergeUpdates([], seedUpdates(state, NOW), NOW);
  assert.deepEqual(rows.map((r) => r.username), ['ahead', 'lan', 'minh']);
  assert.deepEqual(rows.map((r) => r.scheduled), [false, false, false]);

  const [ahead, lan, minh] = rows;
  assert.equal(`Lan${updateText(lan!, PLACES)}`, 'Lan is in Work from home', 'no "before" is known');
  assert.equal(`Minh${updateText(minh!, PLACES)}`, 'Minh is in Room A: "In a meeting"');
  assert.equal(agoText(ahead!, NOW), 'now', 'a server clock ahead of the screen counts as now');
});

test('a page that opens just after the morning reset shows nobody the reset cleared', () => {
  const cleared = user('lan', null, { updatedAt: iso(-60) });
  assert.deepEqual(seedUpdates(team(cleared), NOW), [], 'no place and no status: nothing to show');

  const [sick] = seedUpdates(team({ ...cleared, status: 'Sick today' }), NOW);
  assert.equal(`Lan${updateText(sick!, PLACES)}`, 'Lan is in Not checked in: "Sick today"', 'a status set since then is news');
});

test('when live updates come back after being cut off, people updated since then show where they are now', () => {
  // A tab that slept through the night. The morning reset ran, then Lan and Minh came back
  // to the office they were in yesterday, and Tú has not checked in yet.
  const yesterday = iso(-15 * 3600);
  const asleep = team(
    user('lan', 'main', { status: 'Busy', updatedAt: yesterday }),
    user('minh', 'main', { updatedAt: yesterday }),
    user('tu', 'wfh', { updatedAt: yesterday }),
  );
  const awake = team(
    user('lan', 'main', { updatedAt: iso(-120) }),
    user('minh', 'main', { updatedAt: iso(-60) }),
    user('tu', null, { updatedAt: yesterday }),
  );
  // Compared as if nothing was missed, Lan would have "cleared their status" and Minh would have no row.
  const rows = mergeUpdates([], seedUpdates(awake, NOW, asleep), NOW);
  assert.deepEqual(rows.map((r) => `${r.username}${updateText(r, PLACES)}`), ['minh is in Main Office', 'lan is in Main Office']);
  assert.deepEqual(rows.map((r) => r.scheduled), [false, false]);
});

test('after a short gap, someone already seen is not news again, and someone new to the team is', () => {
  const before = team(user('lan', 'wfh', { updatedAt: iso(-200) }));
  const after = team(user('lan', 'wfh', { updatedAt: iso(-200) }), user('joined', 'main', { updatedAt: iso(-10) }));
  assert.deepEqual(seedUpdates(after, NOW, before).map((r) => r.username), ['joined']);
  assert.deepEqual(seedUpdates(after, NOW).map((r) => r.username), ['lan', 'joined'], 'a page that has just opened shows both');
  assert.deepEqual(seedUpdates(after, NOW, null).map((r) => r.username), ['lan', 'joined'], 'no state seen yet');
});

test('how long ago is in whole minutes, and "now" for the first one', () => {
  assert.equal(agoText(row('lan', 0), NOW), 'now');
  assert.equal(agoText(row('lan', -59), NOW), 'now');
  assert.equal(agoText(row('lan', -60), NOW), '1 min');
  assert.equal(agoText(row('lan', -299), NOW), '4 min');
});

test('a username such as __proto__ works like any other', () => {
  const names = ['__proto__', 'constructor', 'toString'];
  const before = team(...names.map((name) => user(name, 'main', { updatedAt: iso(-600) })));
  const after = team(...names.map((name, i) => user(name, 'wfh', { updatedAt: iso(-10 * (i + 1)) })));

  const rows = mergeUpdates([], diffUpdates(before, after), NOW);
  assert.deepEqual(rows.map((r) => r.username), names);
  assert.deepEqual(rows.map((r) => r.from?.place), ['main', 'main', 'main']);
  assert.deepEqual(mergeUpdates(rows, [row('__proto__', -1)], NOW).map((r) => r.username), ['__proto__', 'constructor', 'toString']);
  assert.deepEqual(seedUpdates(after, NOW).map((r) => r.username), names);
});
