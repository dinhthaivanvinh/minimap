// Tests for claiming reward points from the browser and the words for when Claim works.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { PointsMe } from '../../shared/points.ts';
import { ApiFailure } from './api.ts';
import { claimPoints, claimWindowText } from './pointsClaim.ts';

const after: PointsMe = { inOffice: true, minutesToday: 90, checkedIn: true, toClaim: 0, claimOpen: true, window: { from: '17:00', to: '23:59' } };

/** A pretend server: answers or fails each path, and remembers what was asked. */
function server(answers: Record<string, unknown>) {
  const calls: string[] = [];
  const request = async <T,>(method: string, url: string, body?: unknown, headers?: Record<string, string>): Promise<T> => {
    calls.push(`${method} ${url} ${JSON.stringify(body ?? null)} ${headers?.Authorization}`);
    const answer = answers[`${method} ${url}`];
    if (answer instanceof Error) throw answer;
    return answer as T;
  };
  return { calls, request };
}

test('a claim says how many points the server added and keeps you where you are', async () => {
  const { calls, request } = server({ 'POST /api/points/claim': { ...after, claimed: 15 } });
  assert.deepEqual(await claimPoints('tok', false, request), { me: after, text: 'Claimed 15 points. Keep it up!', problem: false });
  assert.deepEqual(calls, ['POST /api/points/claim {} Bearer tok']);
});

test('claiming and going Off sets you to Off, which stops your time counting', async () => {
  const { calls, request } = server({ 'POST /api/points/claim': { ...after, claimed: 1 }, 'PATCH /api/me': {} });
  const result = await claimPoints('tok', true, request);
  assert.deepEqual(result, { me: { ...after, inOffice: false }, text: 'Claimed 1 point. You’re Off now. See you tomorrow!', problem: false });
  assert.equal(calls[1], 'PATCH /api/me {"place":"off"} Bearer tok');
});

test('a claim that worked is still reported when going Off fails', async () => {
  const { request } = server({ 'POST /api/points/claim': { ...after, claimed: 20 }, 'PATCH /api/me': new ApiFailure(0, 'Could not reach the server.') });
  const result = await claimPoints('tok', true, request);
  assert.equal(result.problem, true);
  assert.deepEqual(result.me, after);
  assert.equal(result.text, 'Claimed 20 points. But you’re still checked in: Could not reach the server.');
});

test('a refused claim comes back as the server’s message and never goes Off', async () => {
  const { calls, request } = server({ 'POST /api/points/claim': new ApiFailure(409, 'Claiming opens at 17:00.') });
  assert.deepEqual(await claimPoints('tok', true, request), { me: null, text: 'Claiming opens at 17:00.', problem: true });
  assert.equal(calls.length, 1);
});

test('the window words say until when, from when, or that the points will be lost', () => {
  const window = { from: '17:00', to: '23:59' };
  assert.equal(claimWindowText({ claimOpen: true, window }, '05:00'), 'You can claim until 23:59.');
  assert.equal(claimWindowText({ claimOpen: false, window }, '05:00'), 'Claiming opens at 17:00.');
  assert.equal(claimWindowText({ claimOpen: false, window: null }, '05:00'), 'Claiming is closed for today, so these are lost at 05:00.');
});
