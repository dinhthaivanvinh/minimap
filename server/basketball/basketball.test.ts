import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createCore, type ApiRequest, type ApiResponse, type Data } from '../core.ts';
import { createApp } from '../server.ts';
import { createBasketball, type BasketballData } from './core.ts';
import { AIM_PERIOD, MAX_ROUND_SCORE, targetCenter, replay, type Round } from '../../shared/basketball.ts';

// The team's core and the arcade's, each with its own store, wired as the servers wire them.
function setup() {
  const clock = { time: Date.parse('2026-11-06T12:00:00Z') };
  const stores = { team: null as Data | null, game: null as BasketballData | null };
  const gameSaves = { fail: false, hold: undefined as Promise<void> | undefined };
  let answer: (req: ApiRequest) => Promise<ApiResponse>;

  // Builds both from what is stored, as a server does when it starts.
  function restart() {
    const now = () => new Date(clock.time);
    const core = createCore({
      adminPassword: 'secret',
      now,
      onChange() {},
      saved: stores.team,
      save(data) {
        stores.team = structuredClone(data);
      },
    });
    const game = createBasketball({
      saved: stores.game,
      team: core.team,
      now,
      async save(data) {
        const held = gameSaves.hold;
        gameSaves.hold = undefined;
        if (held) await held;
        if (gameSaves.fail) throw new Error('Disk full');
        stores.game = structuredClone(data);
      },
    });
    core.attach(game.feature);
    answer = async (req) => (await game.handle(req)) ?? (await core.handle(req));
    return core;
  }
  let core = restart();

  async function request(method: string, address: string, body = {}, token = '', admin = false) {
    return answer({
      method,
      url: new URL(address, 'http://local'),
      header: (n) =>
        n === 'authorization' ? `Bearer ${token}` : admin && n === 'x-admin-password' ? 'secret' : undefined,
      readJson: async () => body,
    });
  }

  async function join(username: string): Promise<string> {
    await request('POST', '/api/admin/users', { username }, '', true);
    return ((await request('POST', '/api/claim', { username, pin: '1234' })).body as { token: string }).token;
  }

  return {
    clock,
    stores,
    gameSaves,
    request,
    join,
    restart: () => (core = restart()),
    core: () => core,
  };
}

// One shot, in ms since the round started, that hits the target.
function hit(round: Round): number[] {
  const at = Math.round(targetCenter(round.seed, 0) * (AIM_PERIOD / 2));
  return [(at - (round.seed % AIM_PERIOD) + AIM_PERIOD) % AIM_PERIOD];
}

test('basketball checks logins, tickets and timings, and keeps bests through reset, restart and backup', async () => {
  const { clock, stores, gameSaves, request, join, restart, core } = setup();
  const token = await join('a');
  assert.equal((await request('POST', '/api/basketball/round')).status, 401);
  const round = (await request('POST', '/api/basketball/round', {}, token)).body as Round;
  const shots = [300, 900, 1500]
    .map((t) => (t - (round.seed % AIM_PERIOD) + AIM_PERIOD * 2) % AIM_PERIOD)
    .sort((a, b) => a - b)
    .filter((t, i, a) => !i || t - a[i - 1]! >= 450);
  assert.equal((await request('POST', '/api/basketball/score', { ...round, shots }, token)).status, 400, 'round not over');
  clock.time += 60000;
  const other = await join('b');
  assert.equal((await request('POST', '/api/basketball/score', { ...round, shots }, other)).status, 400, 'not their ticket');
  assert.equal((await request('POST', '/api/basketball/score', { ticket: round.ticket + 'x', shots }, token)).status, 400);
  assert.equal((await request('POST', '/api/basketball/score', { ...round, shots: [0, 1] }, token)).status, 400);

  gameSaves.fail = true;
  assert.equal((await request('POST', '/api/basketball/score', { ...round, shots }, token)).status, 500);
  assert.equal(((await request('GET', '/api/basketball')).body as any).allTime.length, 0, 'a failed save is undone');
  gameSaves.fail = false;

  const finish = await request('POST', '/api/basketball/score', { ...round, shots, score: 999999 }, token);
  assert.equal(finish.status, 200);
  assert.equal((finish.body as any).score, replay(shots, round.seed).score, 'the server works out the score');
  const expected = (finish.body as any).allTime;
  assert.deepEqual((await request('POST', '/api/basketball/score', { ...round, shots }, token)).body, finish.body, 'a retry gets the same reply');
  assert.equal((await request('POST', '/api/basketball/score', { ...round, shots: [] }, token)).status, 409);

  // The arcade's data is kept apart from the team's.
  assert.equal('basketball' in stores.team!, false);
  assert.equal(stores.team!.users.some((u) => 'basketballRound' in u), false);
  assert.deepEqual(stores.game!.records!.allTime, expected);

  restart();
  assert.equal((await request('POST', '/api/basketball/score', { ...round, shots }, token)).status, 200, 'a retry works after a restart');
  const lower = (await request('POST', '/api/basketball/round', {}, token)).body as Round;
  clock.time += 60000;
  assert.equal((await request('POST', '/api/basketball/score', { ...round, shots }, token)).status, 409, 'a new round replaces the old ticket');
  assert.equal((await request('POST', '/api/basketball/score', { ...lower, shots: [] }, token)).status, 200);
  assert.deepEqual(((await request('GET', '/api/basketball')).body as any).allTime, expected, 'a lower score keeps the best');

  clock.time += 86400000;
  core().runResetIfDue();
  restart();
  assert.deepEqual(((await request('GET', '/api/basketball')).body as any).allTime, expected, 'scores survive the morning reset');

  // The admin's one backup file still holds the scores, under the same key as before.
  const backup = (await request('GET', '/api/admin/data', {}, '', true)).body as any;
  assert.deepEqual(backup.basketball.allTime, expected);
  assert.equal((await request('PUT', '/api/admin/data', backup, '', true)).status, 200);
  assert.deepEqual(((await request('GET', '/api/basketball')).body as any).weekly, expected);
  clock.time = Date.parse('2026-11-09T00:00:00Z');
  assert.equal(((await request('GET', '/api/basketball')).body as any).weekly.length, 0, 'a new week starts empty');
  assert.deepEqual(((await request('GET', '/api/basketball')).body as any).allTime, expected);
  assert.equal((await request('POST', '/api/basketball/score', { ...lower, shots: [] }, token)).status, 400, 'too old to send again');

  for (const score of [-1, MAX_ROUND_SCORE + 1]) {
    const invalid = structuredClone(backup);
    invalid.basketball.allTime[0].score = score;
    assert.equal((await request('PUT', '/api/admin/data', invalid, '', true)).status, 400);
  }
  const stranger = structuredClone(backup);
  stranger.basketball.allTime[0].username = 'nobody';
  assert.equal((await request('PUT', '/api/admin/data', stranger, '', true)).status, 400, 'scores must belong to people in the backup');
  const highest = structuredClone(backup);
  highest.basketball.allTime[0].score = MAX_ROUND_SCORE;
  assert.equal((await request('PUT', '/api/admin/data', highest, '', true)).status, 200);

  const { basketball: _, ...beforeArcade } = backup;
  assert.equal((await request('PUT', '/api/admin/data', beforeArcade, '', true)).status, 200);
  assert.equal(((await request('GET', '/api/basketball')).body as any).allTime.length, 0, 'older backups start with empty rankings');

  assert.equal((await request('PUT', '/api/admin/data', backup, '', true)).status, 200);
  assert.equal((await request('DELETE', '/api/admin/users/a', {}, '', true)).status, 200);
  assert.equal(stores.game!.records!.allTime.length, 0, 'deleting someone removes their rankings');
  assert.equal(stores.game!.rounds.a, undefined);
  await join('a');
  assert.equal(((await request('GET', '/api/basketball')).body as any).allTime.length, 0, 'a new person with the same name starts fresh');
});

test('a failed arcade save undoes only the arcade change, and team saves never wait for it', async () => {
  const { clock, stores, gameSaves, request, join, restart } = setup();
  const token = await join('a');

  let release!: () => void;
  gameSaves.hold = new Promise((resolve) => (release = resolve));
  const start = request('POST', '/api/basketball/round', {}, token);
  // The arcade's save is still running, but the team's own saves go ahead.
  assert.equal((await request('PATCH', '/api/me', { nickname: 'Kept name' }, token)).status, 200);
  assert.equal(stores.team!.users[0]!.nickname, 'Kept name');
  release();
  const round = (await start).body as Round;
  assert.equal(stores.game!.rounds.a!.ticket, round.ticket);

  clock.time += 60000;
  assert.equal((await request('POST', '/api/basketball/score', { ticket: round.ticket, shots: hit(round) }, token)).status, 200);
  restart();
  assert.equal(((await request('GET', '/api/basketball')).body as any).allTime[0].score, 2);

  const previous = stores.game!.rounds.a;
  gameSaves.fail = true;
  assert.equal((await request('POST', '/api/basketball/round', {}, token)).status, 500);
  gameSaves.fail = false;
  assert.equal((await request('PATCH', '/api/me', { status: 'Still here' }, token)).status, 200);
  // The next save writes what's in memory, so it shows the failed round was undone.
  assert.equal((await request('POST', '/api/basketball/score', { ticket: round.ticket, shots: hit(round) }, token)).status, 200);
  assert.deepEqual(stores.game!.rounds.a, previous);
  assert.equal(stores.team!.users[0]!.status, 'Still here');
});

test('scores in an old data.json move to basketball.json on the next start', async (t: TestContext) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minimap-basketball-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dataFile = path.join(dir, 'data.json');
  const gameFile = path.join(dir, 'basketball.json');
  const clock = { now: new Date('2026-11-06T12:00:00Z') };
  const options = { dataFile, publicDir: dir, adminPassword: 'secret', now: () => clock.now };

  async function run<T>(use: (api: (method: string, address: string, body?: unknown, token?: string) => Promise<any>) => Promise<T>): Promise<T> {
    const app = createApp(options);
    const port = await app.start(0);
    try {
      return await use(async (method, address, body, token) => {
        const res = await fetch(`http://localhost:${port}${address}`, {
          method,
          headers: { 'Content-Type': 'application/json', 'x-admin-password': 'secret', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: res.status, json: await res.json() };
      });
    } finally {
      await app.stop();
    }
  }

  // Play a round, then rewrite the files the way the arcade used to keep them.
  const { token, round, best } = await run(async (api) => {
    await api('POST', '/api/admin/users', { username: 'a' });
    const token = (await api('POST', '/api/claim', { username: 'a', pin: '1234' })).json.token as string;
    const round = (await api('POST', '/api/basketball/round', {}, token)).json as Round;
    return { token, round, best: { username: 'a', score: 6, at: clock.now.toISOString() } };
  });
  const team = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const game = JSON.parse(fs.readFileSync(gameFile, 'utf8')) as BasketballData;
  team.basketball = { week: '2026-11-02', allTime: [best], weekly: [best] };
  team.users[0].basketballRound = game.rounds.a;
  fs.writeFileSync(dataFile, JSON.stringify(team));
  fs.rmSync(gameFile);

  clock.now = new Date(clock.now.getTime() + 60000);
  await run(async (api) => {
    assert.deepEqual((await api('GET', '/api/basketball')).json.allTime, [best]);
    // The round started before the move can still be scored.
    assert.equal((await api('POST', '/api/basketball/score', { ticket: round.ticket, shots: [] }, token)).status, 200);
  });
  const moved = JSON.parse(fs.readFileSync(gameFile, 'utf8')) as BasketballData;
  assert.deepEqual(moved.records!.allTime, [best]);
  const rewritten = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  assert.equal('basketball' in rewritten, false);
  assert.equal('basketballRound' in rewritten.users[0], false);
});
