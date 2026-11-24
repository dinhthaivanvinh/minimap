// Reward points' API: everyone sees the board, logged-in people see their own stay in the office
// and can ask for the office network to be checked again, and the admin sets the rules, the
// office addresses and makes changes by hand. It keeps its own data (data/points.json on
// Node.js, the `points` key on Cloudflare).
//
// The core never tells a feature who moved, so the hosts call observe() whenever the team's
// state changes and tick() with their other timed changes. Each compares where people are with
// the stays it keeps. A stay in an earning office starts when someone arrives and is counted
// when they leave, or when the day closes. Time still running is added when the board is shown,
// so nothing has to be saved every minute, and a sleeping Durable Object catches up when it wakes.

import {
  addPoints,
  cleanSettings,
  closeDay,
  DEFAULT_SETTINGS,
  earningOffices,
  HISTORY_DAYS,
  ipAllowed,
  MAX_ADJUST,
  MAX_ADJUSTMENTS,
  MAX_REASON,
  officeMinutes,
  plainIp,
  pointsFor,
  wallClock,
  type Adjustment,
  type DayLine,
  type DayRecord,
  type PointsMe,
  type PointsSettings,
  type PointsView,
} from '../../shared/points.ts';
import {
  ApiError,
  backupError,
  errorResponse,
  jsonResponse,
  type ApiRequest,
  type ApiResponse,
  type Team,
  type TeamFeature,
} from '../core.ts';

interface Stay {
  /** From when it is still to be counted, as an ISO instant. */
  since: string;
  /** Seen on the office network, or there is no check. Only these stays earn. */
  verified: boolean;
}

/** How it is stored: lists of pairs, as a username such as `__proto__` breaks a plain object. */
export interface PointsData {
  settings: PointsSettings;
  balances: [string, number][];
  /** The open day, YYYY-MM-DD on the team's calendar. Empty before the first day. */
  day: string;
  /** Who was on the team when the day opened. Only they can lose points for it. */
  roster: string[];
  checkedIn: string[];
  /** Minutes of finished stays in the open day. */
  minutes: [string, number][];
  stays: [string, Stay][];
  /** Closed days, newest first. */
  history: DayRecord[];
  /** Hand changes, newest first. */
  adjustments: Adjustment[];
}

interface State {
  settings: PointsSettings;
  balances: Map<string, number>;
  day: string;
  roster: string[];
  checkedIn: Set<string>;
  minutes: Map<string, number>;
  stays: Map<string, Stay>;
  history: DayRecord[];
  adjustments: Adjustment[];
}

export interface PointsOptions {
  saved: Partial<PointsData> | null;
  save: (data: PointsData) => void | Promise<void>;
  team: Team;
  /** Tells open maps about a new board. */
  onChange?: (view: PointsView) => void;
  now?: () => Date;
  /** Which day and hour it is depends on where the team is. Left out, the computer's own time zone is used. */
  timeZone?: string;
}

/** History and hand changes sent to every map; the page asks for the rest. */
const VIEW_DAYS = 7;
const VIEW_ADJUSTMENTS = 20;

function fresh(): State {
  return {
    settings: { ...DEFAULT_SETTINGS },
    balances: new Map(),
    day: '',
    roster: [],
    checkedIn: new Set(),
    minutes: new Map(),
    stays: new Map(),
    history: [],
    adjustments: [],
  };
}

function clone(s: State): State {
  return {
    ...s,
    balances: new Map(s.balances),
    roster: [...s.roster],
    checkedIn: new Set(s.checkedIn),
    minutes: new Map(s.minutes),
    stays: new Map([...s.stays].map(([name, stay]) => [name, { ...stay }])),
    history: [...s.history],
    adjustments: [...s.adjustments],
  };
}

function toStored(s: State): PointsData {
  return {
    settings: s.settings,
    balances: [...s.balances],
    day: s.day,
    roster: s.roster,
    checkedIn: [...s.checkedIn],
    minutes: [...s.minutes],
    stays: [...s.stays],
    history: s.history,
    adjustments: s.adjustments,
  };
}

// ---- Reading what was stored or restored -----------------------------------------

const isDay = (v: unknown): v is string => typeof v === 'string' && (v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v));
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isInstant = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

function pairs<T>(value: unknown, ok: (v: unknown) => v is T, known: (name: string) => boolean): Map<string, T> | null {
  if (!Array.isArray(value)) return null;
  const out = new Map<string, T>();
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || !known(pair[0]) || !ok(pair[1])) return null;
    out.set(pair[0], pair[1]);
  }
  return out;
}

const isStay = (v: unknown): v is Stay =>
  typeof v === 'object' && v !== null && isInstant((v as Stay).since) && typeof (v as Stay).verified === 'boolean';

function isLine(v: unknown, known: (name: string) => boolean): v is DayLine {
  const l = v as DayLine;
  return typeof v === 'object' && v !== null && typeof l.username === 'string' && known(l.username) && isCount(l.earned) && isCount(l.penalty);
}

/** Points data from a file or a backup, or a message saying what is wrong with it. */
function parse(value: unknown, places: readonly string[], known: (name: string) => boolean): State | string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'is not valid.';
  const v = value as Record<string, unknown>;
  // Offices removed from the map since are dropped from the settings, not treated as damage.
  const rawSettings = typeof v.settings === 'object' && v.settings !== null ? (v.settings as Record<string, unknown>) : null;
  const settings = rawSettings
    ? cleanSettings({ ...rawSettings, offices: Array.isArray(rawSettings.offices) ? rawSettings.offices.filter((id) => places.includes(id as string)) : rawSettings.offices }, places)
    : 'Settings are missing.';
  if (typeof settings === 'string') return `has broken settings: ${settings}`;
  const balances = pairs(v.balances, isCount, known);
  const minutes = pairs(v.minutes, isCount, known);
  const stays = pairs(v.stays, isStay, known);
  if (!balances || !minutes || !stays) return 'has balances or stays for someone who is not on the team.';
  if (!isDay(v.day)) return 'has a broken day.';
  const names = (list: unknown) => Array.isArray(list) && list.every((n) => typeof n === 'string' && known(n));
  if (!names(v.roster) || !names(v.checkedIn)) return 'has a day for someone who is not on the team.';
  const history = v.history;
  if (!Array.isArray(history) || !history.every((d) => isDay(d?.day) && Array.isArray(d.lines) && d.lines.every((l: unknown) => isLine(l, known)))) {
    return 'has a broken history.';
  }
  const adjustments = v.adjustments;
  const isAdjustment = (a: Adjustment) =>
    isInstant(a?.at) && typeof a.username === 'string' && known(a.username) && Number.isInteger(a.amount) && typeof a.reason === 'string' && a.reason.length <= MAX_REASON;
  if (!Array.isArray(adjustments) || !adjustments.every(isAdjustment)) return 'has broken changes made by hand.';
  return {
    settings,
    balances,
    day: v.day,
    roster: [...new Set(v.roster as string[])],
    checkedIn: new Set(v.checkedIn as string[]),
    minutes,
    stays,
    history: (history as DayRecord[]).slice(0, HISTORY_DAYS),
    adjustments: (adjustments as Adjustment[]).slice(0, MAX_ADJUSTMENTS),
  };
}

// ---- Counting ---------------------------------------------------------------------

/**
 * Counts every stay up to `at`. Minutes for the open day go on it; minutes for other days are
 * handed back, so closing the day can put them where they belong.
 */
function settle(s: State, at: Date, timeZone: string | undefined, only?: string): Map<string, Map<string, number>> {
  const other = new Map<string, Map<string, number>>();
  for (const [username, stay] of s.stays) {
    if (only !== undefined && username !== only) continue;
    const from = new Date(stay.since);
    if (stay.verified && from < at) {
      for (const [day, minutes] of officeMinutes(from, at, s.settings, timeZone)) {
        if (day === s.day) s.minutes.set(username, (s.minutes.get(username) ?? 0) + minutes);
        else {
          const byName = other.get(day) ?? new Map<string, number>();
          byName.set(username, (byName.get(username) ?? 0) + minutes);
          other.set(day, byName);
        }
      }
    }
    if (from < at) stay.since = at.toISOString();
  }
  return other;
}

function record(s: State, day: string, lines: DayLine[]): void {
  for (const line of lines) s.balances.set(line.username, addPoints(s.balances.get(line.username) ?? 0, line.earned - line.penalty));
  if (lines.length) s.history = [{ day, lines }, ...s.history.filter((d) => d.day !== day)].slice(0, HISTORY_DAYS);
}

/**
 * Brings the state up to `at`: closes the open day once a new one starts (with any days nobody
 * looked at in between, which only earn), starts and ends stays from where people are, and
 * notes who checked in today. Pure: it changes and returns a copy.
 */
function step(
  prev: State,
  at: Date,
  team: { members: string[]; places: string[]; whereabouts: ReturnType<Team['whereabouts']> },
  ipOf: (username: string) => string | undefined,
  timeZone?: string,
): State {
  const s = clone(prev);
  const today = wallClock(at, timeZone).day;
  if (s.day !== today) {
    const other = settle(s, at, timeZone);
    if (s.day) record(s, s.day, closeDay(s.day, s.roster, s.checkedIn, s.minutes, s.settings));
    for (const day of [...other.keys()].sort()) {
      if (day === today || (s.day && day <= s.day)) continue;
      record(s, day, closeDay(day, [], new Set(), other.get(day)!, s.settings));
    }
    // The first day after setup has no roster, so nobody loses points for it.
    s.roster = s.day ? [...team.members] : [];
    s.day = today;
    s.checkedIn = new Set();
    s.minutes = other.get(today) ?? new Map();
  }

  const members = new Set(team.members);
  const earning = earningOffices(s.settings, team.places);
  for (const username of [...s.stays.keys()]) {
    if (!members.has(username)) s.stays.delete(username);
  }
  for (const { username, place, updatedAt } of team.whereabouts) {
    const inOffice = place !== null && earning.includes(place);
    const stay = s.stays.get(username);
    if (inOffice && !stay) s.stays.set(username, { since: at.toISOString(), verified: ipAllowed(ipOf(username), s.settings.ips) });
    if (!inOffice && stay) {
      settle(s, at, timeZone, username);
      s.stays.delete(username);
    }
    // Any place set today counts as a check-in: Work from home, Out of Office and Off too.
    if (place !== null && updatedAt && wallClock(new Date(updatedAt), timeZone).day === s.day) s.checkedIn.add(username);
  }
  return s;
}

/** Minutes counted today so far for each person, with stays still running. */
function minutesNow(s: State, at: Date, timeZone?: string): Map<string, number> {
  const copy = clone(s);
  settle(copy, at, timeZone);
  return copy.minutes;
}

// ---- The feature ------------------------------------------------------------------

export function createPoints({ saved, save: store, team, onChange = () => {}, now = () => new Date(), timeZone }: PointsOptions) {
  const known = (name: string) => team.members().includes(name);
  let state: State = (() => {
    if (!saved) return fresh();
    // People are checked against the team on restores; a file on disk may be older than a deletion.
    const parsed = parse(saved, team.places(), () => true);
    if (typeof parsed === 'string') {
      console.error(`The points file ${parsed} Starting again.`);
      return fresh();
    }
    return parsed;
  })();
  let writing: Promise<unknown> = Promise.resolve();
  let lastBoard = '';
  // The last address each person used, kept in memory only: it is only needed when they arrive.
  const lastIp = new Map<string, string>();

  function teamNow() {
    return { members: team.members(), places: team.places(), whereabouts: team.whereabouts() };
  }

  function save(): void | Promise<void> {
    return store(toStored(state));
  }

  function view(): PointsView {
    const at = now();
    const current = step(state, at, teamNow(), (name) => lastIp.get(name), timeZone);
    const minutes = minutesNow(current, at, timeZone);
    const { ips, ...settings } = current.settings;
    const board = team
      .members()
      .map((username) => ({ username, balance: current.balances.get(username) ?? 0, today: pointsFor(minutes.get(username) ?? 0, settings) }))
      .sort((a, b) => b.balance + b.today - (a.balance + a.today) || a.username.localeCompare(b.username));
    return {
      settings: { ...settings, offices: earningOffices(settings, team.places()), ipCheck: ips.length > 0 },
      day: current.day,
      board,
      history: current.history.slice(0, VIEW_DAYS),
      adjustments: current.adjustments.slice(0, VIEW_ADJUSTMENTS),
    };
  }

  function me(username: string): PointsMe {
    const at = now();
    const current = step(state, at, teamNow(), (name) => lastIp.get(name), timeZone);
    const stay = current.stays.get(username);
    return {
      inOffice: Boolean(stay),
      verified: Boolean(stay?.verified),
      minutesToday: minutesNow(current, at, timeZone).get(username) ?? 0,
      checkedIn: current.checkedIn.has(username),
    };
  }

  function announce(): void {
    const next = view();
    const board = JSON.stringify(next);
    if (board === lastBoard) return;
    lastBoard = board;
    onChange(next);
  }

  // Changes go one at a time, and a reply only says a change is stored once it is. A change
  // that fails, or fails to save, is undone. Each change starts by catching up with the team as
  // it was when the change was asked for, so a change waiting behind a slow save still counts a
  // stay up to the moment someone left, not the moment its turn came.
  function change<T>(task: (s: State) => T): Promise<T> {
    const at = now();
    const seen = teamNow();
    const run = writing.then(async () => {
      const before = state;
      try {
        state = step(state, at, seen, (name) => lastIp.get(name), timeZone);
        const result = task(state);
        await store(toStored(state));
        announce();
        return result;
      } catch (err) {
        state = before;
        throw err;
      }
    });
    writing = run.catch(() => {});
    return run;
  }

  /** Catches up with where people are. Saves only when something changed. Never throws. */
  function observe(): Promise<void> {
    const next = step(state, now(), teamNow(), (name) => lastIp.get(name), timeZone);
    if (JSON.stringify(toStored(next)) === JSON.stringify(toStored(state))) {
      // Time running in the office still moves the board.
      announce();
      return Promise.resolve();
    }
    return change(() => {}).catch((err) => console.error(err));
  }

  /** Remembers the address of a logged-in caller. The hosts call it before answering each request. */
  function notice(req: ApiRequest): void {
    if (!req.ip || !req.header('authorization')) return;
    try {
      lastIp.set(team.player(req).username, req.ip);
    } catch {
      // Not logged in: nothing to remember.
    }
  }

  /** Counts a stay from now if this request came from the office network. */
  async function verify(username: string, ip: string | undefined): Promise<boolean> {
    const stay = state.stays.get(username);
    if (!stay || stay.verified || !ipAllowed(ip, state.settings.ips)) return false;
    await change((s) => {
      const current = s.stays.get(username);
      if (current && !current.verified) s.stays.set(username, { since: now().toISOString(), verified: true });
    });
    return true;
  }

  async function route(req: ApiRequest): Promise<ApiResponse> {
    const action = `${req.method} ${req.url.pathname}`;

    if (action === 'GET /api/points') return jsonResponse(200, view());

    if (action === 'GET /api/points/me') {
      const { username } = team.player(req);
      // Opening the page on the office network is enough to start earning.
      await verify(username, req.ip);
      return jsonResponse(200, me(username));
    }

    if (action === 'POST /api/points/here') {
      const { username } = team.player(req);
      await observe();
      const current = me(username);
      if (!current.inOffice) throw new ApiError(409, 'Check in to an office that earns points first.');
      if (!current.verified && !(await verify(username, req.ip))) {
        throw new ApiError(403, 'This device isn’t on the office network. Turn off any VPN, join the office Wi-Fi, and try again.');
      }
      return jsonResponse(200, me(username));
    }

    if (action === 'GET /api/points/admin') {
      team.requireAdmin(req);
      return jsonResponse(200, { settings: state.settings, ip: req.ip ? plainIp(req.ip) : null });
    }

    if (action === 'PATCH /api/points/admin') {
      team.requireAdmin(req);
      const settings = cleanSettings(await req.readJson(), team.places());
      if (typeof settings === 'string') throw new ApiError(400, settings);
      await change((s) => {
        // Time so far counts under the old rules.
        settle(s, now(), timeZone);
        s.settings = settings;
      });
      // Stays that no longer earn end, and new earning offices start stays.
      await observe();
      return jsonResponse(200, { settings: state.settings, ip: req.ip ? plainIp(req.ip) : null });
    }

    if (action === 'POST /api/points/admin/adjust') {
      team.requireAdmin(req);
      const { username, amount, reason } = await req.readJson();
      if (typeof username !== 'string' || !known(username)) throw new ApiError(400, 'Pick someone on the team.');
      if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount as number) > MAX_ADJUST) {
        throw new ApiError(400, `Enter a whole number of points from -${MAX_ADJUST} to ${MAX_ADJUST}, not 0.`);
      }
      const text = typeof reason === 'string' ? reason.trim().replace(/\s+/g, ' ') : '';
      if (!text || text.length > MAX_REASON) throw new ApiError(400, `Give a reason of 1 to ${MAX_REASON} characters.`);
      await change((s) => {
        s.balances.set(username, addPoints(s.balances.get(username) ?? 0, amount as number));
        s.adjustments = [{ at: now().toISOString(), username, amount: amount as number, reason: text }, ...s.adjustments].slice(0, MAX_ADJUSTMENTS);
      });
      return jsonResponse(200, view());
    }

    throw new ApiError(404, 'Not found.');
  }

  /** Answers the points requests, or returns null for anything else. Never throws. */
  async function handle(req: ApiRequest): Promise<ApiResponse | null> {
    const { pathname } = req.url;
    if (pathname !== '/api/points' && !pathname.startsWith('/api/points/')) return null;
    try {
      return await route(req);
    } catch (err) {
      return errorResponse(err);
    }
  }

  const feature: TeamFeature = {
    key: 'points',
    backup: () => toStored(state),
    checkBackup(value, usernames) {
      // Backups from before points start everyone at zero.
      const next = value === undefined ? fresh() : parse(value, team.places(), (name) => usernames.has(name));
      if (typeof next === 'string') throw backupError(`its reward points ${next}`);
      return () =>
        change((s) => {
          Object.assign(s, next);
        }).then(() => {});
    },
    forget: (usernames) =>
      change((s) => {
        const gone = new Set(usernames);
        for (const name of gone) {
          s.balances.delete(name);
          s.minutes.delete(name);
          s.stays.delete(name);
          s.checkedIn.delete(name);
        }
        s.roster = s.roster.filter((name) => !gone.has(name));
        s.history = s.history
          .map((d) => ({ day: d.day, lines: d.lines.filter((l) => !gone.has(l.username)) }))
          .filter((d) => d.lines.length);
        s.adjustments = s.adjustments.filter((a) => !gone.has(a.username));
      }),
  };

  return { handle, save, view, observe, tick: observe, notice, feature };
}

export type Points = ReturnType<typeof createPoints>;
