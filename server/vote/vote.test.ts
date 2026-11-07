// Tests for team voting's API, through a real Node.js server and its data files.
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createApp } from '../server.ts';
import { MAX_CLOSED, MAX_OPEN, type VoteData, type VoteView } from '../../shared/vote.ts';

const ADMIN = { 'x-admin-password': 'secret' };
const HOUR = 60 * 60 * 1000;

async function setup(t: TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minimap-vote-'));
  const dataFile = path.join(dir, 'data.json');
  const voteFile = path.join(dir, 'vote.json');
  fs.writeFileSync(path.join(dir, 'index.html'), '<div id="root"></div>');
  const clock = { now: new Date('2026-11-06T12:00:00Z') };
  let app = createApp({ dataFile, publicDir: dir, adminPassword: 'secret', now: () => clock.now });
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
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text };
  }

  const tokens = new Map<string, string>();
  async function join(...usernames: string[]) {
    for (const username of usernames) {
      await api('POST', '/api/admin/users', { username }, ADMIN);
      tokens.set(username, (await api('POST', '/api/claim', { username, pin: '1234' })).json.token);
    }
  }
  const as = (username: string) => ({ Authorization: `Bearer ${tokens.get(username)}` });
  const later = (ms: number) => new Date(clock.now.getTime() + ms).toISOString();
  const newVote = (body: object = {}) => ({
    title: 'Team lunch',
    endsAt: later(HOUR),
    options: ['Pho', 'Pizza', 'Sushi'],
    voters: ['ann', 'bob'],
    ...body,
  });
  async function create(owner: string, body: object = {}): Promise<VoteView> {
    const res = await api('POST', '/api/vote', newVote(body), as(owner));
    assert.equal(res.status, 201, res.text);
    return res.json;
  }
  const list = async (username?: string): Promise<VoteView[]> =>
    (await api('GET', '/api/vote', undefined, username ? as(username) : {})).json.votes;
  const ballot = (username: string, id: string, choices: unknown) => api('POST', `/api/vote/${id}/ballot`, { choices }, as(username));

  async function restart() {
    await app.stop();
    app = createApp({ dataFile, publicDir: dir, adminPassword: 'secret', now: () => clock.now });
    port = await app.start(0);
  }

  return { api, join, as, later, create, list, ballot, clock, voteFile, restart, newVote, port: () => port };
}

test('the /vote page is served', async (t) => {
  const { api } = await setup(t);
  const page = await api('GET', '/vote');
  assert.equal(page.status, 200);
  assert.equal(page.text, '<div id="root"></div>');
});

test('creating a vote checks the login and every field', async (t) => {
  const { api, join, as, later, newVote, create, list } = await setup(t);
  await join('ann', 'bob', 'cat');
  assert.equal((await api('POST', '/api/vote', newVote())).status, 401);
  for (const [body, message] of [
    [{ title: ' ' }, /name of 1 to 80/],
    [{ endsAt: later(-1) }, /already passed/],
    [{ endsAt: later(91 * 24 * HOUR) }, /90 days/],
    [{ options: ['Pho'] }, /2 to 20/],
    [{ options: ['Pho', 'PHO '] }, /same/],
    [{ voters: ['ann', 'zed'] }, /zed is not on the team/],
    [{ multi: 'yes' }, /on or off/],
  ] as const) {
    const res = await api('POST', '/api/vote', newVote(body), as('cat'));
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.json.error, message);
  }
  assert.deepEqual(await list(), [], 'nothing was made');

  const made = await create('cat', { anonymous: true, multi: true });
  assert.equal(made.owner, 'cat');
  assert.deepEqual(made.voters, ['ann', 'bob', 'cat'], 'the creator is always invited');
  assert.deepEqual(made.options.map((o) => [o.text, o.count]), [['Pho', 0], ['Pizza', 0], ['Sushi', 0]]);
  assert.deepEqual(made.mine, []);
  assert.equal((await list())[0]!.mine, undefined, 'no picks without a login');
  assert.equal((await api('GET', '/api/vote/nope/what', undefined, as('cat'))).status, 404);
});

test('only invited people vote, while it is open, with the right number of picks, and may change their vote', async (t) => {
  const { join, create, ballot, list, clock } = await setup(t);
  await join('ann', 'bob', 'cat');
  const single = await create('ann');
  const [pho, pizza, sushi] = single.options.map((o) => o.id) as [string, string, string];

  assert.equal((await ballot('cat', single.id, [pho])).status, 403, 'cat was not invited');
  assert.match((await ballot('bob', single.id, [pho, pizza])).json.error, /Pick one option/);
  assert.equal((await ballot('bob', single.id, ['nope'])).status, 400);
  assert.equal((await ballot('bob', 'missing', [pho])).status, 404);

  const first = await ballot('bob', single.id, [pho]);
  assert.equal(first.status, 200);
  assert.deepEqual(first.json.mine, [pho]);
  const changed = await ballot('bob', single.id, [sushi]);
  assert.deepEqual(changed.json.options.map((o: { count: number }) => o.count), [0, 0, 1], 'the last ballot counts');
  assert.deepEqual(changed.json.voted, ['bob']);
  assert.deepEqual(changed.json.options[2].pickedBy, ['bob'], 'named votes list who picked each option');
  assert.deepEqual((await list('bob'))[0]!.mine, [sushi]);
  assert.deepEqual((await list('ann'))[0]!.mine, []);

  const multi = await create('ann', { multi: true });
  assert.match((await ballot('ann', multi.id, [])).json.error, /at least one/);
  assert.equal((await ballot('ann', multi.id, multi.options.map((o) => o.id))).status, 200, 'no upper limit');

  clock.now = new Date(Date.parse(single.endsAt));
  const late = await ballot('ann', single.id, [pho]);
  assert.equal(late.status, 409);
  assert.equal(late.json.error, 'This vote has ended.');
});

test('custom options can be added by invited voters, up to 20, and a duplicate gives the existing one', async (t) => {
  const { api, join, as, create } = await setup(t);
  await join('ann', 'bob', 'cat');
  const fixed = await create('ann');
  assert.equal((await api('POST', `/api/vote/${fixed.id}/options`, { text: 'Tacos' }, as('bob'))).status, 403);

  const open = await create('ann', { allowCustom: true });
  const add = (who: string, text: unknown) => api('POST', `/api/vote/${open.id}/options`, { text }, as(who));
  assert.equal((await add('cat', 'Tacos')).status, 403, 'cat was not invited');
  assert.equal((await add('bob', '')).status, 400);
  const added = await add('bob', ' Tacos ');
  assert.equal(added.status, 200);
  assert.deepEqual(added.json.options.at(-1), { id: 'o4', text: 'Tacos', count: 0, pickedBy: [] });
  const again = await add('ann', 'tacos');
  assert.equal(again.status, 200);
  assert.equal(again.json.options.length, 4, 'a duplicate is not added twice');
  for (let i = 5; i <= 20; i++) assert.equal((await add('bob', `Place ${i}`)).status, 200);
  const full = await add('bob', 'One more');
  assert.equal(full.status, 409);
  assert.match(full.json.error, /20 options/);
  assert.equal((await add('bob', 'Pho')).status, 200, 'a duplicate still works when full');
});

test('the creator extends the end time; the creator or the admin deletes', async (t) => {
  const { api, join, as, create, later, clock, list } = await setup(t);
  await join('ann', 'bob');
  const vote = await create('ann');
  const extend = (who: string, endsAt: string) => api('PATCH', `/api/vote/${vote.id}`, { endsAt }, as(who));
  assert.equal((await extend('bob', later(2 * HOUR))).status, 403);
  assert.equal((await extend('ann', later(-HOUR))).status, 400);
  assert.equal((await extend('ann', later(91 * 24 * HOUR))).status, 400);
  const extended = await extend('ann', later(2 * HOUR));
  assert.equal(extended.status, 200);
  assert.equal(extended.json.endsAt, later(2 * HOUR));
  clock.now = new Date(clock.now.getTime() + 3 * HOUR);
  assert.equal((await extend('ann', later(HOUR))).status, 409, 'closed votes stay closed');

  const remove = (id: string, headers: Record<string, string>) => api('DELETE', `/api/vote/${id}`, undefined, headers);
  assert.equal((await remove(vote.id, {})).status, 401);
  const denied = await remove(vote.id, as('bob'));
  assert.equal(denied.status, 403);
  assert.equal(denied.json.error, 'Only the person who made this vote or the admin can delete it.');
  assert.equal((await remove(vote.id, { 'x-admin-password': 'nope' })).status, 401);
  assert.equal((await remove(vote.id, as('ann'))).status, 200);
  assert.equal((await remove(vote.id, as('ann'))).status, 404);
  const other = await create('bob');
  assert.equal((await remove(other.id, ADMIN)).status, 200);
  assert.deepEqual(await list(), []);
});

test('at most 30 open votes, and only the newest 100 closed ones are kept', async (t) => {
  const { api, join, as, create, newVote, clock, list, voteFile } = await setup(t);
  await join('ann', 'bob');
  for (let i = 0; i < MAX_OPEN; i++) await create('ann', { title: `Vote ${i}` });
  const full = await api('POST', '/api/vote', newVote(), as('bob'));
  assert.equal(full.status, 409);
  assert.equal(full.json.error, 'There are already 30 open votes. Wait for one to end or delete one.');

  // Each batch closes before the next, until more than 100 have closed.
  for (let batch = 1; batch < 4; batch++) {
    clock.now = new Date(clock.now.getTime() + 2 * HOUR);
    for (let i = 0; i < MAX_OPEN; i++) await create('ann', { title: `Batch ${batch} vote ${i}` });
  }
  clock.now = new Date(clock.now.getTime() + 2 * HOUR);
  await create('bob', { title: 'Newest' });
  const kept = await list();
  assert.equal(kept.length, MAX_CLOSED + 1);
  // 120 have closed, so 20 of the first, oldest batch were dropped.
  assert.equal(kept.filter((v) => v.title.startsWith('Vote ')).length, MAX_OPEN - 20);
  assert.equal((JSON.parse(fs.readFileSync(voteFile, 'utf8')) as VoteData).votes.length, MAX_CLOSED + 1);
});

test('anonymous votes never send anyone’s picks to anyone else, in replies or live updates', async (t) => {
  const { api, join, as, create, ballot, port } = await setup(t);
  await join('ann', 'bob', 'cat');
  const vote = await create('ann', { anonymous: true, voters: ['bob', 'cat'] });
  const [pho, pizza] = vote.options.map((o) => o.id) as [string, string];

  const events = await fetch(`http://127.0.0.1:${port()}/api/events`, { signal: AbortSignal.timeout(10_000) });
  const reader = events.body!.pipeThrough(new TextDecoderStream()).getReader();
  let stream = '';
  const nextVoteEvent = async (): Promise<string> => {
    for (;;) {
      const at = stream.indexOf('event: vote\ndata: ');
      const end = at < 0 ? -1 : stream.indexOf('\n\n', at);
      if (end >= 0) {
        const data = stream.slice(at + 18, end);
        stream = stream.slice(end + 2);
        return data;
      }
      stream += (await reader.read()).value ?? '';
    }
  };
  await nextVoteEvent(); // Sent when the stream opens.

  await ballot('bob', vote.id, [pho]);
  const live = await nextVoteEvent();
  const cast = (await ballot('cat', vote.id, [pizza])).json;
  const liveAgain = await nextVoteEvent();
  void reader.cancel();

  const replies = [
    live,
    liveAgain,
    JSON.stringify(cast),
    (await api('GET', '/api/vote', undefined, as('ann'))).text,
    (await api('GET', '/api/vote', undefined, as('bob'))).text,
    (await api('GET', '/api/vote')).text,
  ];
  for (const reply of replies) {
    const votes = JSON.parse(reply);
    const views: VoteView[] = Array.isArray(votes) ? votes : votes.votes ?? [votes];
    for (const view of views) {
      for (const option of view.options) assert.doesNotMatch(JSON.stringify(option), /ann|bob|cat/, reply);
      assert.equal('ballots' in view, false);
    }
  }
  assert.deepEqual(cast.mine, [pizza], 'each voter still sees their own picks');
  assert.deepEqual(JSON.parse(live)[0].voted, ['bob'], 'who has voted is public');
  assert.equal(JSON.parse(live)[0].mine, undefined, 'live updates never carry anyone’s picks');
});

test('a failed save changes nothing, and votes survive a restart', async (t) => {
  const { join, create, ballot, list, voteFile, restart } = await setup(t);
  await join('ann', 'bob');
  const vote = await create('ann');
  const [pho] = vote.options.map((o) => o.id) as [string];

  // A folder where the file should go makes every write fail.
  const saved = fs.readFileSync(voteFile, 'utf8');
  fs.rmSync(voteFile);
  fs.mkdirSync(path.join(voteFile, 'blocked'), { recursive: true });
  assert.equal((await ballot('bob', vote.id, [pho])).status, 500);
  assert.deepEqual((await list())[0]!.voted, [], 'the ballot was undone');
  fs.rmSync(voteFile, { recursive: true });
  fs.writeFileSync(voteFile, saved);

  assert.equal((await ballot('bob', vote.id, [pho])).status, 200);
  await restart();
  assert.deepEqual((await list('bob'))[0]!.mine, [pho]);
  const data = JSON.parse(fs.readFileSync(voteFile, 'utf8')) as VoteData;
  assert.deepEqual(data.votes[0]!.ballots, [['bob', [pho]]]);
});

test('deleting a person removes their ballots and invitations, and keeps their votes for the admin', async (t) => {
  const { api, join, as, create, ballot, list } = await setup(t);
  await join('ann', 'bob', 'cat');
  const theirs = await create('bob', { voters: ['ann', 'cat'], allowCustom: true });
  await api('POST', `/api/vote/${theirs.id}/options`, { text: 'Tacos' }, as('bob'));
  await ballot('bob', theirs.id, ['o4']);
  await ballot('ann', theirs.id, ['o4']);

  assert.equal((await api('DELETE', '/api/admin/users/bob', undefined, ADMIN)).status, 200);
  const [after] = await list();
  assert.equal(after!.owner, null);
  assert.deepEqual(after!.voters, ['ann', 'cat']);
  assert.deepEqual(after!.voted, ['ann']);
  assert.deepEqual(after!.options[3], { id: 'o4', text: 'Tacos', count: 1, pickedBy: ['ann'] });

  // Someone new with the same name doesn't get the old vote.
  await join('bob');
  assert.equal((await api('DELETE', `/api/vote/${theirs.id}`, undefined, as('bob'))).status, 403);
  assert.equal((await api('DELETE', `/api/vote/${theirs.id}`, undefined, ADMIN)).status, 200);
});

test('backups hold the raw votes, are checked against their people, and restore', async (t) => {
  const { api, join, create, ballot, list } = await setup(t);
  await join('ann', 'bob');
  const vote = await create('ann', { anonymous: true });
  await ballot('bob', vote.id, ['o2']);
  const backup = (await api('GET', '/api/admin/data', undefined, ADMIN)).json;
  assert.deepEqual(backup.vote.votes[0].ballots, [['bob', ['o2']]], 'anonymous ballots are in the backup');

  const broken = (change: (v: any) => void) => {
    const copy = structuredClone(backup);
    change(copy.vote.votes[0]);
    return copy;
  };
  for (const bad of [
    broken((v) => (v.owner = 'zed')),
    broken((v) => v.voters.push('zed')),
    broken((v) => (v.ballots = [['zed', ['o1']]])),
    broken((v) => (v.ballots = [['bob', ['o9']]])),
    broken((v) => (v.ballots = [['bob', ['o1', 'o2']]])),
    broken((v) => (v.options[0].addedBy = 'zed')),
    broken((v) => (v.endsAt = 'soon')),
  ]) {
    const res = await api('PUT', '/api/admin/data', bad, ADMIN);
    assert.equal(res.status, 400, JSON.stringify(bad.vote));
    assert.match(res.json.error, /vote 1/);
  }
  assert.deepEqual((await list())[0]!.voted, ['bob'], 'a bad backup changes nothing');

  await api('DELETE', `/api/vote/${vote.id}`, undefined, ADMIN);
  assert.equal((await api('PUT', '/api/admin/data', backup, ADMIN)).status, 200);
  const [restored] = await list();
  assert.equal(restored!.id, vote.id);
  assert.deepEqual(restored!.voted, ['bob']);

  const { vote: _, ...beforeVoting } = backup;
  assert.equal((await api('PUT', '/api/admin/data', beforeVoting, ADMIN)).status, 200);
  assert.deepEqual(await list(), [], 'older backups start with no votes');
});
