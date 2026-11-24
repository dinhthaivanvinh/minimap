// Tests for the reward points API, through a real Node.js server and its data files.
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createApp } from '../server.ts';
import type { PointsMe, PointsView } from '../../shared/points.ts';

const ADMIN = { 'x-admin-password': 'secret' };
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

async function setup(t: TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minimap-points-'));
  const dataFile = path.join(dir, 'data.json');
  const pointsFile = path.join(dir, 'points.json');
  fs.writeFileSync(path.join(dir, 'index.html'), '<div id="root"></div>');
  // A Tuesday morning, in office hours (07:00 to 19:00).
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
    return { balance: line.balance, toClaim: line.toClaim };
  };
  const mine = async (username: string): Promise<PointsMe> => (await api('GET', '/api/points/me', undefined, as(username))).json;
  const claim = (username: string) => api('POST', '/api/points/claim', {}, as(username));
  const later = (ms: number) => (clock.now = new Date(clock.now.getTime() + ms));
  async function restart() {
    await app.stop();
    app = createApp(options);
    port = await app.start(0);
  }
  // What the server's 30-second timer would do after a jump in time.
  const timers = () => app.runResetIfDue();
  return { api, join, as, go, view, total, mine, claim, later, restart, timers, clock, pointsFile, dataFile };
}


test('time in the main office earns 10 points an hour, counted live and saved in its own file', async (t) => {
  const { join, go, total, mine, later, restart, pointsFile, dataFile, view } = await setup(t);
  await join('lan');
  await go('lan', 'main');
  assert.deepEqual(await mine('lan'), { inOffice: true, minutesToday: 0, checkedIn: true, toClaim: 0, claimOpen: false, window: { from: '12:00', to: '14:00' } });
  later(2 * HOUR);
  assert.deepEqual(await total('lan'), { balance: 0, toClaim: 20 });

  await go('lan', 'wfh'); // Working from home earns nothing.
  later(HOUR);
  assert.deepEqual(await total('lan'), { balance: 0, toClaim: 20 });
  assert.equal((await mine('lan')).inOffice, false);

  // The finished stay survives a restart, and stays out of the team's file.
  await restart();
  assert.deepEqual(await total('lan'), { balance: 0, toClaim: 20 });
  assert.ok(fs.existsSync(pointsFile));
  assert.equal('points' in JSON.parse(fs.readFileSync(dataFile, 'utf8')), false);
  assert.deepEqual((await view()).settings.offices, ['main']);
});

test('Claim works in its windows, as often as people like, points keep coming after a claim, and unclaimed ones are lost at the reset', async (t) => {
  const { join, go, total, mine, claim, later, timers, view } = await setup(t);
  await join('lan', 'mai');
  await go('lan', 'main');
  await go('mai', 'main');
  later(2 * HOUR); // 11:00
  const early = await claim('lan');
  assert.equal(early.status, 409);
  assert.match(early.json.error, /opens at 12:00/);

  later(HOUR); // 12:00: the first window opens.
  assert.deepEqual(await mine('lan'), {
    inOffice: true,
    minutesToday: 180,
    checkedIn: true,
    toClaim: 30,
    claimOpen: true,
    window: { from: '12:00', to: '14:00' },
  });
  assert.equal((await claim('lan')).status, 200);
  assert.deepEqual(await total('lan'), { balance: 30, toClaim: 0 });
  later(HOUR); // 13:00: still earning, and claiming again in the same window is fine.
  assert.deepEqual(await total('lan'), { balance: 30, toClaim: 10 });
  assert.equal((await claim('lan')).status, 200);
  assert.deepEqual(await total('lan'), { balance: 40, toClaim: 0 });

  later(HOUR + MINUTE); // 14:01: between the windows.
  const between = await claim('lan');
  assert.equal(between.status, 409);
  assert.match(between.json.error, /opens at 17:00/);

  later(3 * HOUR - MINUTE); // 17:00: the rest, up to the 8-hour cap.
  assert.equal((await claim('lan')).status, 200);
  assert.deepEqual(await total('lan'), { balance: 80, toClaim: 0 });
  later(2 * HOUR); // 19:00: capped, so nothing more to claim.
  assert.equal((await claim('lan')).status, 409);
  assert.deepEqual(await total('mai'), { balance: 0, toClaim: 80 });

  later(5 * HOUR); // Wednesday 00:00: the last window has closed.
  const closed = await claim('mai');
  assert.equal(closed.status, 409);
  assert.match(closed.json.error, /closed for today/);
  assert.equal((await mine('mai')).window, null);

  later(5 * HOUR); // 05:00: the morning reset closes the day. Mai never claimed.
  timers();
  later(HOUR);
  assert.deepEqual(await total('lan'), { balance: 80, toClaim: 0 });
  assert.deepEqual(await total('mai'), { balance: 0, toClaim: 0 });
  const day = (await view()).history[0]!;
  assert.equal(day.day, '2026-11-10');
  assert.deepEqual(
    [...day.lines].sort((a, b) => a.username.localeCompare(b.username)),
    [
      { username: 'lan', earned: 80, lost: 0, penalty: 0 },
      { username: 'mai', earned: 0, lost: 80, penalty: 0 },
    ],
  );
});

test('on a workday, someone who never checks in loses points, but never below zero, and a day nobody comes costs nothing', async (t) => {
  const { join, go, claim, total, later, view } = await setup(t);
  await join('lan', 'mai');
  await go('lan', 'main');
  later(3 * HOUR);
  assert.equal((await claim('lan')).status, 200);
  await go('lan', 'wfh'); // 30 points on the first day, which costs nobody anything.
  later(24 * HOUR); // Wednesday 12:00

  await go('mai', 'wfh'); // Mai checks in from home; Lan never does.
  later(24 * HOUR); // Thursday 12:00
  assert.deepEqual(await total('lan'), { balance: 10, toClaim: 0 });
  assert.deepEqual(await total('mai'), { balance: 0, toClaim: 0 });
  assert.deepEqual((await view()).history[0], { day: '2026-11-11', lines: [{ username: 'lan', earned: 0, lost: 0, penalty: 20 }] });

  // Nobody checks in on Thursday: a holiday.
  later(24 * HOUR);
  assert.deepEqual(await total('lan'), { balance: 10, toClaim: 0 });

  // Friday: Mai checks in, Lan doesn't, and Lan's 10 points only go down to zero.
  await go('mai', 'other');
  later(24 * HOUR);
  assert.deepEqual(await total('lan'), { balance: 0, toClaim: 0 });
});

test('the admin picks which offices earn and the claim windows, and changes balances by hand with a reason', async (t) => {
  const { api, join, go, total, mine, later, view } = await setup(t);
  await join('lan');
  const settings = (await api('GET', '/api/points/admin', undefined, ADMIN)).json.settings;
  assert.deepEqual([settings.start, settings.end, settings.claimWindows], ['07:00', '19:00', [{ from: '12:00', to: '14:00' }, { from: '17:00', to: '23:59' }]]);
  assert.equal((await view()).resetAt, '05:00'); // The server's RESET_AT.
  assert.equal((await api('PATCH', '/api/points/admin', { ...settings, offices: ['gone'] }, ADMIN)).status, 400);
  assert.equal((await api('PATCH', '/api/points/admin', { ...settings, claimWindows: [] }, ADMIN)).status, 400);
  assert.equal((await api('PATCH', '/api/points/admin', { ...settings, claimWindows: [{ from: '14:00', to: '12:00' }] }, ADMIN)).status, 400);
  const early = await api('PATCH', '/api/points/admin', { ...settings, start: '04:00' }, ADMIN);
  assert.equal(early.status, 400);
  assert.match(early.json.error, /morning reset \(05:00\)/);
  // A window before the reset falls on the next date, so it could never open.
  const night = await api('PATCH', '/api/points/admin', { ...settings, claimWindows: [{ from: '01:00', to: '04:00' }] }, ADMIN);
  assert.equal(night.status, 400);
  assert.match(night.json.error, /Claim windows must start at or after the morning reset \(05:00\)/);
  assert.equal((await api('PATCH', '/api/points/admin', settings)).status, 401);

  await go('lan', 'main');
  later(HOUR);
  // Main no longer earns, but the hour so far still counts. Claim now works from 10:00 to 11:00 too.
  const windows = [{ from: '17:00', to: '18:00' }, { from: '10:00', to: '11:00' }];
  await api('PATCH', '/api/points/admin', { ...settings, offices: ['other'], claimWindows: windows }, ADMIN);
  later(HOUR);
  assert.deepEqual(await total('lan'), { balance: 0, toClaim: 10 });
  assert.deepEqual((await view()).settings.offices, ['other']);
  assert.deepEqual((await view()).settings.claimWindows, [windows[1], windows[0]]);
  assert.equal((await mine('lan')).claimOpen, true); // 11:00, the window's last minute.

  assert.equal((await api('POST', '/api/points/admin/adjust', { username: 'lan', amount: 50, reason: 'Fixed the printer' })).status, 401);
  assert.equal((await api('POST', '/api/points/admin/adjust', { username: 'lan', amount: 0, reason: 'x' }, ADMIN)).status, 400);
  assert.equal((await api('POST', '/api/points/admin/adjust', { username: 'lan', amount: 5, reason: ' ' }, ADMIN)).status, 400);
  assert.equal((await api('POST', '/api/points/admin/adjust', { username: 'nobody', amount: 5, reason: 'x' }, ADMIN)).status, 400);
  assert.equal((await api('POST', '/api/points/admin/adjust', { username: 'lan', amount: 50, reason: 'Fixed the printer' }, ADMIN)).status, 200);
  assert.deepEqual(await total('lan'), { balance: 50, toClaim: 10 });
  await api('POST', '/api/points/admin/adjust', { username: 'lan', amount: -500, reason: 'Oops' }, ADMIN);
  assert.deepEqual(await total('lan'), { balance: 0, toClaim: 10 });
  assert.deepEqual((await view()).adjustments.map((a) => [a.amount, a.reason]), [[-500, 'Oops'], [50, 'Fixed the printer']]);
});

test('points are in the backup, are checked on restore, and leave with a deleted person', async (t) => {
  const { api, join, go, claim, later, total, view } = await setup(t);
  await join('lan', 'mai');
  await api('POST', '/api/points/admin/adjust', { username: 'lan', amount: 40, reason: 'Welcome' }, ADMIN);
  await api('POST', '/api/points/admin/adjust', { username: 'mai', amount: 30, reason: 'Welcome' }, ADMIN);
  await go('mai', 'main');
  later(3 * HOUR);
  await claim('mai');
  const backup = (await api('GET', '/api/admin/data', undefined, ADMIN)).json;
  assert.deepEqual(new Map(backup.points.balances), new Map([['lan', 40], ['mai', 60]]));
  assert.deepEqual(new Map(backup.points.claimed), new Map([['mai', 30]]));

  const broken = { ...backup, points: { ...backup.points, balances: [['stranger', 5]] } };
  const refused = await api('PUT', '/api/admin/data', broken, ADMIN);
  assert.equal(refused.status, 400);
  assert.match(refused.json.error, /reward points/);

  await api('POST', '/api/points/admin/adjust', { username: 'lan', amount: 100, reason: 'Later' }, ADMIN);
  assert.equal((await api('PUT', '/api/admin/data', backup, ADMIN)).status, 200);
  assert.deepEqual(await total('lan'), { balance: 40, toClaim: 0 });

  assert.equal((await api('DELETE', '/api/admin/users/mai', undefined, ADMIN)).status, 200);
  const after = await view();
  assert.deepEqual(after.board.map((b) => b.username), ['lan']);
  assert.equal(after.adjustments.some((a) => a.username === 'mai'), false);
});
