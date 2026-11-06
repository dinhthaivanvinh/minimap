// Tests for the voting rules shared by the server and the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canVote,
  cleanBallot,
  cleanNewVote,
  cleanOption,
  closedNewestFirst,
  isOpen,
  latestResult,
  mapSummary,
  MAX_OPTIONS,
  resultText,
  results,
  toView,
  VoteRuleError,
  waitingVoters,
  waitingVotes,
  type Vote,
  type VoteView,
} from './vote.ts';

const NOW = new Date('2026-11-06T12:00:00Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

function vote(overrides: Partial<Vote> = {}): Vote {
  return {
    id: 'v1',
    title: 'Team lunch',
    owner: 'ann',
    createdAt: NOW.toISOString(),
    endsAt: later(60),
    voters: ['ann', 'bob', 'cat'],
    multi: false,
    allowCustom: false,
    anonymous: false,
    showOnMap: true,
    options: [
      { id: 'o1', text: 'Pho', addedBy: null },
      { id: 'o2', text: 'Pizza', addedBy: null },
      { id: 'o3', text: 'Sushi', addedBy: null },
    ],
    ballots: new Map(),
    ...overrides,
  };
}

const view = (overrides: Partial<Vote> = {}, caller?: string): VoteView => toView(vote(overrides), caller);

test('a vote is open until exactly its end time', () => {
  const v = vote();
  assert.equal(isOpen(v, new Date(Date.parse(v.endsAt) - 1)), true);
  assert.equal(isOpen(v, new Date(v.endsAt)), false);
  assert.equal(canVote(v, 'bob', NOW), true);
  assert.equal(canVote(v, 'dan', NOW), false, 'only invited people');
  assert.equal(canVote(v, 'bob', new Date(v.endsAt)), false);
});

test('results sort by count, keep the added order on ties, and share first place', () => {
  const tied = results(view({ ballots: new Map([['ann', ['o3']], ['bob', ['o2']], ['cat', ['o1']]]) }));
  assert.deepEqual(tied.options.map((o) => o.id), ['o1', 'o2', 'o3']);
  assert.equal(tied.winners.length, 3);

  const won = results(view({ ballots: new Map([['ann', ['o3']], ['bob', ['o3']], ['cat', ['o2']]]) }));
  assert.deepEqual(won.options.map((o) => [o.id, o.count]), [['o3', 2], ['o2', 1], ['o1', 0]]);
  assert.deepEqual(won.winners.map((o) => o.id), ['o3']);
  assert.equal(won.turnout, 3);

  assert.deepEqual(results(view()).winners, [], 'nobody has won before anyone votes');
});

test('an anonymous view never says who picked what, but says who voted and the caller’s own picks', () => {
  const ballots = new Map([['ann', ['o1']], ['bob', ['o2']]]);
  const anon = view({ anonymous: true, ballots }, 'bob');
  assert.equal(anon.options.some((o) => 'pickedBy' in o), false);
  assert.deepEqual(anon.voted, ['ann', 'bob']);
  assert.deepEqual(anon.mine, ['o2']);
  const shared = view({ anonymous: true, ballots });
  for (const option of shared.options) assert.doesNotMatch(JSON.stringify(option), /ann|bob|cat/);
  assert.equal('ballots' in shared || 'mine' in shared, false);

  const named = view({ ballots });
  assert.deepEqual(named.options.map((o) => o.pickedBy), [['ann'], ['bob'], []]);
  assert.equal('mine' in named, false, 'no picks without a caller');
  assert.deepEqual(view({ ballots }, 'cat').mine, [], 'a caller who has not voted has no picks');
});

test('new votes are checked against the limits', () => {
  const members = ['ann', 'bob', 'cat'];
  const ok = { title: '  Team   lunch ', endsAt: later(30), options: ['Pho', 'Pizza'], voters: ['cat'], multi: true };
  const clean = (body: object) => cleanNewVote({ ...ok, ...body }, { now: NOW, members, owner: 'bob' });
  const fails = (body: object, message: RegExp) => assert.throws(() => clean(body), (err) => err instanceof VoteRuleError && message.test(err.message));

  const made = clean({});
  assert.equal(made.title, 'Team lunch');
  assert.deepEqual(made.voters, ['bob', 'cat'], 'the creator is always invited, in team order');
  assert.deepEqual([made.multi, made.allowCustom, made.anonymous, made.showOnMap], [true, false, false, false]);

  fails({ title: '' }, /name/);
  fails({ title: 'x'.repeat(81) }, /name/);
  assert.equal(clean({ title: '😀'.repeat(80) }).title.length, 160, 'counts characters, not code units');
  fails({ endsAt: 'soon' }, /not valid/);
  fails({ endsAt: NOW.toISOString() }, /passed/);
  fails({ endsAt: later(90 * 24 * 60 + 1) }, /90 days/);
  assert.equal(clean({ endsAt: later(90 * 24 * 60) }).endsAt, later(90 * 24 * 60));
  fails({ options: ['Pho'] }, /2 to 20/);
  fails({ options: Array.from({ length: MAX_OPTIONS + 1 }, (_, i) => `o${i}`) }, /2 to 20/);
  fails({ options: ['Pho', ' pho  '] }, /same/);
  fails({ options: ['Pho', ''] }, /1 to 60/);
  fails({ options: ['Pho', 'x'.repeat(61)] }, /1 to 60/);
  fails({ voters: ['dan'] }, /dan is not on the team/);
  fails({ voters: 'ann' }, /who can vote/);
  fails({ anonymous: 'yes' }, /on or off/);
  assert.equal(cleanOption('  Bún   chả '), 'Bún chả');
});

test('ballots must pick existing options, one for single choice and at least one for multiple', () => {
  const single = vote();
  assert.deepEqual(cleanBallot(single, ['o2']), ['o2']);
  assert.throws(() => cleanBallot(single, ['o1', 'o2']), /Pick one option/);
  assert.throws(() => cleanBallot(single, []), /Pick one option/);
  assert.throws(() => cleanBallot(single, ['nope']), /no longer exists/);
  assert.throws(() => cleanBallot(single, 'o1'), /Pick one/);
  const multi = vote({ multi: true });
  assert.deepEqual(cleanBallot(multi, ['o3', 'o1']), ['o1', 'o3'], 'kept in the options’ order');
  assert.throws(() => cleanBallot(multi, []), /at least one/);
  assert.throws(() => cleanBallot(multi, ['o1', 'o1']), /no longer exists/);
});

test('the board lists open votes ending soonest first, and history the last to end first', () => {
  const views = [view({ id: 'late', endsAt: later(300) }), view({ id: 'soon', endsAt: later(5) }), view({ id: 'done', endsAt: later(-5) }), view({ id: 'older', endsAt: later(-50) })];
  assert.deepEqual(mapSummary(views, NOW).map((v) => v.id), ['soon', 'late']);
  assert.deepEqual(closedNewestFirst(views, NOW).map((v) => v.id), ['done', 'older']);
});

test('the latest result is the newest vote closed in the last 3 hours with a ballot', () => {
  const ballots = new Map([['ann', ['o2']], ['bob', ['o2']], ['cat', ['o1']]]);
  const empty = view({ id: 'empty', endsAt: later(-1) });
  const recent = view({ id: 'recent', endsAt: later(-10), ballots });
  const same = view({ id: 'same', endsAt: later(-10), ballots: new Map([['ann', ['o1']]]) });
  const old = view({ id: 'old', endsAt: later(-181), ballots });
  assert.equal(latestResult([empty, old], NOW), null, 'no ballots, or too long ago');
  assert.equal(latestResult([old, recent, empty], NOW)?.vote.id, 'recent');
  assert.equal(latestResult([recent, same], NOW)?.vote.id, 'recent', 'votes closing together: the first one listed wins');
  assert.equal(latestResult([recent], new Date(Date.parse(recent.endsAt) + 3 * 60 * 60 * 1000)), null);
  assert.equal(resultText(latestResult([recent], NOW)!), '🏆 Pizza wins Team lunch: 2 of 3 votes');

  const tie = view({ endsAt: later(-1), ballots: new Map([['ann', ['o1']], ['bob', ['o2']]]) });
  assert.equal(resultText(latestResult([tie], NOW)!), 'Tie in Team lunch: Pho and Pizza');
  assert.equal(resultText(latestResult([tie], NOW)!).includes('ann'), false);
});

test('waiting voters are invited to an open vote shown on the map, and have not voted', () => {
  const ballots = new Map([['ann', ['o1']]]);
  assert.deepEqual([...waitingVoters([view({ ballots })], NOW)], ['bob', 'cat']);
  assert.deepEqual([...waitingVoters([view({ ballots, showOnMap: false })], NOW)], []);
  assert.deepEqual([...waitingVoters([view({ ballots, endsAt: later(-1) })], NOW)], []);
  assert.deepEqual(waitingVotes([view({ ballots, showOnMap: false })], 'bob', NOW).length, 1, 'the detail card lists every vote');
  assert.deepEqual(waitingVotes([view({ ballots, showOnMap: false })], 'bob', NOW, { onMapOnly: true }).length, 0);
  assert.deepEqual(waitingVotes([view({ ballots })], 'ann', NOW), []);
});
