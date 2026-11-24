// Tests for the reward points API, through a real Node.js server and its data files.
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createApp } from '../server.ts';
import type { PointsMe, PointsView } from '../../shared/points.ts';

const ADMIN = { 'x-admin-password': 'secret' };
const HOUR = 60 * 60 * 1000;

async function setup(t: TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minimap-points-'));
  const dataFile = path.join(dir, 'data.json');
  const pointsFile = path.join(dir, 'points.json');
  fs.writeFileSync(path.join(dir, 'index.html'), '<div id="root"></div>');
  // A Tuesday morning, in office hours.
  const clock = { now: new Date('2026-11-10T09:00:00Z') };
  const options = { dataFile, publicDir: dir, adminPassword: 'secret', timeZone: 'UTC', now: () => clock.now };
  let app = createApp(options);
  let port = await app.start(0);
  t.after(async () => {
    await app.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function api(method: string, address: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`http://127.0.0.1:${port}${address}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
  }

  const tokens = new Map<string, string>();
  async function join(...usernames: string[]) {
    for (const username of usernames) {
      await api('POST', '/api/admin/users', { username }, ADMIN);
      tokens.set(username, (await api('POST', '/api/claim', { username, pin: '1234' })).json.token);
    }
  }
  const as = (username: string) => ({ Authorization: `Bearer ${tokens.get(username)}` });
  const go = async (username: string, place: string | null) => assert.equal((await api('PATCH', '/api/me', { place }, as(username))).status, 200);
  const view = async (): Promise<PointsView> => (await api('GET', '/api/points')).json;
  const total = async (username: string) => {
    const line = (await view()).board.find((b) => b.username === username)!;
    return { balance: line.balance, today: line.today };
  };
  const mine = async (username: string): Promise<PointsMe> => (await api('GET', '/api/points/me', undefined, as(username))).json;
  const later = (ms: number) => (clock.now = new Date(clock.now.getTime() + ms));
  async function restart() {
    await app.stop();
    app = createApp(options);
    port = await app.start(0);
  }
  // What the server's 30-second timer would do after a jump in time.
  const timers = () => app.runResetIfDue();
  return { api, join, as, go, view, total, mine, later, restart, timers, clock, pointsFile, dataFile };
}

test('time in the main office earns 10 points an hour, counted live and saved in its own file', async (t) => {
  const { join, go, total, mine, later, restart, pointsFile, dataFile, view } = await setup(t);
  await join('lan');
  await go('lan', 'main');
  assert.deepEqual(await mine('lan'), { inOffice: true, verified: true, minutesToday: 0, checkedIn: true });
  later(2 * HOUR);
  assert.deepEqual(await total('lan'), { balance: 0, today: 20 });

  await go('lan', 'wfh'); // Working from home earns nothing.
  later(HOUR);
  assert.deepEqual(await total('lan'), { balance: 0, today: 20 });
  assert.equal((await mine('lan')).inOffice, false);

  // The finished stay survives a restart, and stays out of the team's file.
  await restart();
  assert.deepEqual(await total('lan'), { balance: 0, today: 20 });
  assert.ok(fs.existsSync(pointsFile));
  assert.equal('points' in JSON.parse(fs.readFileSync(dataFile, 'utf8')), false);
  assert.deepEqual((await view()).settings.offices, ['main']);
});

test('the day closes into the balance, with a cap, office hours, and the history', async (t) => {
  const { join, go, total, later, timers, view } = await setup(t);
  await join('lan');
  await go('lan', 'main');
  later(14 * HOUR); // Until 23:00: only 08:00 to 18:00 counts, and only 8 hours of it.
  assert.deepEqual(await total('lan'), { balance: 0, today: 80 });
  later(6 * HOUR); // Wednesday 05:00: the morning reset clears places.
  timers();
  later(4 * HOUR);
  assert.deepEqual(await total('lan'), { balance: 80, today: 0 });
  assert.deepEqual((await view()).history[0], { day: '2026-11-10', lines: [{ username: 'lan', earned: 80, penalty: 0 }] });
});

test('on a workday, someone who never checks in loses points, but never below zero, and a day nobody comes costs nothing', async (t) => {
  const { join, go, total, later, view } = await setup(t);
  await join('lan', 'mai');
  await go('lan', 'main');
  later(3 * HOUR);
  await go('lan', 'wfh'); // 30 points on the first day, which costs nobody anything.
  later(24 * HOUR); // Wednesday 12:00

  await go('mai', 'wfh'); // Mai checks in from home; Lan never does.
  later(24 * HOUR); // Thursday 12:00
  assert.deepEqual(await total('lan'), { balance: 10, today: 0 });
  assert.deepEqual(await total('mai'), { balance: 0, today: 0 });
  assert.deepEqual((await view()).history[0], { day: '2026-11-11', lines: [{ username: 'lan', earned: 0, penalty: 20 }] });

  // Nobody checks in on Thursday: a holiday.
  later(24 * HOUR);
  assert.deepEqual(await total('lan'), { balance: 10, today: 0 });

  // Friday: Mai checks in, Lan doesn't, and Lan's 10 points only go down to zero.
  await go('mai', 'other');
  later(24 * HOUR);
  assert.deepEqual(await total('lan'), { balance: 0, today: 0 });
});

test('with office addresses set, only a stay seen on the office network earns', async (t) => {
  const { api, join, as, go, total, mine, later } = await setup(t);
  await join('lan');
  const settings = (await api('GET', '/api/points/admin', undefined, ADMIN)).json;
  assert.equal(settings.ip, '127.0.0.1'); // The admin's own address, for the button.

  assert.equal((await api('PATCH', '/api/points/admin', { ...settings.settings, ips: ['203.0.113.7'] }, ADMIN)).status, 200);
  await go('lan', 'main');
  assert.deepEqual(await mine('lan'), { inOffice: true, verified: false, minutesToday: 0, checkedIn: true });
  later(HOUR);
  assert.deepEqual(await total('lan'), { balance: 0, today: 0 });
  const refused = await api('POST', '/api/points/here', {}, as('lan'));
  assert.equal(refused.status, 403);
  assert.match(refused.json.error, /VPN/);

  // Now this computer is the office: checking again starts the count from now.
  await api('PATCH', '/api/points/admin', { ...settings.settings, ips: ['127.0.0.0/8'] }, ADMIN);
  const checked = await api('POST', '/api/points/here', {}, as('lan'));
  assert.equal(checked.status, 200);
  assert.equal(checked.json.verified, true);
  later(HOUR);
  assert.deepEqual(await total('lan'), { balance: 0, today: 10 });

  // A new stay from the office network is counted straight away.
  await go('lan', 'wfh');
  await go('lan', 'main');
  assert.equal((await mine('lan')).verified, true);
  await go('lan', 'wfh');
  assert.equal((await api('POST', '/api/points/here', {}, as('lan'))).status, 409);
});

test('the admin picks which offices earn, and changes balances by hand with a reason', async (t) => {
  const { api, join, go, total, later, view } = await setup(t);
  await join('lan');
  const settings = (await api('GET', '/api/points/admin', undefined, ADMIN)).json.settings;
  assert.equal((await api('PATCH', '/api/points/admin', { ...settings, offices: ['gone'] }, ADMIN)).status, 400);
  assert.equal((await api('PATCH', '/api/points/admin', settings)).status, 401);

  await go('lan', 'main');
  later(HOUR);
  // Main no longer earns, but the hour so far still counts.
  await api('PATCH', '/api/points/admin', { ...settings, offices: ['other'] }, ADMIN);
  later(HOUR);
  assert.deepEqual(await total('lan'), { balance: 0, today: 10 });
  assert.deepEqual((await view()).settings.offices, ['other']);

  assert.equal((await api('POST', '/api/points/admin/adjust', { username: 'lan', amount: 50, reason: 'Fixed the printer' })).status, 401);
  assert.equal((await api('POST', '/api/points/admin/adjust', { username: 'lan', amount: 0, reason: 'x' }, ADMIN)).status, 400);
  assert.equal((await api('POST', '/api/points/admin/adjust', { username: 'lan', amount: 5, reason: ' ' }, ADMIN)).status, 400);
  assert.equal((await api('POST', '/api/points/admin/adjust', { username: 'nobody', amount: 5, reason: 'x' }, ADMIN)).status, 400);
  assert.equal((await api('POST', '/api/points/admin/adjust', { username: 'lan', amount: 50, reason: 'Fixed the printer' }, ADMIN)).status, 200);
  assert.deepEqual(await total('lan'), { balance: 50, today: 10 });
  await api('POST', '/api/points/admin/adjust', { username: 'lan', amount: -500, reason: 'Oops' }, ADMIN);
  assert.deepEqual(await total('lan'), { balance: 0, today: 10 });
  assert.deepEqual((await view()).adjustments.map((a) => [a.amount, a.reason]), [[-500, 'Oops'], [50, 'Fixed the printer']]);
});

test('points are in the backup, are checked on restore, and leave with a deleted person', async (t) => {
  const { api, join, total, view } = await setup(t);
  await join('lan', 'mai');
  await api('POST', '/api/points/admin/adjust', { username: 'lan', amount: 40, reason: 'Welcome' }, ADMIN);
  await api('POST', '/api/points/admin/adjust', { username: 'mai', amount: 30, reason: 'Welcome' }, ADMIN);
  const backup = (await api('GET', '/api/admin/data', undefined, ADMIN)).json;
  assert.deepEqual(new Map(backup.points.balances), new Map([['lan', 40], ['mai', 30]]));

  const broken = { ...backup, points: { ...backup.points, balances: [['stranger', 5]] } };
  const refused = await api('PUT', '/api/admin/data', broken, ADMIN);
  assert.equal(refused.status, 400);
  assert.match(refused.json.error, /reward points/);

  await api('POST', '/api/points/admin/adjust', { username: 'lan', amount: 100, reason: 'Later' }, ADMIN);
  assert.equal((await api('PUT', '/api/admin/data', backup, ADMIN)).status, 200);
  assert.deepEqual(await total('lan'), { balance: 40, today: 0 });

  assert.equal((await api('DELETE', '/api/admin/users/mai', undefined, ADMIN)).status, 200);
  const after = await view();
  assert.deepEqual(after.board.map((b) => b.username), ['lan']);
  assert.equal(after.adjustments.some((a) => a.username === 'mai'), false);
});
