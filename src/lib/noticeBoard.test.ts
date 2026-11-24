// Tests for what the map's notice board shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { PointsView } from '../../shared/points.ts';
import type { TeamUser } from '../../shared/types.ts';
import type { VoteView } from '../../shared/vote.ts';
import { boardNotes, countdown, shortTitle, topLeaders, voteLink } from './noticeBoard.ts';

const NOW = new Date('2026-11-06T12:00:00Z');
const vote = (id: string, minutes: number, title = id): VoteView => ({
  id,
  title,
  owner: 'ann',
  createdAt: NOW.toISOString(),
  endsAt: new Date(NOW.getTime() + minutes * 60_000).toISOString(),
  voters: ['ann'],
  multi: false,
  allowCustom: false,
  anonymous: false,
  showOnMap: true,
  options: [],
  voted: [],
});

test('the board shows up to 4 open votes, ending soonest first, and counts the rest', () => {
  const board = boardNotes([vote('a', 300), vote('b', 30), vote('gone', -5), vote('c', 61), vote('d', 60), vote('e', 2000)], NOW);
  assert.deepEqual(board.notes.map((n) => [n.id, n.left, n.urgent]), [
    ['b', '30 min', true],
    ['d', '1 h', true],
    ['c', '1 h', false],
    ['a', '5 h', false],
  ]);
  assert.equal(board.more, 1);
  assert.deepEqual(boardNotes([vote('gone', -5)], NOW), { notes: [], more: 0, leaders: null }, 'an empty board');
});

test('long names are cut to fit a note, and notes link to their vote', () => {
  assert.equal(shortTitle('Team lunch'), 'Team lunch');
  assert.equal(shortTitle('Which pizza place for Friday'), 'Which pizza place…');
  assert.equal([...shortTitle('😀'.repeat(30))].length, 18);
  assert.equal(voteLink('a b'), '/vote?id=a%20b');
});

test('the wall TV counts down the vote ending soonest, only in its last hour', () => {
  assert.equal(countdown([vote('a', 61)], NOW), null);
  const lunch = { ...vote('lunch', 42, 'Team lunch'), voters: ['ann', 'bob', 'cat'], voted: ['ann'] };
  assert.deepEqual(countdown([vote('a', 50), lunch, vote('gone', -1)], NOW), { id: 'lunch', text: 'Team lunch closes in 42 min, 2 people left' });
  assert.equal(countdown([{ ...lunch, voted: ['ann', 'bob'] }], NOW)?.text, 'Team lunch closes in 42 min, 1 person left');
  assert.equal(countdown([{ ...lunch, voted: lunch.voters }], NOW)?.text, 'Team lunch closes in 42 min, everyone has voted');
});

test('the points note takes one note’s place, and shows the top 3 with any points by nickname', () => {
  const leaders = [{ name: 'Lan', points: 50 }];
  const board = boardNotes([vote('a', 300), vote('b', 30), vote('c', 61), vote('d', 60)], NOW, leaders);
  assert.equal(board.notes.length, 3);
  assert.equal(board.more, 1);
  assert.deepEqual(board.leaders, leaders);
  assert.equal(boardNotes([], NOW).leaders, null);

  const view = {
    board: [
      { username: 'lan', balance: 40, today: 10 },
      { username: 'mai', balance: 30, today: 0 },
      { username: 'bob', balance: 0, today: 5 },
      { username: 'kim', balance: 1, today: 0 },
      { username: 'zed', balance: 0, today: 0 },
    ],
  } as PointsView;
  const users = [
    { username: 'lan', nickname: 'Lan the Magnificent' },
    { username: 'mai', nickname: 'Mai' },
  ] as TeamUser[];
  assert.deepEqual(topLeaders(view, users), [
    { name: 'Lan the M…', points: 50 },
    { name: 'Mai', points: 30 },
    { name: 'bob', points: 5 },
  ]);
  assert.equal(topLeaders(null, users), null);
});
