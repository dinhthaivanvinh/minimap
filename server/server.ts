// Team Minimap server. Node.js built-ins only: run with `node server/server.ts`.

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  isHexColor,
  isOnFace,
  MAX_DRAWING_POINTS,
  MAX_STROKE_WIDTH,
  MAX_STROKES,
  MIN_STROKE_WIDTH,
  WORN_ITEMS,
  type CharacterDesign,
  type Stroke,
} from '../shared/look.ts';
import type { AuthResult, Clock, OfficeLocation, Place, TeamState, Weather } from '../shared/types.ts';

type Req = http.IncomingMessage;
type Res = http.ServerResponse;
type JsonBody = Record<string, unknown>;

interface StoredUser {
  username: string;
  nickname: string;
  place: string | null;
  status: string;
  updatedAt: string | null;
  pinHash: string | null;
  pinVersion: number;
  look?: CharacterDesign | null;
}

interface Settings {
  publicUrl: string;
  clocks: Clock[];
  office: OfficeLocation | null;
}

interface Data {
  secret: string;
  lastResetDate: string;
  places: Place[];
  settings: Settings;
  users: StoredUser[];
}

export interface AppOptions {
  dataFile: string;
  publicDir?: string;
  adminPassword: string;
  resetAt?: string;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

const ROOT = path.join(import.meta.dirname, '..');

const FIXED_PLACES = ['wfh', 'off', 'out']; // Offices come from data.places.
const MAX_NICKNAME = 24;
const MAX_STATUS = 140;
const MAX_BODY = 16 * 1024;
const LOCK_AFTER = 5;
const LOCK_MS = 60 * 1000;
const USERNAME_RE = /^[a-zA-Z0-9._-]{1,32}$/;
const PIN_RE = /^\d{4}$/;
const MAX_CLOCK_LABEL = 24;
const MAX_PUBLIC_URL = 300;
const MAX_OFFICE_NAME = 120;
const WEATHER_EVERY_MS = 15 * 60 * 1000;
const WEATHER_TIMEOUT_MS = 8000;
const WEATHER_STALE_MS = 3 * 60 * 60 * 1000;
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

const DEFAULT_SETTINGS: Settings = {
  publicUrl: '',
  clocks: [
    { label: 'Vietnam', timeZone: 'Asia/Ho_Chi_Minh' },
    { label: 'UTC', timeZone: 'UTC' },
  ],
  office: null,
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// React decides which page to show, so these all serve the same file.
const PAGES = new Set(['/', '/me', '/admin']);

class ApiError extends Error {
  status: number;
  retryAfter: number | undefined;

  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---- Date helpers -------------------------------------------------------

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The most recent date on which the reset time has already passed.
export function latestResetDate(now: Date, resetAt: string): string {
  const [h = 0, m = 0] = resetAt.split(':').map(Number);
  const passed = now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
  if (passed) return localDate(now);
  return localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
}

// ---- Settings validation ------------------------------------------------

function cleanPublicUrl(value: unknown): string {
  const url = String(value ?? '').trim();
  if (!url) return '';
  let protocol = '';
  try {
    protocol = new URL(url).protocol;
  } catch {}
  if (url.length > MAX_PUBLIC_URL || !['http:', 'https:'].includes(protocol)) {
    throw new ApiError(400, 'The team address must be a full address starting with http:// or https://.');
  }
  return url;
}

function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function cleanClocks(value: unknown): Clock[] {
  if (!Array.isArray(value) || value.length !== 2) throw new ApiError(400, 'Set exactly two clocks.');
  return value.map((clock: Partial<Clock> | null) => {
    const label = String(clock?.label ?? '').trim();
    if (!label || [...label].length > MAX_CLOCK_LABEL) {
      throw new ApiError(400, `Clock names must be 1 to ${MAX_CLOCK_LABEL} characters.`);
    }
    const timeZone = clock?.timeZone;
    if (!isTimeZone(timeZone)) throw new ApiError(400, `Unknown time zone for ${label}. Pick one from the list.`);
    return { label, timeZone };
  });
}

function cleanOffice(value: unknown): OfficeLocation | null {
  if (value === null) return null;
  const { name, latitude, longitude } = (value ?? {}) as Partial<OfficeLocation>;
  const validName = typeof name === 'string' && name.trim() !== '' && name.length <= MAX_OFFICE_NAME;
  const validLatitude = typeof latitude === 'number' && Math.abs(latitude) <= 90;
  const validLongitude = typeof longitude === 'number' && Math.abs(longitude) <= 180;
  if (!validName || !validLatitude || !validLongitude) {
    throw new ApiError(400, 'That location is not valid. Search for it again.');
  }
  return { name: name.trim(), latitude, longitude };
}

function cleanStroke(value: Partial<Stroke> | null): Stroke | null {
  const { color, width, points } = value ?? {};
  const validWidth = typeof width === 'number' && width >= MIN_STROKE_WIDTH && width <= MAX_STROKE_WIDTH;
  if (!isHexColor(color) || !validWidth || !Array.isArray(points)) return null;
  if (points.length < 2 || points.length % 2 !== 0) return null;

  for (let i = 0; i < points.length; i += 2) {
    const [x, y] = [points[i], points[i + 1]];
    if (typeof x !== 'number' || typeof y !== 'number' || !isOnFace(x, y)) return null;
  }
  return { color, width, points: points.map((n: number) => Math.round(n * 10) / 10) };
}

function cleanLook(value: unknown): CharacterDesign | null {
  if (value === null) return null;
  const invalid = new ApiError(400, 'That character could not be saved. Clear the drawing and try again.');
  const { color, wearing = [], strokes } = (value ?? {}) as Partial<CharacterDesign>;
  if (!isHexColor(color) || !Array.isArray(strokes) || !Array.isArray(wearing)) throw invalid;
  if (!wearing.every((item) => WORN_ITEMS.includes(item))) throw invalid;

  const cleaned = strokes.map(cleanStroke);
  if (cleaned.includes(null)) throw invalid;
  const total = strokes.reduce((sum, stroke) => sum + stroke.points.length / 2, 0);
  if (strokes.length > MAX_STROKES || total > MAX_DRAWING_POINTS) {
    throw new ApiError(400, 'That drawing is too big. Undo a few strokes and try again.');
  }
  return { color, wearing: WORN_ITEMS.filter((item) => wearing.includes(item)), strokes: cleaned as Stroke[] };
}

// ---- App ----------------------------------------------------------------

export function createApp({
  dataFile,
  publicDir = path.join(ROOT, 'dist'),
  adminPassword,
  resetAt = '05:00',
  now = () => new Date(),
  fetchImpl = fetch,
}: AppOptions) {
  if (!adminPassword) throw new Error('ADMIN_PASSWORD is required');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(resetAt)) throw new Error('RESET_AT must look like 05:00');

  const data = load();
  const sseClients = new Set<Res>();
  const failures = new Map<string, { count: number; lockedUntil: number }>();
  let weather: Weather | null = null; // Kept in memory only; refetched when the server starts.
  let weatherRun = 0;

  // ---- Storage ----------------------------------------------------------

  function load(): Data {
    const saved: Partial<Data> | null = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : null;
    return {
      secret: saved?.secret || crypto.randomBytes(32).toString('hex'),
      places: saved?.places || [
        { id: 'main', name: 'Main Office', kind: 'office' },
        { id: 'other', name: 'Other Office', kind: 'office' },
      ],
      users: saved?.users || [],
      settings: { ...DEFAULT_SETTINGS, ...saved?.settings },
      // A new install has nothing to reset, so start the clock from today.
      lastResetDate: saved?.lastResetDate || (saved ? '' : latestResetDate(now(), resetAt)),
    };
  }

  function save(): void {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    const tmp = `${dataFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, dataFile);
  }

  function publicState(): TeamState {
    const { publicUrl, clocks, office } = data.settings;
    return {
      places: data.places,
      settings: { publicUrl, clocks, officeName: office?.name || '' },
      weather,
      users: data.users.map((u) => ({
        username: u.username,
        nickname: u.nickname,
        place: u.place,
        status: u.status,
        updatedAt: u.updatedAt,
        claimed: Boolean(u.pinHash),
        // Characters saved before accessories existed have no "wearing" list.
        look: u.look ? { color: u.look.color, wearing: u.look.wearing ?? [], strokes: u.look.strokes } : null,
      })),
    };
  }

  function broadcast(): void {
    const payload = `data: ${JSON.stringify(publicState())}\n\n`;
    for (const res of sseClients) res.write(payload);
  }

  function commit(): void {
    save();
    broadcast();
  }

  // ---- Weather ----------------------------------------------------------

  async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return (await res.json()) as T;
  }

  async function refreshWeather(): Promise<void> {
    const { office } = data.settings;
    const run = ++weatherRun;
    if (!office) {
      weather = null;
      return;
    }
    const params = new URLSearchParams({
      latitude: String(office.latitude),
      longitude: String(office.longitude),
      current: 'temperature_2m,weather_code,is_day',
      timezone: 'auto',
    });
    try {
      const { current } = await fetchJson<{
        current?: { temperature_2m: number; weather_code: number; is_day: number };
      }>(`${FORECAST_URL}?${params}`);
      if (run !== weatherRun) return; // The location changed while this was running.
      if (typeof current?.temperature_2m !== 'number') throw new Error('unexpected reply');
      weather = {
        temperature: current.temperature_2m,
        code: current.weather_code,
        isDay: current.is_day === 1,
        updatedAt: now().toISOString(),
      };
    } catch (err) {
      if (run !== weatherRun) return;
      console.error(`Could not update the weather: ${errorText(err)}`);
      // A short outage keeps the last reading; old readings are worse than none.
      const isStale = weather && now().getTime() - new Date(weather.updatedAt).getTime() > WEATHER_STALE_MS;
      if (!isStale) return;
      weather = null;
    }
    broadcast();
  }

  async function searchPlaces(query: string): Promise<OfficeLocation[]> {
    const params = new URLSearchParams({ name: query, count: '6', language: 'en', format: 'json' });
    try {
      const { results = [] } = await fetchJson<{
        results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[];
      }>(`${GEOCODE_URL}?${params}`);
      const places = results.map((r) => ({
        name: [r.name, r.admin1 === r.name ? null : r.admin1, r.country].filter(Boolean).join(', '),
        latitude: r.latitude,
        longitude: r.longitude,
      }));
      // Results come best match first, so keep the first of any repeated name.
      return places.filter((place, i) => places.findIndex((p) => p.name === place.name) === i);
    } catch (err) {
      console.error(`Could not search for a location: ${errorText(err)}`);
      throw new ApiError(502, 'Could not reach the weather service. Check that the server has internet access.');
    }
  }

  // ---- Daily reset ------------------------------------------------------

  function runResetIfDue(): boolean {
    const due = latestResetDate(now(), resetAt);
    if (data.lastResetDate >= due) return false;
    for (const u of data.users) {
      u.place = null;
      u.status = '';
    }
    data.lastResetDate = due;
    commit();
    return true;
  }

  // ---- Auth -------------------------------------------------------------

  function hashPin(pin: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    return `${salt}:${crypto.scryptSync(pin, salt, 32).toString('hex')}`;
  }

  function pinMatches(pin: string, stored: string): boolean {
    const [salt = '', hash = ''] = stored.split(':');
    return safeEqual(crypto.scryptSync(pin, salt, 32).toString('hex'), hash);
  }

  function safeEqual(a: unknown, b: unknown): boolean {
    const ab = crypto.createHash('sha256').update(String(a)).digest();
    const bb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ab, bb);
  }

  function signature(user: StoredUser): string {
    return crypto
      .createHmac('sha256', data.secret)
      .update(`${user.username}:${user.pinVersion}`)
      .digest('hex');
  }

  function tokenFor(user: StoredUser): string {
    return `${encodeURIComponent(user.username)}.${user.pinVersion}.${signature(user)}`;
  }

  function userFromToken(req: Req): StoredUser {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const [name, , sig] = token.split('.');
    let user: StoredUser | undefined;
    try {
      user = name ? findUser(decodeURIComponent(name)) : undefined;
    } catch {} // A malformed token simply matches nobody.
    if (!user || !user.pinHash || !sig || !safeEqual(sig, signature(user))) {
      throw new ApiError(401, 'Please log in again.');
    }
    return user;
  }

  function checkLock(key: string): void {
    const entry = failures.get(key);
    if (entry && entry.lockedUntil > now().getTime()) {
      const seconds = Math.ceil((entry.lockedUntil - now().getTime()) / 1000);
      throw new ApiError(429, `Too many tries. Wait ${seconds} seconds.`, seconds);
    }
  }

  function recordFailure(key: string): void {
    const entry = failures.get(key) || { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= LOCK_AFTER) {
      entry.count = 0;
      entry.lockedUntil = now().getTime() + LOCK_MS;
    }
    failures.set(key, entry);
  }

  function requireAdmin(req: Req): void {
    checkLock('admin');
    if (!safeEqual(req.headers['x-admin-password'] || '', adminPassword)) {
      recordFailure('admin');
      throw new ApiError(401, 'Wrong admin password.');
    }
    failures.delete('admin');
  }

  // ---- Helpers ----------------------------------------------------------

  function findUser(username: unknown): StoredUser | undefined {
    const key = String(username).toLowerCase();
    return data.users.find((u) => u.username.toLowerCase() === key);
  }

  function mustFindUser(username: unknown): StoredUser {
    const user = findUser(username);
    if (!user) throw new ApiError(404, 'That username does not exist.');
    return user;
  }

  function validPlaces(): string[] {
    return [...data.places.map((p) => p.id), ...FIXED_PLACES];
  }

  function readJson(req: Req): Promise<JsonBody> {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(new ApiError(413, 'Request too large.'));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        try {
          const body: unknown = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
          resolve(body as JsonBody);
        } catch {
          reject(new ApiError(400, 'Invalid JSON.'));
        }
      });
      req.on('error', reject);
    });
  }

  function send(res: Res, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  // ---- Routes -----------------------------------------------------------

  function openEvents(req: Req, res: Res): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`data: ${JSON.stringify(publicState())}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  }

  async function handleApi(req: Req, res: Res, url: URL): Promise<void> {
    const route = `${req.method} ${url.pathname}`;

    if (route === 'GET /api/state') return send(res, 200, publicState());
    if (route === 'GET /api/events') return openEvents(req, res);

    if (route === 'GET /api/admin/check') {
      requireAdmin(req);
      return send(res, 200, { ok: true });
    }

    if (route === 'PATCH /api/admin/settings') {
      requireAdmin(req);
      const body = await readJson(req);
      const next: Partial<Settings> = {};
      if ('publicUrl' in body) next.publicUrl = cleanPublicUrl(body.publicUrl);
      if ('clocks' in body) next.clocks = cleanClocks(body.clocks);
      if ('office' in body) next.office = cleanOffice(body.office);
      Object.assign(data.settings, next);
      if ('office' in next) weather = null;
      commit();
      if ('office' in next) void refreshWeather();
      return send(res, 200, { ok: true });
    }

    if (route === 'GET /api/admin/places') {
      requireAdmin(req);
      const query = (url.searchParams.get('q') || '').trim();
      if (query.length < 2 || query.length > 100) throw new ApiError(400, 'Type at least 2 letters of a city name.');
      return send(res, 200, { results: await searchPlaces(query) });
    }

    if (route === 'POST /api/admin/users') {
      requireAdmin(req);
      const { username } = await readJson(req);
      const name = String(username ?? '').trim();
      if (!USERNAME_RE.test(name)) {
        throw new ApiError(400, 'Usernames can use letters, numbers, dot, dash and underscore (max 32).');
      }
      if (findUser(name)) throw new ApiError(409, 'That username already exists.');
      data.users.push({
        username: name,
        nickname: name,
        place: null,
        status: '',
        updatedAt: null,
        pinHash: null,
        pinVersion: 1,
      });
      commit();
      return send(res, 201, { ok: true });
    }

    const adminMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)(\/release)?$/);
    if (adminMatch) {
      const username = decodeURIComponent(adminMatch[1] ?? '');
      if (req.method === 'DELETE' && !adminMatch[2]) {
        requireAdmin(req);
        const user = mustFindUser(username);
        data.users.splice(data.users.indexOf(user), 1);
        commit();
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && adminMatch[2]) {
        requireAdmin(req);
        const user = mustFindUser(username);
        user.pinHash = null;
        user.pinVersion += 1; // Invalidates tokens already handed out.
        failures.delete(`user:${user.username}`);
        commit();
        return send(res, 200, { ok: true });
      }
    }

    if (route === 'POST /api/claim') {
      const { username, pin } = await readJson(req);
      const user = mustFindUser(username);
      if (user.pinHash) throw new ApiError(409, 'That username is already claimed.');
      if (!PIN_RE.test(String(pin ?? ''))) throw new ApiError(400, 'The PIN must be exactly 4 digits.');
      user.pinHash = hashPin(String(pin));
      commit();
      return send(res, 200, { token: tokenFor(user), username: user.username } satisfies AuthResult);
    }

    if (route === 'POST /api/login') {
      const { username, pin } = await readJson(req);
      const user = mustFindUser(username);
      const key = `user:${user.username}`;
      checkLock(key);
      if (!user.pinHash) throw new ApiError(409, 'That username has not been claimed yet.');
      if (!pinMatches(String(pin ?? ''), user.pinHash)) {
        recordFailure(key);
        throw new ApiError(401, 'Wrong PIN.');
      }
      failures.delete(key);
      return send(res, 200, { token: tokenFor(user), username: user.username } satisfies AuthResult);
    }

    if (route === 'PATCH /api/me') {
      const user = userFromToken(req);
      const body = await readJson(req);
      const next: Partial<StoredUser> = {};
      if ('nickname' in body) {
        const nickname = String(body.nickname ?? '').trim();
        if (!nickname) throw new ApiError(400, 'The nickname cannot be empty.');
        if ([...nickname].length > MAX_NICKNAME) throw new ApiError(400, `Nicknames can be at most ${MAX_NICKNAME} characters.`);
        next.nickname = nickname;
      }
      if ('place' in body) {
        const place = body.place;
        if (place !== null && (typeof place !== 'string' || !validPlaces().includes(place))) {
          throw new ApiError(400, 'Unknown place.');
        }
        next.place = place;
      }
      if ('status' in body) {
        const status = String(body.status ?? '').trim();
        if ([...status].length > MAX_STATUS) throw new ApiError(400, `Statuses can be at most ${MAX_STATUS} characters.`);
        next.status = status;
      }
      // "Updated at" tells teammates when someone's whereabouts changed, not their outfit.
      const isWhereabouts = Object.keys(next).length > 0;
      if ('look' in body) next.look = cleanLook(body.look);
      Object.assign(user, next, isWhereabouts ? { updatedAt: now().toISOString() } : {});
      commit();
      return send(res, 200, { ok: true });
    }

    throw new ApiError(404, 'Not found.');
  }

  function serveStatic(req: Req, res: Res, url: URL): void {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end();
      return;
    }
    let relative = 'index.html';
    if (!PAGES.has(url.pathname)) {
      try {
        relative = decodeURIComponent(url.pathname).slice(1);
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
    }
    const file = path.resolve(publicDir, relative);
    const root = path.resolve(publicDir) + path.sep;
    const type = MIME[path.extname(file)];
    if (!file.startsWith(root) || !type || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    // Vite puts a content hash in these file names, so they can be cached for good.
    const cache = url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else serveStatic(req, res, url);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.retryAfter) res.setHeader('Retry-After', err.retryAfter);
        send(res, err.status, { error: err.message });
      } else if (err instanceof TypeError && err.message.includes('Invalid URL')) {
        send(res, 400, { error: 'Invalid address.' });
      } else {
        console.error(err);
        send(res, 500, { error: 'Something went wrong on the server.' });
      }
    }
  });

  let resetTimer: NodeJS.Timeout | undefined;
  let pingTimer: NodeJS.Timeout | undefined;
  let weatherTimer: NodeJS.Timeout | undefined;

  function start(port: number): Promise<number> {
    runResetIfDue();
    save();
    void refreshWeather();
    resetTimer = setInterval(runResetIfDue, 30 * 1000);
    weatherTimer = setInterval(() => void refreshWeather(), WEATHER_EVERY_MS);
    // Comment lines keep SSE connections alive through idle proxies.
    pingTimer = setInterval(() => {
      for (const res of sseClients) res.write(': ping\n\n');
    }, 25 * 1000);
    return new Promise((resolve) => {
      server.listen(port, () => resolve((server.address() as { port: number }).port));
    });
  }

  function stop(): Promise<void> {
    clearInterval(resetTimer);
    clearInterval(pingTimer);
    clearInterval(weatherTimer);
    for (const res of sseClients) res.end();
    sseClients.clear();
    return new Promise((resolve) => server.close(() => resolve()));
  }

  return { start, stop, runResetIfDue, refreshWeather };
}

if (import.meta.main) {
  // A local .env is read when present; Docker passes real environment variables.
  const envFile = path.join(ROOT, '.env');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error('ADMIN_PASSWORD is not set. Copy .env.example to .env and set a password.');
    process.exit(1);
  }

  const app = createApp({
    dataFile: process.env.DATA_FILE || path.join(ROOT, 'data', 'data.json'),
    adminPassword,
    resetAt: process.env.RESET_AT || '05:00',
  });

  const distIndex = path.join(ROOT, 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) console.warn('The pages are not built yet. Run `npm run build`, or use `npm start`.');

  void app.start(Number(process.env.PORT) || 8080).then((port) => {
    console.log(`Team Minimap running on http://localhost:${port}`);
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => void app.stop().then(() => process.exit(0)));
  }
}
