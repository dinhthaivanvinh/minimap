// Tests for sharing a vote by its address.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shareLink, shareVote, type ShareTools } from './voteShare.ts';

test('the link uses the team address when there is one, and this browser\'s otherwise', () => {
  assert.equal(shareLink('v1', '', 'http://localhost:5173'), 'http://localhost:5173/vote?id=v1');
  assert.equal(shareLink('v1', 'https://map.example.com/team/', 'http://localhost:5173'), 'https://map.example.com/vote?id=v1');
  assert.equal(shareLink('a b&c', '', 'https://map.example.com'), 'https://map.example.com/vote?id=a%20b%26c');
  assert.equal(shareLink('v1', 'not an address', 'https://map.example.com'), 'https://map.example.com/vote?id=v1');
});

const abort = () => Object.assign(new Error('closed'), { name: 'AbortError' });

test('the share sheet comes first, and the clipboard is the fallback', async () => {
  const sent: unknown[] = [];
  const copied: string[] = [];
  const clipboard = { writeText: async (text: string) => { copied.push(text); } };
  const share: ShareTools['share'] = async (data) => { sent.push(data); };

  assert.equal(await shareVote('Lunch', 'https://x/vote?id=1', { share, clipboard }), 'shared');
  assert.deepEqual(sent, [{ title: 'Lunch', text: 'Vote: Lunch', url: 'https://x/vote?id=1' }]);
  assert.deepEqual(copied, [], 'nothing copied when the share sheet worked');

  assert.equal(await shareVote('Lunch', 'u', { clipboard }), 'copied');
  assert.equal(await shareVote('Lunch', 'u2', { share: async () => { throw new Error('not allowed'); }, clipboard }), 'copied');
  assert.deepEqual(copied, ['u', 'u2']);
});

test('closing the share sheet is not an error, and no tools at all means show the link', async () => {
  const copied: string[] = [];
  const clipboard = { writeText: async (text: string) => { copied.push(text); } };
  assert.equal(await shareVote('Lunch', 'u', { share: async () => { throw abort(); }, clipboard }), 'cancelled');
  assert.deepEqual(copied, [], 'a closed share sheet does not copy');
  assert.equal(await shareVote('Lunch', 'u', {}), 'failed');
  assert.equal(await shareVote('Lunch', 'u', { clipboard: { writeText: async () => { throw new Error('denied'); } } }), 'failed');
});
