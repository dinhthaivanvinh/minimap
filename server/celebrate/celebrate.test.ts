// Tests for the birthdays and anniversaries API, through a real Node.js server and its data files.
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createApp } from '../server.ts';
import type { CelebrateView } from '../../shared/celebrate.ts';

const ADMIN = { 'x-admin-password': 'secret' };

async function setup(t: TestContext, start = '2026-11-10T12:00:00Z') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minimap-celebrate-'));
  const dataFile = path.join(dir, 'data.json');
  const celebrateFile = path.join(dir, 'celebrate.json');
  fs.writeFileSync(path.join(dir, 'index.html'), '<div id="root"></div>');
  const clock = { now: new Date(start) };
  const options = { dataFile, publicDir: dir, adminPassword: 'secret', now: () => clock.now };
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
  const view = async (): Promise<CelebrateView> => (await api('GET', '/api/celebrate')).json;
  async function restart() {
    await app.stop();
    app = createApp(options);
    port = await app.start(0);
  }
  return { api, join, as, view, restart, clock, celebrateFile, dataFile };
}

test('people set their own dates, and the map hears about today’s and coming celebrations', async (t) => {
  const { api, join, as, view } = await setup(t);
  await join('lan', 'minh');

  assert.equal((await api('GET', '/api/celebrate/me')).status, 401);
  assert.deepEqual((await api('GET', '/api/celebrate/me', undefined, as('lan'))).json, { birthday: null, joined: null });
  const saved = await api('PATCH', '/api/celebrate/me', { birthday: '11-10', joined: '2024-03-01' }, as('lan'));
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.deepEqual(saved.json, { birthday: '11-10', joined: '2024-03-01' });
  // A key that is left out stays as it was.
  await api('PATCH', '/api/celebrate/me', { joined: '2023-11-12' }, as('minh'));
  await api('PATCH', '/api/celebrate/me', { birthday: '11-20' }, as('minh'));
  assert.deepEqual((await api('GET', '/api/celebrate/me', undefined, as('minh'))).json, { birthday: '11-20', joined: '2023-11-12' });

  const shown = await view();
  assert.equal(shown.today, '2026-11-10');
  assert.deepEqual(
    shown.celebrations.map((c) => [c.username, c.kind, c.days, c.years ?? null]),
    [
      ['lan', 'birthday', 0, null],
      ['minh', 'anniversary', 2, 3],
      ['minh', 'birthday', 10, null],
    ],
  );
});

test('bad dates are refused with a message that says what to do', async (t) => {
  const { api, join, as } = await setup(t);
  await join('lan');
  for (const body of [{ birthday: '02-30' }, { birthday: 1110 }, { joined: '2026-02-29' }, { joined: '2026-12-01' }]) {
    const res = await api('PATCH', '/api/celebrate/me', body, as('lan'));
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.json.error, /Pick/);
  }
  // An empty value clears it, and someone with nothing left is dropped.
  await api('PATCH', '/api/celebrate/me', { birthday: '05-05' }, as('lan'));
  assert.equal((await api('PATCH', '/api/celebrate/me', { birthday: '' }, as('lan'))).status, 200);
  assert.deepEqual((await api('GET', '/api/celebrate/admin', undefined, ADMIN)).json, { people: [] });
});

test('the admin can set anyone’s dates, by any spelling of the username', async (t) => {
  const { api, join } = await setup(t);
  await join('Lan');
  assert.equal((await api('GET', '/api/celebrate/admin')).status, 401);
  const res = await api('PATCH', '/api/celebrate/admin', { username: 'lan', birthday: '01-02' }, ADMIN);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(res.json.people, [['Lan', { birthday: '01-02', joined: null }]]);
  assert.equal((await api('PATCH', '/api/celebrate/admin', { username: 'nobody', birthday: '01-02' }, ADMIN)).status, 404);
});

test('teammates send wishes once on the day, never to themselves, and they are gone the next day', async (t) => {
  const { api, join, as, view, clock, restart } = await setup(t);
  await join('lan', 'bob', 'cat');
  await api('PATCH', '/api/celebrate/me', { birthday: '11-10' }, as('lan'));
  await api('PATCH', '/api/celebrate/me', { birthday: '11-11' }, as('cat'));

  assert.equal((await api('POST', '/api/celebrate/wish', { to: 'lan' })).status, 401);
  assert.equal((await api('POST', '/api/celebrate/wish', { to: 'lan' }, as('lan'))).status, 400);
  assert.equal((await api('POST', '/api/celebrate/wish', { to: 'cat' }, as('bob'))).status, 409);
  const sent = await api('POST', '/api/celebrate/wish', { to: 'lan' }, as('bob'));
  assert.equal(sent.status, 200, JSON.stringify(sent.json));
  await api('POST', '/api/celebrate/wish', { to: 'lan' }, as('bob'));
  await api('POST', '/api/celebrate/wish', { to: 'lan' }, as('cat'));
  assert.deepEqual((await view()).celebrations[0]?.wishes, ['bob', 'cat']);

  // Wishes are saved, so a restart keeps them for the rest of the day.
  await restart();
  assert.deepEqual((await view()).celebrations[0]?.wishes, ['bob', 'cat']);

  clock.now = new Date('2026-11-11T12:00:00Z');
  const next = await view();
  assert.deepEqual(next.celebrations.filter((c) => c.days === 0).map((c) => [c.username, c.wishes]), [['cat', []]]);
  await api('POST', '/api/celebrate/wish', { to: 'cat' }, as('lan'));
  assert.deepEqual((await view()).celebrations[0]?.wishes, ['lan']);
});

test('dates live in their own file, go into the backup, and deleted people are forgotten', async (t) => {
  const { api, join, as, view, celebrateFile, dataFile } = await setup(t);
  await join('lan', 'bob');
  await api('PATCH', '/api/celebrate/me', { birthday: '11-10' }, as('lan'));
  await api('POST', '/api/celebrate/wish', { to: 'lan' }, as('bob'));
  assert.deepEqual(JSON.parse(fs.readFileSync(celebrateFile, 'utf8')).people, [['lan', { birthday: '11-10', joined: null }]]);
  assert.equal(JSON.parse(fs.readFileSync(dataFile, 'utf8')).celebrate, undefined);

  const backup = (await api('GET', '/api/admin/data', undefined, ADMIN)).json;
  assert.deepEqual(backup.celebrate.people, [['lan', { birthday: '11-10', joined: null }]]);

  // A backup with dates for someone who isn't in it is refused before anything changes.
  const broken = structuredClone(backup);
  broken.celebrate.people.push(['ghost', { birthday: '01-01', joined: null }]);
  assert.equal((await api('PUT', '/api/admin/data', broken, ADMIN)).status, 400);
  assert.equal((await view()).celebrations.length, 1);

  assert.equal((await api('DELETE', '/api/admin/users/bob', undefined, ADMIN)).status, 200);
  assert.deepEqual((await view()).celebrations[0]?.wishes, []);
  assert.equal((await api('DELETE', '/api/admin/users/lan', undefined, ADMIN)).status, 200);
  assert.deepEqual((await view()).celebrations, []);

  // Restoring the old backup brings them back.
  assert.equal((await api('PUT', '/api/admin/data', backup, ADMIN)).status, 200);
  assert.deepEqual((await view()).celebrations[0]?.wishes, ['bob']);
});

test('two quick edits of different fields for one person both stay', async () => {
  const { createCelebrate } = await import('./core.ts');
  let release = () => {};
  let saves = 0;
  const celebrate = createCelebrate({
    saved: null,
    save: async () => {
      // The first save waits, so the next edits queue up behind it.
      if (++saves === 1) await new Promise<void>((done) => (release = done));
    },
    team: {
      player: () => ({ username: 'lan', pinVersion: 1 }),
      members: () => ['lan'],
      sign: () => '',
      requireAdmin: () => {},
    },
    now: () => new Date('2026-11-10T12:00:00Z'),
    timeZone: 'UTC',
  });
  const patch = (body: Record<string, unknown>, url: string) =>
    celebrate.handle({ method: 'PATCH', url: new URL(`http://x${url}`), header: () => undefined, readJson: async () => body });
  const first = patch({ birthday: '01-02' }, '/api/celebrate/me');
  await new Promise((done) => setTimeout(done, 10));
  const second = patch({ username: 'lan', joined: '2024-03-01' }, '/api/celebrate/admin');
  const third = patch({ birthday: '05-06' }, '/api/celebrate/me');
  await new Promise((done) => setTimeout(done, 10));
  release();
  await Promise.all([first, second]);
  assert.deepEqual((await third)?.body, { birthday: '05-06', joined: '2024-03-01' });
});

test('a damaged data file keeps what makes sense and still starts', async (t) => {
  const { celebrateFile, restart, view, join, api, as } = await setup(t);
  await join('lan');
  fs.writeFileSync(
    celebrateFile,
    JSON.stringify({ people: ['oops', ['lan', { birthday: '11-10', joined: 'never' }], [1, {}]], wishes: { day: 3, to: [['lan', 'x'], 'bad'] } }),
  );
  await restart();
  assert.deepEqual((await api('GET', '/api/celebrate/me', undefined, as('lan'))).json, { birthday: '11-10', joined: null });
  assert.equal((await view()).celebrations[0]?.username, 'lan');
});
