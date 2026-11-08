// Tests for how characters react to votes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toView, type Vote, type VoteView } from '../../shared/vote.ts';
import { reactions, type VoteSnapshot } from './voteReactions.ts';

const END = new Date('2026-11-06T12:00:00Z');
const at = (seconds: number) => new Date(END.getTime() + seconds * 1000);

function view(ballots: [string, string[]][], overrides: Partial<Vote> = {}): VoteView {
  return toView({
    id: 'v1',
    title: 'Lunch',
    owner: 'ann',
    createdAt: at(-3600).toISOString(),
    endsAt: END.toISOString(),
    voters: ['ann', 'bob', 'cat', 'dan'],
    multi: false,
    allowCustom: false,
    anonymous: false,
    showOnMap: true,
    options: [
      { id: 'o1', text: 'Pho', addedBy: null },
      { id: 'o2', text: 'Pizza', addedBy: null },
    ],
    ballots: new Map(ballots),
    ...overrides,
  });
}

const snap = (votes: VoteView[], seconds: number): VoteSnapshot => ({ votes, at: at(seconds) });
const plan = (prev: VoteSnapshot | null, next: VoteSnapshot) => Object.fromEntries(reactions(prev, next).map((r) => [r.username, r.kind]));

test('a new voter hops, and a changed ballot does not', () => {
  const before = view([['ann', ['o1']]]);
  assert.deepEqual(plan(snap([before], -60), snap([view([['ann', ['o1']], ['bob', ['o2']]])], -50)), { bob: 'hop' });
  assert.deepEqual(plan(snap([before], -60), snap([view([['ann', ['o2']]])], -50)), {}, 'ann changed her vote');
  assert.deepEqual(plan(null, snap([before], -50)), {}, 'nothing to compare with when the map opens');
});

test('when a named vote closes, winners cheer and everyone else invited claps', () => {
  const ballots: [string, string[]][] = [['ann', ['o1']], ['bob', ['o1']], ['cat', ['o2']]];
  const closing = view(ballots);
  assert.deepEqual(plan(snap([closing], -10), snap([closing], 5)), { ann: 'cheer', bob: 'cheer', cat: 'clap', dan: 'clap' });
  const tie = view([['ann', ['o1']], ['cat', ['o2']]]);
  assert.deepEqual(plan(snap([tie], -10), snap([tie], 5)), { ann: 'cheer', cat: 'cheer', bob: 'clap', dan: 'clap' }, 'a tie: every winner cheers');
  assert.deepEqual(plan(snap([view([])], -10), snap([view([])], 5)), {}, 'nobody voted');
});

test('when an anonymous vote closes, everyone invited gets the same confetti, so nobody is singled out', () => {
  const anon = view([['ann', ['o1']], ['bob', ['o1']], ['cat', ['o2']]], { anonymous: true });
  const kinds = plan(snap([anon], -10), snap([anon], 5));
  assert.deepEqual(kinds, { ann: 'confetti', bob: 'confetti', cat: 'confetti', dan: 'confetti' });
});

test('a vote that closed while the map was closed or asleep gets no late burst', () => {
  const closing = view([['ann', ['o1']]]);
  assert.deepEqual(plan(snap([closing], 5), snap([closing], 20)), {}, 'already closed at the last look');
  assert.deepEqual(plan(snap([closing], -10), snap([closing], 61)), {}, 'seen more than a minute late');
  assert.deepEqual(plan(snap([], -10), snap([closing], 5)), {}, 'a vote the map had not seen yet');
});

test('a last-second ballot and the close together: the bigger reaction plays', () => {
  const before = view([['ann', ['o1']]]);
  const after = view([['ann', ['o1']], ['bob', ['o1']]]);
  assert.deepEqual(plan(snap([before], -1), snap([after], 1)), { ann: 'cheer', bob: 'cheer', cat: 'clap', dan: 'clap' }, 'bob cheers rather than hops');
});

test('a vote closed early, whose end moves from later to now between two looks, gets the closing reactions', () => {
  const ballots: [string, string[]][] = [['ann', ['o1']], ['bob', ['o1']], ['cat', ['o2']]];
  const before = view(ballots, { endsAt: at(3600).toISOString() });
  const closed = view(ballots, { endsAt: at(0).toISOString() });
  assert.deepEqual(plan(snap([before], -10), snap([before], -5)), {}, 'still open');
  assert.deepEqual(plan(snap([before], -5), snap([closed], 1)), { ann: 'cheer', bob: 'cheer', cat: 'clap', dan: 'clap' });
});
