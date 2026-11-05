// Adds or removes 20 pretend team members, to try the map with a full team.
//
//   npm run test-members            add them, or put them back where they started
//   npm run test-members -- remove  remove them
//
// It only ever touches usernames test01 to test20 that use the PIN below.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CharacterDesign } from '../shared/look.ts';

const PIN = '1234';

interface Member {
  nickname: string;
  place: string;
  status?: string;
  look?: CharacterDesign;
  /** Schedules Out of Office this many hours from now, with this message. */
  leaving?: { inHours: number; status: string };
}

const INK = '#2a2657';
const RED = '#e5383b';

const MEMBERS: Member[] = [
  { nickname: 'Test An', place: 'main', leaving: { inHours: 2, status: 'Dentist appointment' } },
  { nickname: 'Test Bình', place: 'main', status: 'In a meeting', leaving: { inHours: 3, status: '' } },
  { nickname: 'Test Chi', place: 'main', look: { color: '#a9714b', wearing: ['glasses'], strokes: [] } },
  { nickname: 'Test Dũng', place: 'main', status: 'Leave at 4pm' },
  { nickname: 'Test Giang', place: 'main', status: 'Out for a client visit until about 3pm, call me if it is urgent' },
  { nickname: 'Test Hải', place: 'main', look: { color: '#ffd23f', wearing: ['hat'], strokes: [] } },
  { nickname: 'Test Nguyễn Thị Minh Anh', place: 'main' },
  { nickname: 'Test Khánh', place: 'wfh' },
  { nickname: 'Test Lan', place: 'wfh', status: 'Back soon' },
  { nickname: 'Test Long', place: 'wfh', look: { color: '#8fc9ff', wearing: ['mustache'], strokes: [] } },
  { nickname: 'Test My', place: 'wfh', status: 'Waiting for a delivery, may be slow to reply this morning' },
  { nickname: 'Test Nga', place: 'wfh' },
  {
    nickname: 'Test Oanh',
    place: 'wfh',
    look: {
      color: '#f6c9a0',
      wearing: [],
      strokes: [
        { color: RED, width: 3.5, points: [14, 47, 17, 49] },
        { color: RED, width: 3.5, points: [50, 47, 47, 49] },
      ],
    },
  },
  { nickname: 'Test Phúc', place: 'wfh' },
  { nickname: 'Test Quỳnh', place: 'other' },
  { nickname: 'Test Sơn', place: 'other', status: 'Training' },
  {
    nickname: 'Test Tâm',
    place: 'other',
    look: { color: '#6f4a33', wearing: ['hat', 'glasses'], strokes: [{ color: INK, width: 2, points: [26, 28, 30, 27] }] },
  },
  { nickname: 'Test Uyên', place: 'out', status: 'Client visit' },
  { nickname: 'Test Việt', place: 'out', look: { color: '#ffe3cc', wearing: ['glasses', 'mustache'], strokes: [] } },
  { nickname: 'Test Xuân', place: 'off', status: 'Left early' },
];

const root = path.join(import.meta.dirname, '..');
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) {
  console.error('ADMIN_PASSWORD is not set. Copy .env.example to .env and set a password.');
  process.exit(1);
}
const adminHeaders = { 'x-admin-password': adminPassword };
const base = `http://localhost:${process.env.PORT || 8080}`;

async function call(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; token?: string };
  return { status: res.status, json };
}

const usernameOf = (index: number) => `test${String(index + 1).padStart(2, '0')}`;

/** A login token, or null if this username belongs to someone else. */
async function tokenFor(username: string): Promise<string | null> {
  const claimed = await call('POST', '/api/claim', { username, pin: PIN });
  if (claimed.status === 200) return claimed.json.token ?? null;
  const login = await call('POST', '/api/login', { username, pin: PIN });
  return login.status === 200 ? (login.json.token ?? null) : null;
}

async function add() {
  let ready = 0;
  for (const [index, member] of MEMBERS.entries()) {
    const username = usernameOf(index);
    await call('POST', '/api/admin/users', { username }, adminHeaders);
    const token = await tokenFor(username);
    if (!token) {
      console.log(`Skipped ${username}: it is already in use by someone else.`);
      continue;
    }
    const { nickname, place, status = '', look = null, leaving } = member;
    const auth = { Authorization: `Bearer ${token}` };
    const saved = await call('PATCH', '/api/me', { nickname, place, status, look }, auth);
    if (saved.status === 200) ready += 1;
    else console.log(`Could not set up ${username}: ${saved.json.error}`);
    if (leaving) {
      const at = new Date(Date.now() + leaving.inHours * 60 * 60 * 1000).toISOString();
      const scheduled = await call('PATCH', '/api/me', { scheduled: { at, status: leaving.status } }, auth);
      // Close to the morning reset the time is refused. The member is still fine without it.
      if (scheduled.status !== 200) console.log(`No scheduled change for ${username}: ${scheduled.json.error}`);
    }
  }
  console.log(`${ready} test members are ready.`);
}

async function remove() {
  let removed = 0;
  for (const index of MEMBERS.keys()) {
    const username = usernameOf(index);
    const login = await call('POST', '/api/login', { username, pin: PIN });
    if (login.status !== 200) continue; // Not one of ours, or already gone.
    const deleted = await call('DELETE', `/api/admin/users/${username}`, undefined, adminHeaders);
    if (deleted.status === 200) removed += 1;
  }
  console.log(`Removed ${removed} test members.`);
}

try {
  await (process.argv[2] === 'remove' ? remove() : add());
} catch {
  console.error(`Could not reach the app at ${base}. Start it with npm start first.`);
  process.exit(1);
}
