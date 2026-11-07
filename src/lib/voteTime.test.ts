// Tests for vote times in words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { endsText, fromLocalInput, localInputValue, quickEnds, timeLeft } from './voteTime.ts';

const MIN = 60_000;

test('time left is short and never says zero', () => {
  assert.equal(timeLeft(1000), '1 min');
  assert.equal(timeLeft(42 * MIN), '42 min');
  assert.equal(timeLeft(60 * MIN), '1 h');
  assert.equal(timeLeft(47 * 60 * MIN), '47 h');
  assert.equal(timeLeft(3 * 24 * 60 * MIN + 5), '3 d');
});

test('an open vote ends in some time, and a closed one ended at a day and time', () => {
  const now = new Date(2026, 10, 6, 12, 0);
  assert.equal(endsText(new Date(2026, 10, 6, 14, 0).toISOString(), now), 'ends in 2 h');
  assert.match(endsText(new Date(2026, 10, 6, 11, 0).toISOString(), now), /^ended Fri 11:00/);
  assert.match(endsText(new Date(2026, 9, 1, 11, 0).toISOString(), now), /^ended Oct 1, 2026 11:00/);
  assert.match(endsText(now.toISOString(), now), /^ended/, 'a vote closes exactly at its end');
});

test('quick picks are in the future, and end of today drops out in its last minute', () => {
  const now = new Date(2026, 10, 6, 12, 0);
  assert.deepEqual(
    quickEnds(now).map((q) => [q.label, new Date(q.at).getTime()]),
    [
      ['In 1 hour', new Date(2026, 10, 6, 13, 0).getTime()],
      ['End of today', new Date(2026, 10, 6, 23, 59).getTime()],
      ['Tomorrow 12:00', new Date(2026, 10, 7, 12, 0).getTime()],
      ['In 1 week', new Date(2026, 10, 13, 12, 0).getTime()],
    ],
  );
  assert.equal(quickEnds(new Date(2026, 10, 6, 23, 59, 30)).some((q) => q.label === 'End of today'), false);
});

test('a date-and-time input round-trips in local time', () => {
  const at = new Date(2026, 10, 6, 16, 5).toISOString();
  assert.equal(localInputValue(at), '2026-11-06T16:05');
  assert.equal(fromLocalInput('2026-11-06T16:05'), at);
  assert.equal(fromLocalInput(''), '');
  assert.equal(fromLocalInput('tomorrow'), '');
});
