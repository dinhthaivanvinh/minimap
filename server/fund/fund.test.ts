// Tests for the team fund's API, through a real Node.js server, its data files and a pretend Google Sheet.
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createApp } from '../server.ts';
import type { FundAdminView, FundPerson } from '../../shared/fund.ts';

const ADMIN = { 'x-admin-password': 'secret' };
const LINK = 'https://docs.google.com/spreadsheets/d/1GZPUWxBnRo4uqO4mXbiTq78d6mn09PdTTAYVNP9uTLc/edit#gid=2018447032';
const TAB_2026 = ['"Name","","Title"', '"Ann Nguyen","-3","Ốt dột"', '"Bob","2","Tốn tiền"', '"Cat","0","Hm..."', '"Total Quỹ","",""'].join('\n');

async function setup(t: TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minimap-fund-'));
  const dataFile = path.join(dir, 'data.json');
  const fundFile = path.join(dir, 'fund.json');
  fs.writeFileSync(path.join(dir, 'index.html'), '<div id="root"></div>');
  const sheet = { body: TAB_2026, type: 'text/csv; charset=utf-8', status: 200, reads: [] as string[] };
  const fetchImpl = (async (address: string | URL) => {
    sheet.reads.push(String(address));
    return new Response(sheet.body, { status: sheet.status, headers: { 'Content-Type': sheet.type } });
  }) as typeof fetch;
  const options = { dataFile, publicDir: dir, adminPassword: 'secret', now: () => new Date('2026-11-09T12:00:00Z'), fetchImpl };
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
  const people = async (): Promise<FundPerson[]> => (await api('GET', '/api/fund')).json.people;
  async function setUp() {
    await join('ann', 'bob', 'cat');
    const res = await api('PATCH', '/api/fund/admin', { sheet: LINK, links: [['ann', 'Ann Nguyen'], ['bob', 'Bob'], ['cat', 'Cat']] }, ADMIN);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    return res.json as FundAdminView;
  }
  async function restart() {
    await app.stop();
    app = createApp(options);
    port = await app.start(0);
  }

  return { api, join, as, people, setUp, restart, sheet, fundFile };
}

test('nothing shows until the admin sets the fund up', async (t) => {
  const { api, people } = await setup(t);
  assert.deepEqual(await people(), []);
  assert.equal((await api('GET', '/api/fund/admin')).status, 401);
  assert.equal((await api('PATCH', '/api/fund/admin', { sheet: LINK })).status, 401);
});

test('the admin links usernames to names, and everyone sees titles and tiers', async (t) => {
  const { people, setUp, sheet } = await setup(t);
  const view = await setUp();
  assert.equal(view.year, 2026);
  assert.equal(view.error, null);
  assert.deepEqual(view.rows.map((r) => r.name), ['Ann Nguyen', 'Bob', 'Cat']);
  assert.match(sheet.reads.at(-1) ?? '', /sheet=2026/);
  assert.deepEqual(await people(), [
    { username: 'ann', title: 'Ốt dột', months: -3, tier: 'broke', hidden: false },
    { username: 'bob', title: 'Tốn tiền', months: 2, tier: 'rich', hidden: false },
    { username: 'cat', title: 'Hm...', months: 0, tier: 'normal', hidden: false },
  ]);
});

test('bad links and people who are not on the team are refused', async (t) => {
  const { api, join } = await setup(t);
  await join('ann');
  assert.equal((await api('PATCH', '/api/fund/admin', { sheet: 'https://example.com/sheet' }, ADMIN)).status, 400);
  assert.equal((await api('PATCH', '/api/fund/admin', { links: [['zed', 'Zed']] }, ADMIN)).status, 400);
  assert.equal((await api('PATCH', '/api/fund/admin', { links: [['ann', '']] }, ADMIN)).status, 400);
  assert.equal((await api('PATCH', '/api/fund/admin', { links: 'ann' }, ADMIN)).status, 400);
});

test('only people ahead can hide their look', async (t) => {
  const { api, as, people, setUp } = await setup(t);
  await setUp();
  const hide = (username: string, hidden: unknown) => api('PATCH', '/api/fund/me', { hidden }, as(username));
  assert.equal((await hide('ann', true)).status, 403);
  assert.equal((await hide('cat', true)).status, 403);
  assert.equal((await hide('bob', 'yes')).status, 400);
  assert.equal((await api('PATCH', '/api/fund/me', { hidden: true })).status, 401);
  assert.equal((await hide('bob', true)).status, 200);
  assert.equal((await people()).find((p) => p.username === 'bob')?.hidden, true);
  assert.equal((await hide('bob', false)).status, 200);
  assert.equal((await people()).find((p) => p.username === 'bob')?.hidden, false);
});

test('a missing tab or a private sheet keeps the last rows and tells the admin', async (t) => {
  const { api, people, setUp, sheet } = await setup(t);
  await setUp();
  sheet.body = '"1","Rick","500 đ"';
  let view = (await api('POST', '/api/fund/admin/refresh', undefined, ADMIN)).json as FundAdminView;
  assert.match(view.error ?? '', /tab named 2026/);
  assert.equal((await people()).length, 3);

  sheet.type = 'text/html; charset=utf-8';
  sheet.body = '<html>Sign in</html>';
  view = (await api('POST', '/api/fund/admin/refresh', undefined, ADMIN)).json as FundAdminView;
  assert.match(view.error ?? '', /Anyone with the link/);

  sheet.type = 'text/csv';
  sheet.body = TAB_2026.replace('"Bob","2"', '"Bob","-1"');
  view = (await api('POST', '/api/fund/admin/refresh', undefined, ADMIN)).json as FundAdminView;
  assert.equal(view.error, null);
  assert.equal((await people()).find((p) => p.username === 'bob')?.tier, 'debtor');
});

test('the fund survives a restart, and a deleted person is forgotten', async (t) => {
  const { api, as, people, setUp, restart, fundFile } = await setup(t);
  await setUp();
  await api('PATCH', '/api/fund/me', { hidden: true }, as('bob'));
  await restart();
  assert.equal((await people()).length, 3);
  assert.equal((await people()).find((p) => p.username === 'bob')?.hidden, true);
  assert.equal((await api('DELETE', '/api/admin/users/bob', undefined, ADMIN)).status, 200);
  assert.deepEqual((await people()).map((p) => p.username), ['ann', 'cat']);
  const stored = JSON.parse(fs.readFileSync(fundFile, 'utf8'));
  assert.deepEqual(stored.hidden, []);
  assert.ok(!stored.links.some(([username]: [string]) => username === 'bob'));
});

test('the fund goes into backups and comes back on restore', async (t) => {
  const { api, people, setUp } = await setup(t);
  await setUp();
  const backup = (await api('GET', '/api/admin/data', undefined, ADMIN)).json;
  assert.equal(backup.fund.sheet, LINK);
  assert.equal(backup.fund.links.length, 3);

  await api('PATCH', '/api/fund/admin', { links: [] }, ADMIN);
  assert.deepEqual(await people(), []);
  assert.equal((await api('PUT', '/api/admin/data', backup, ADMIN)).status, 200);
  assert.equal((await people()).length, 3);

  const broken = { ...backup, fund: { ...backup.fund, hidden: ['nobody'] } };
  assert.equal((await api('PUT', '/api/admin/data', broken, ADMIN)).status, 400);
});
