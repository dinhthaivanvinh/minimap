// The API itself: data, rules, auth, the daily reset and weather. It knows nothing about
// how requests arrive or where data is kept, so the same code runs on Node.js
// (server.ts) and on Cloudflare Workers (worker/index.ts).

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
import type { AuthResult, MeUpdateResult, TeamUser, Clock, OfficeLocation, Place, ScheduledChange, SunTimes, TeamState, Weather } from '../shared/types.ts';

export type JsonBody = Record<string, unknown>;

interface StoredUser {
  username: string;
  nickname: string;
  place: string | null;
  status: string;
  updatedAt: string | null;
  pinHash: string | null;
  pinVersion: number;
  look?: CharacterDesign | null;
  scheduled?: ScheduledChange | null;
}

interface Settings {
  publicUrl: string;
  clocks: Clock[];
  office: OfficeLocation | null;
  mapWeather: boolean;
}

export interface Data {
  secret: string;
  lastResetDate: string;
  places: Place[];
  settings: Settings;
  users: StoredUser[];
}

// One API request, however it arrived. readJson is only called by routes that take a body.
export interface ApiRequest {
  method: string;
  url: URL;
  header(name: string): string | undefined;
  readJson(maxBytes?: number): Promise<JsonBody>; // maxBytes defaults to MAX_BODY.
}

export interface ApiResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

/** What a feature with its own data may ask the team's core (see AGENTS.md). */
export interface Team {
  /** Who sent the request, from their login token. Throws a 401 when nobody is logged in. */
  player(req: ApiRequest): { username: string; pinVersion: number };
  members(): string[];
  /** Signs text with the team's secret. The purpose keeps signatures for different uses apart. */
  sign(purpose: string, text: string): string;
  /** Checks the x-admin-password header, with the same lockout as the admin page. Throws a 401 or 429. */
  requireAdmin(req: ApiRequest): void;
}

/** A feature that keeps its own data but still belongs in the admin's one backup file. */
export interface TeamFeature {
  /** Its key in the backup file. */
  key: string;
  /** Its part of a backup, or undefined to leave the key out. */
  backup(): unknown;
  /** Checks its part of a backup (throw backupError) before anything changes, and returns how to restore it. */
  checkBackup(value: unknown, usernames: ReadonlySet<string>): () => Promise<void>;
  /** Drops what it keeps about people who were deleted. */
  forget(usernames: string[]): Promise<void>;
}

export interface CoreOptions {
  saved: Partial<Data> | null; // What was stored last time, or null on a first run.
  save: (data: Data) => void;
  onChange: (state: TeamState) => void; // Tell connected maps about the new state.
  adminPassword: string;
  resetAt?: string;
  timeZone?: string; // For resetAt. Left out, the computer's own time zone is used.
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

const FIXED_PLACES = ['wfh', 'off', 'out']; // Offices come from data.places.
const MAX_NICKNAME = 24;
const MAX_STATUS = 140;
const SCHEDULED_PLACE = 'out'; // Scheduling only moves people to Out of Office for now.
export const MAX_BODY = 16 * 1024;
// A whole backup. Cloudflare stores the data as one value, which can be at most 2 MB.
const MAX_BACKUP = 2 * 1024 * 1024;
const LOCK_AFTER = 5;
const LOCK_MS = 60 * 1000;
const USERNAME_RE = /^[a-zA-Z0-9._-]{1,32}$/;
const PIN_RE = /^\d{4}$/;
const MAX_CLOCK_LABEL = 24;
const MAX_PUBLIC_URL = 300;
const MAX_OFFICE_NAME = 120;
export const WEATHER_EVERY_MS = 15 * 60 * 1000;
const WEATHER_TIMEOUT_MS = 8000;
const WEATHER_STALE_MS = 3 * 60 * 60 * 1000;
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pairs the weather service's sunrise and sunset times (seconds since 1970) by day.
 * Days without a real sunrise and sunset, as in polar day or night, are left out.
 */
export function sunTimes(rises: unknown[] = [], sets: unknown[] = []): SunTimes[] {
  const days: SunTimes[] = [];
  rises.forEach((rise, i) => {
    const set = sets[i];
    if (typeof rise !== 'number' || typeof set !== 'number') return;
    const length = (set - rise) * 1000;
    if (!(length > 0 && length < DAY_MS)) return;
    days.push({ rise: new Date(rise * 1000).toISOString(), set: new Date(set * 1000).toISOString() });
  });
  return days;
}

function optionalNumber<K extends string>(key: K, value: unknown): { [key in K]?: number } {
  return typeof value === 'number' && Number.isFinite(value) ? ({ [key]: value } as { [key in K]: number }) : {};
}

const DEFAULT_SETTINGS: Settings = {
  publicUrl: '',
  clocks: [
    { label: 'Vietnam', timeZone: 'Asia/Ho_Chi_Minh' },
    { label: 'UTC', timeZone: 'UTC' },
  ],
  office: null,
  mapWeather: true,
};

export class ApiError extends Error {
  status: number;
  retryAfter: number | undefined;

  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function backupError(why: string): ApiError {
  return new ApiError(400, `That backup can't be imported: ${why}`);
}

// Compares secrets in constant time, so the time taken gives nothing away.
export function safeEqual(a: unknown, b: unknown): boolean {
  const ab = crypto.createHash('sha256').update(String(a)).digest();
  const bb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ab, bb);
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): ApiResponse {
  return {
    status,
    body,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  };
}

// Turns an error into a JSON reply. Only an ApiError's message is shown to people.
export function errorResponse(err: unknown): ApiResponse {
  if (err instanceof ApiError) {
    return jsonResponse(err.status, { error: err.message }, err.retryAfter ? { 'Retry-After': String(err.retryAfter) } : {});
  }
  console.error(err);
  return jsonResponse(500, { error: 'Something went wrong on the server.' });
}

// ---- Date helpers -------------------------------------------------------

function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// The date and time on the wall clock in a time zone (or the computer's own).
function wallClock(d: Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

// The most recent date on which the reset time has already passed.
export function latestResetDate(now: Date, resetAt: string, timeZone?: string): string {
  const [h = 0, m = 0] = resetAt.split(':').map(Number);
  const { year, month, day, hour, minute } = wallClock(now, timeZone);
  const passed = hour > h || (hour === h && minute >= m);
  // Date.UTC handles month and year boundaries; the result is only used for its date.
  return new Date(Date.UTC(year, month - 1, passed ? day : day - 1)).toISOString().slice(0, 10);
}

// ---- Settings validation ------------------------------------------------

function cleanStatus(value: unknown): string {
  const status = String(value ?? '').trim();
  if ([...status].length > MAX_STATUS) throw new ApiError(400, `Statuses can be at most ${MAX_STATUS} characters.`);
  return status;
}

function cleanSwitch(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new ApiError(400, `${name} must be on or off.`);
  return value;
}

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

// ---- Backups ------------------------------------------------------------

const DEFAULT_PLACES: Place[] = [
  { id: 'main', name: 'Main Office', kind: 'office' },
  { id: 'other', name: 'Other Office', kind: 'office' },
];

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// A broken schedule isn't worth losing a whole backup over, so it's simply dropped.
function savedSchedule(value: unknown, placeIds: Set<string>): ScheduledChange | null {
  if (!isObject(value)) return null;
  const { at, place, status } = value;
  if (typeof at !== 'string' || typeof place !== 'string' || typeof status !== 'string') return null;
  const time = new Date(at).getTime();
  if (Number.isNaN(time) || !placeIds.has(place) || [...status].length > MAX_STATUS) return null;
  return { at: new Date(time).toISOString(), place, status };
}

// Checks a data.json backup before it replaces everything, and returns a clean copy.
// Leaves out the secret when the backup has none, so the current one is kept.
function checkBackup(value: unknown): Partial<Data> & { users: StoredUser[] } {
  const invalid = backupError;
  if (!isObject(value) || !Array.isArray(value.users)) throw invalid('it has no list of users.');

  const places = value.places ?? DEFAULT_PLACES;
  const validPlace = (p: unknown) => isObject(p) && typeof p.id === 'string' && p.id !== '' && typeof p.name === 'string' && p.kind === 'office';
  if (!Array.isArray(places) || places.length === 0 || !places.every(validPlace)) throw invalid('its list of offices is not valid.');
  const placeIds = new Set([...places.map((p: Place) => p.id), ...FIXED_PLACES]);

  const seen = new Set<string>();
  const users = value.users.map((u: unknown, i: number): StoredUser => {
    if (!isObject(u) || typeof u.username !== 'string' || !USERNAME_RE.test(u.username)) {
      throw invalid(`user ${i + 1} has no valid username.`);
    }
    const name = u.username;
    if (seen.has(name.toLowerCase())) throw invalid(`the username ${name} appears twice.`);
    seen.add(name.toLowerCase());
    const pinVersion = u.pinVersion ?? 1;
    if (!Number.isInteger(pinVersion) || (pinVersion as number) < 1) throw invalid(`${name} has a broken PIN version.`);
    if (u.pinHash != null && (typeof u.pinHash !== 'string' || !u.pinHash.includes(':'))) throw invalid(`${name} has a broken PIN.`);
    let look: CharacterDesign | null = null;
    try {
      look = u.look == null ? null : cleanLook(u.look);
    } catch {
      throw invalid(`${name}'s character is not valid.`);
    }
    return {
      username: name,
      nickname: typeof u.nickname === 'string' && u.nickname.trim() ? u.nickname.trim() : name,
      // Places that no longer exist count as not checked in.
      place: typeof u.place === 'string' && placeIds.has(u.place) ? u.place : null,
      status: typeof u.status === 'string' ? u.status : '',
      updatedAt: typeof u.updatedAt === 'string' ? u.updatedAt : null,
      pinHash: typeof u.pinHash === 'string' ? u.pinHash : null,
      pinVersion: pinVersion as number,
      look,
      scheduled: savedSchedule(u.scheduled, placeIds),
    };
  });

  const saved = isObject(value.settings) ? value.settings : {};
  const settings: Settings = { ...DEFAULT_SETTINGS };
  if ('publicUrl' in saved) settings.publicUrl = cleanPublicUrl(saved.publicUrl);
  if ('clocks' in saved) settings.clocks = cleanClocks(saved.clocks);
  if ('office' in saved) settings.office = cleanOffice(saved.office);
  if ('mapWeather' in saved) settings.mapWeather = saved.mapWeather !== false;

  const lastResetDate = value.lastResetDate;
  if (lastResetDate !== undefined && (typeof lastResetDate !== 'string' || !/^(\d{4}-\d{2}-\d{2})?$/.test(lastResetDate))) {
    throw invalid('its last reset date is not valid.');
  }
  const backup: Partial<Data> & { users: StoredUser[] } = { places: places as Place[], users, settings, lastResetDate: lastResetDate ?? '' };
  if (typeof value.secret === 'string' && value.secret) backup.secret = value.secret;
  return backup;
}

// ---- Core ---------------------------------------------------------------

export function createCore({
  saved,
  save: store,
  onChange,
  adminPassword,
  resetAt = '05:00',
  timeZone,
  now = () => new Date(),
  fetchImpl = fetch,
}: CoreOptions) {
  if (!adminPassword) throw new Error('ADMIN_PASSWORD is required');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(resetAt)) throw new Error('RESET_AT must look like 05:00');
  if (timeZone !== undefined && !isTimeZone(timeZone)) throw new Error(`Unknown time zone: ${timeZone}`);

  const data: Data = {
    secret: saved?.secret || crypto.randomBytes(32).toString('hex'),
    places: saved?.places || DEFAULT_PLACES,
    users: saved?.users || [],
    settings: { ...DEFAULT_SETTINGS, ...saved?.settings },
    // A new install has nothing to reset, so start the clock from today.
    lastResetDate: saved?.lastResetDate || (saved ? '' : latestResetDate(now(), resetAt, timeZone)),
  };
  const failures = new Map<string, { count: number; lockedUntil: number }>();
  let weather: Weather | null = null; // Kept in memory only; refetched when the server starts.
  let weatherRun = 0;

  function save(): void {
    store(data);
  }

  function publicUser(u: StoredUser): TeamUser {
    return {
      username: u.username,
      nickname: u.nickname,
      place: u.place,
      status: u.status,
      updatedAt: u.updatedAt,
      claimed: Boolean(u.pinHash),
      // Characters saved before accessories existed have no "wearing" list.
      look: u.look ? { color: u.look.color, wearing: u.look.wearing ?? [], strokes: u.look.strokes } : null,
      scheduled: u.scheduled ?? null,
    };
  }

  function publicState(): TeamState {
    const { publicUrl, clocks, office, mapWeather } = data.settings;
    return {
      places: data.places,
      settings: { publicUrl, clocks, officeName: office?.name || '', mapWeather },
      weather,
      users: data.users.map(publicUser),
    };
  }

  function broadcast(): void {
    onChange(publicState());
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
      current: 'temperature_2m,weather_code,is_day,cloud_cover,precipitation,wind_speed_10m',
      // Sunrise and sunset around today, so the map can show daylight between refreshes.
      daily: 'sunrise,sunset',
      past_days: '1',
      forecast_days: '2',
      timeformat: 'unixtime',
      timezone: 'auto',
    });
    try {
      const { current, daily } = await fetchJson<{
        current?: {
          temperature_2m: number;
          weather_code: number;
          is_day: number;
          cloud_cover?: unknown;
          precipitation?: unknown;
          wind_speed_10m?: unknown;
        };
        daily?: { sunrise?: unknown[]; sunset?: unknown[] };
      }>(`${FORECAST_URL}?${params}`);
      if (run !== weatherRun) return; // The location changed while this was running.
      if (typeof current?.temperature_2m !== 'number') throw new Error('unexpected reply');
      weather = {
        temperature: current.temperature_2m,
        code: current.weather_code,
        isDay: current.is_day === 1,
        updatedAt: now().toISOString(),
        sun: sunTimes(daily?.sunrise, daily?.sunset),
        // Extra detail for the map's weather; left out if the service doesn't send it.
        ...optionalNumber('cloudCover', current.cloud_cover),
        ...optionalNumber('precipitation', current.precipitation),
        ...optionalNumber('windSpeed', current.wind_speed_10m),
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
    const due = latestResetDate(now(), resetAt, timeZone);
    if (data.lastResetDate >= due) return false;
    for (const u of data.users) {
      u.place = null;
      u.status = '';
      u.scheduled = null;
    }
    data.lastResetDate = due;
    commit();
    return true;
  }

  // ---- Scheduled changes ------------------------------------------------

  // Run the reset first, so that nobody starts a new day in a place from yesterday's schedule.
  function runScheduledIfDue(): boolean {
    const current = now();
    let changed = false;
    for (const u of data.users) {
      if (!u.scheduled || new Date(u.scheduled.at) > current) continue;
      u.place = u.scheduled.place;
      u.status = u.scheduled.status;
      u.updatedAt = current.toISOString();
      u.scheduled = null;
      changed = true;
    }
    if (changed) commit();
    return changed;
  }

  function nextScheduledAt(): string | null {
    const times = data.users.flatMap((u) => (u.scheduled ? [new Date(u.scheduled.at).getTime()] : []));
    return times.length ? new Date(Math.min(...times)).toISOString() : null;
  }

  function cleanSchedule(value: unknown): ScheduledChange | null {
    if (value === null) return null;
    const { at, status } = isObject(value) ? value : ({} as JsonBody);
    const time = new Date(typeof at === 'string' ? at : NaN);
    const current = now();
    if (Number.isNaN(time.getTime())) throw new ApiError(400, 'That time is not valid. Pick another time.');
    if (time <= current) throw new ApiError(400, 'That time has already passed. Pick a later time.');
    if (latestResetDate(time, resetAt, timeZone) !== latestResetDate(current, resetAt, timeZone)) {
      throw new ApiError(400, 'That time is after the next morning reset. Pick an earlier time.');
    }
    return { at: time.toISOString(), place: SCHEDULED_PLACE, status: cleanStatus(status) };
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

  function signature(user: StoredUser): string {
    return crypto
      .createHmac('sha256', data.secret)
      .update(`${user.username}:${user.pinVersion}`)
      .digest('hex');
  }

  function tokenFor(user: StoredUser): string {
    return `${encodeURIComponent(user.username)}.${user.pinVersion}.${signature(user)}`;
  }

  function userFromToken(req: ApiRequest): StoredUser {
    const token = (req.header('authorization') || '').replace(/^Bearer /, '');
    // Read from the end, because usernames can contain dots.
    const parts = token.split('.');
    const sig = parts.pop();
    parts.pop(); // The PIN version, which the signature already covers.
    const name = parts.join('.');
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

  function requireAdmin(req: ApiRequest): void {
    checkLock('admin');
    if (!safeEqual(req.header('x-admin-password') || '', adminPassword)) {
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

  // ---- Features with their own data -------------------------------------

  const features: TeamFeature[] = [];

  const team: Team = {
    player: (req) => {
      const { username, pinVersion } = userFromToken(req);
      return { username, pinVersion };
    },
    members: () => data.users.map((u) => u.username),
    sign: (purpose, text) => crypto.createHmac('sha256', data.secret).update(`${purpose}:${text}`).digest('hex'),
    requireAdmin,
  };

  // Adds a feature's data to backups and restores, and tells it when people are deleted.
  function attach(feature: TeamFeature): void {
    features.push(feature);
  }

  // ---- Routes -----------------------------------------------------------

  async function route(req: ApiRequest): Promise<ApiResponse> {
    const { url } = req;
    const route = `${req.method} ${url.pathname}`;

    if (route === 'GET /api/state') return jsonResponse(200, publicState());

    if (route === 'GET /api/admin/check') {
      requireAdmin(req);
      return jsonResponse(200, { ok: true });
    }

    if (route === 'PATCH /api/admin/settings') {
      requireAdmin(req);
      const body = await req.readJson();
      const next: Partial<Settings> = {};
      if ('publicUrl' in body) next.publicUrl = cleanPublicUrl(body.publicUrl);
      if ('clocks' in body) next.clocks = cleanClocks(body.clocks);
      if ('office' in body) next.office = cleanOffice(body.office);
      if ('mapWeather' in body) next.mapWeather = cleanSwitch(body.mapWeather, 'Daylight and weather on the map');
      Object.assign(data.settings, next);
      if ('office' in next) weather = null;
      commit();
      if ('office' in next) void refreshWeather();
      return jsonResponse(200, { ok: true });
    }

    // The whole data file, PINs and secret included, for backups and moving servers.
    // Each attached feature adds its own data under its key.
    if (route === 'GET /api/admin/data') {
      requireAdmin(req);
      const parts = Object.fromEntries(features.map((f) => [f.key, f.backup()]));
      return jsonResponse(200, { ...data, ...parts }, { 'Content-Disposition': 'attachment; filename="data.json"' });
    }

    if (route === 'PUT /api/admin/data') {
      requireAdmin(req);
      const body = await req.readJson(MAX_BACKUP);
      const backup = checkBackup(body);
      // Every part is checked before anything changes, so a bad backup changes nothing.
      const usernames = new Set(backup.users.map((u) => u.username));
      const restores = features.map((f) => f.checkBackup(body[f.key], usernames));
      Object.assign(data, backup);
      failures.clear();
      weather = null;
      // Logins from the backup keep working when it brings its secret; a backup from
      // an earlier day gets the morning reset it missed.
      const wasReset = runResetIfDue();
      if (!runScheduledIfDue() && !wasReset) commit();
      for (const restore of restores) await restore();
      void refreshWeather();
      return jsonResponse(200, { ok: true, users: data.users.length });
    }

    if (route === 'GET /api/admin/places') {
      requireAdmin(req);
      const query = (url.searchParams.get('q') || '').trim();
      if (query.length < 2 || query.length > 100) throw new ApiError(400, 'Type at least 2 letters of a city name.');
      return jsonResponse(200, { results: await searchPlaces(query) });
    }

    if (route === 'POST /api/admin/users') {
      requireAdmin(req);
      const { username } = await req.readJson();
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
      return jsonResponse(201, { ok: true });
    }

    const adminMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)(\/release)?$/);
    if (adminMatch) {
      const username = decodeURIComponent(adminMatch[1] ?? '');
      if (req.method === 'DELETE' && !adminMatch[2]) {
        requireAdmin(req);
        const user = mustFindUser(username);
        data.users.splice(data.users.indexOf(user), 1);
        commit();
        for (const feature of features) await feature.forget([user.username]);
        return jsonResponse(200, { ok: true });
      }
      if (req.method === 'POST' && adminMatch[2]) {
        requireAdmin(req);
        const user = mustFindUser(username);
        user.pinHash = null;
        user.pinVersion += 1; // Invalidates tokens already handed out.
        failures.delete(`user:${user.username}`);
        commit();
        return jsonResponse(200, { ok: true });
      }
    }

    if (route === 'POST /api/claim') {
      const { username, pin } = await req.readJson();
      const user = mustFindUser(username);
      if (user.pinHash) throw new ApiError(409, 'That username is already claimed.');
      if (!PIN_RE.test(String(pin ?? ''))) throw new ApiError(400, 'The PIN must be exactly 4 digits.');
      user.pinHash = hashPin(String(pin));
      commit();
      return jsonResponse(200, { token: tokenFor(user), username: user.username } satisfies AuthResult);
    }

    if (route === 'POST /api/login') {
      const { username, pin } = await req.readJson();
      const user = mustFindUser(username);
      const key = `user:${user.username}`;
      checkLock(key);
      if (!user.pinHash) throw new ApiError(409, 'That username has not been claimed yet.');
      if (!pinMatches(String(pin ?? ''), user.pinHash)) {
        recordFailure(key);
        throw new ApiError(401, 'Wrong PIN.');
      }
      failures.delete(key);
      return jsonResponse(200, { token: tokenFor(user), username: user.username } satisfies AuthResult);
    }

    if (route === 'GET /api/me') {
      const user = userFromToken(req);
      return jsonResponse(200, { username: user.username });
    }

    if (route === 'PATCH /api/me') {
      const user = userFromToken(req);
      const body = await req.readJson();
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
      if ('status' in body) next.status = cleanStatus(body.status);
      // "Updated at" tells teammates when someone's whereabouts changed, not their name or outfit.
      const isWhereabouts = 'place' in next || 'status' in next;
      if ('look' in body) next.look = cleanLook(body.look);
      // A schedule only changes someone's whereabouts when it fires.
      if ('scheduled' in body) next.scheduled = cleanSchedule(body.scheduled);
      // Going there by hand means the scheduled change has already happened.
      const pending = next.scheduled === undefined ? user.scheduled : next.scheduled;
      if (next.place && next.place === pending?.place) next.scheduled = null;
      Object.assign(user, next, isWhereabouts ? { updatedAt: now().toISOString() } : {});
      commit();
      return jsonResponse(200, { ok: true, user: publicUser(user) } satisfies MeUpdateResult);
    }

    throw new ApiError(404, 'Not found.');
  }

  // Answers an API request. Errors become JSON replies, so this never throws.
  async function handle(req: ApiRequest): Promise<ApiResponse> {
    try {
      return await route(req);
    } catch (err) {
      return errorResponse(err);
    }
  }

  return {
    handle,
    publicState,
    save,
    team,
    attach,
    runResetIfDue,
    runScheduledIfDue,
    nextScheduledAt,
    refreshWeather,
    hasOffice: () => Boolean(data.settings.office),
  };
}

export type Core = ReturnType<typeof createCore>;
