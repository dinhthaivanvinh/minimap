// Tests for what the map's notice board shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { VoteView } from '../../shared/vote.ts';
import { boardNotes, shortTitle, voteLink } from './noticeBoard.ts';

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
  assert.deepEqual(boardNotes([vote('gone', -5)], NOW), { notes: [], more: 0 }, 'an empty board');
});

test('long names are cut to fit a note, and notes link to their vote', () => {
  assert.equal(shortTitle('Team lunch'), 'Team lunch');
  assert.equal(shortTitle('Which pizza place for Friday'), 'Which pizza place…');
  assert.equal([...shortTitle('😀'.repeat(30))].length, 18);
  assert.equal(voteLink('a b'), '/vote?id=a%20b');
});
