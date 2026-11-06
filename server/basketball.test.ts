import test from 'node:test';
import assert from 'node:assert/strict';
import { createCore, type Data } from './core.ts';
import { AIM_PERIOD, MAX_ROUND_SCORE, targetCenter, replay, type Round } from '../shared/basketball.ts';

test('basketball validates auth, tickets and timings, persists bests through reset, restart and backup', async () => {
  let time = Date.parse('2026-11-06T12:00:00Z');
  let saved: Data | null = null;
  let fail = false;
  const options = {
    adminPassword: 'secret',
    now: () => new Date(time),
    onChange() {},
    save(data: Data) {
      if (fail) throw new Error('Disk full');
      saved = structuredClone(data);
    },
  };
  let core = createCore({ ...options, saved });
  async function request(method: string, path: string, body = {}, token = '', admin = false) {
    return core.handle({
      method,
      url: new URL(path, 'http://local'),
      header: (n) =>
        n === 'authorization' ? `Bearer ${token}` : admin && n === 'x-admin-password' ? 'secret' : undefined,
      readJson: async () => body,
    });
  }
  await request('POST', '/api/admin/users', { username: 'a' }, '', true);
  const claim = await request('POST', '/api/claim', { username: 'a', pin: '1234' });
  const token = (claim.body as { token: string }).token;
  assert.equal((await request('POST', '/api/basketball/round')).status, 401);
  const round = (await request('POST', '/api/basketball/round', {}, token)).body as Round;
  const shots = [300, 900, 1500]
    .map((t) => (t - (round.seed % AIM_PERIOD) + AIM_PERIOD * 2) % AIM_PERIOD)
    .sort((a, b) => a - b)
    .filter((t, i, a) => !i || t - a[i - 1]! >= 450);
  assert.equal((await request('POST', '/api/basketball/score', { ...round, shots }, token)).status, 400);
  time += 60000;
  await request('POST', '/api/admin/users', { username: 'b' }, '', true);
  const second = await request('POST', '/api/claim', { username: 'b', pin: '1234' });
  assert.equal(
    (
      await request(
        'POST',
        '/api/basketball/score',
        { ...round, shots },
        (second.body as { token: string }).token,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request('POST', '/api/basketball/score', { ticket: round.ticket + 'x', shots }, token)).status,
    400,
  );
  assert.equal(
    (await request('POST', '/api/basketball/score', { ...round, shots: [0, 1] }, token)).status,
    400,
  );
  fail = true;
  assert.equal((await request('POST', '/api/basketball/score', { ...round, shots }, token)).status, 500);
  assert.equal(((await request('GET', '/api/basketball')).body as any).allTime.length, 0);
  fail = false;
  const finish = await request('POST', '/api/basketball/score', { ...round, shots, score: 999999 }, token);
  assert.equal(finish.status, 200);
  assert.equal((finish.body as any).score, replay(shots, round.seed).score);
  const expected = (finish.body as any).allTime;
  assert.deepEqual(
    (await request('POST', '/api/basketball/score', { ...round, shots }, token)).body,
    finish.body,
  );
  assert.equal((await request('POST', '/api/basketball/score', { ...round, shots: [] }, token)).status, 409);
  core = createCore({ ...options, saved });
  assert.equal((await request('POST', '/api/basketball/score', { ...round, shots }, token)).status, 200);
  const lower = (await request('POST', '/api/basketball/round', {}, token)).body as Round;
  time += 60000;
  assert.equal((await request('POST', '/api/basketball/score', { ...round, shots }, token)).status, 409);
  assert.equal((await request('POST', '/api/basketball/score', { ...lower, shots: [] }, token)).status, 200);
  assert.deepEqual(((await request('GET', '/api/basketball')).body as any).allTime, expected);
  time += 86400000;
  core.runResetIfDue();
  core = createCore({ ...options, saved });
  assert.deepEqual(((await request('GET', '/api/basketball')).body as any).allTime, expected);
  const backup = (await request('GET', '/api/admin/data', {}, '', true)).body;
  assert.equal((await request('PUT', '/api/admin/data', backup as any, '', true)).status, 200);
  assert.deepEqual(((await request('GET', '/api/basketball')).body as any).weekly, expected);
  time = Date.parse('2026-11-09T00:00:00Z');
  assert.equal(((await request('GET', '/api/basketball')).body as any).weekly.length, 0);
  assert.deepEqual(((await request('GET', '/api/basketball')).body as any).allTime, expected);
  assert.equal((await request('POST', '/api/basketball/score', { ...lower, shots: [] }, token)).status, 400);
  for (const score of [-1, MAX_ROUND_SCORE + 1]) {
    const invalid = structuredClone(backup) as any;
    invalid.basketball.allTime[0].score = score;
    assert.equal((await request('PUT', '/api/admin/data', invalid, '', true)).status, 400);
  }
  const highest = structuredClone(backup) as any;
  highest.basketball.allTime[0].score = MAX_ROUND_SCORE;
  assert.equal((await request('PUT', '/api/admin/data', highest, '', true)).status, 200);
  assert.equal((await request('DELETE', '/api/admin/users/a', {}, '', true)).status, 200);
  const afterDelete = (await request('GET', '/api/admin/data', {}, '', true)).body;
  assert.equal((await request('PUT', '/api/admin/data', afterDelete as any, '', true)).status, 200);
  assert.equal(((await request('GET', '/api/basketball')).body as any).allTime.length, 0);
});

test('team saves during pending arcade writes keep the round and score, and failures roll back only arcade fields', async () => {
  let time = Date.parse('2026-11-06T12:00:00Z');
  let stored: Data | null = null;
  let nextSave: { started: () => void; promise: Promise<void> } | undefined;
  function holdNextSave() {
    let started!: () => void;
    let release!: () => void;
    let reject!: (error: Error) => void;
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    const promise = new Promise<void>((resolve, fail) => {
      release = resolve;
      reject = fail;
    });
    nextSave = { started, promise };
    return { waiting, release, fail: () => reject(new Error('Storage unavailable')) };
  }
  const options = {
    adminPassword: 'secret',
    now: () => new Date(time),
    onChange() {},
    save(data: Data) {
      const snapshot = structuredClone(data);
      const held = nextSave;
      nextSave = undefined;
      if (held) {
        held.started();
        const previous = stored;
        stored = snapshot;
        return held.promise.catch((error) => {
          if (stored === snapshot) stored = previous;
          throw error;
        });
      }
      stored = snapshot;
    },
  };
  let core = createCore({ ...options, saved: null });
  let token = '';
  const request = (method: string, path: string, body = {}) =>
    core.handle({
      method,
      url: new URL(path, 'http://local'),
      readJson: async () => body,
      header: (name) =>
        name === 'authorization' ? `Bearer ${token}` : name === 'x-admin-password' ? 'secret' : undefined,
    });
  await request('POST', '/api/admin/users', { username: 'a' });
  token = ((await request('POST', '/api/claim', { username: 'a', pin: '1234' })).body as { token: string })
    .token;
  const pendingRound = holdNextSave();
  const start = request('POST', '/api/basketball/round');
  await pendingRound.waiting;
  assert.equal((await request('PATCH', '/api/me', { nickname: 'Kept name' })).status, 200);
  assert.ok((stored as Data | null)?.users[0]?.basketballRound?.ticket);
  pendingRound.release();
  const round = (await start).body as Round;
  time += 60000;
  const shots = [
    (Math.round(targetCenter(round.seed, 0) * (AIM_PERIOD / 2)) - (round.seed % AIM_PERIOD) + AIM_PERIOD) %
      AIM_PERIOD,
  ];
  const pendingScore = holdNextSave();
  const submit = request('POST', '/api/basketball/score', { ticket: round.ticket, shots });
  await pendingScore.waiting;
  assert.equal((await request('PATCH', '/api/me', { status: 'Still here' })).status, 200);
  assert.equal((stored as Data | null)?.basketball?.allTime[0]?.score, 2);
  assert.ok((stored as Data | null)?.users[0]?.basketballRound?.digest);
  pendingScore.release();
  assert.equal((await submit).status, 200);
  core = createCore({ ...options, saved: stored });
  assert.equal(((await request('GET', '/api/basketball')).body as any).allTime[0].score, 2);
  const previous = ((await request('GET', '/api/admin/data')).body as Data).users[0]?.basketballRound;
  const failedRound = holdNextSave();
  const retryStart = request('POST', '/api/basketball/round');
  await failedRound.waiting;
  await request('PATCH', '/api/me', { nickname: 'Survives rollback' });
  failedRound.fail();
  assert.equal((await retryStart).status, 500);
  const after = (await request('GET', '/api/admin/data')).body as Data;
  assert.deepEqual(after.users[0]?.basketballRound, previous);
  assert.equal(after.users[0]?.nickname, 'Survives rollback');
  assert.equal(after.users[0]?.status, 'Still here');
});
