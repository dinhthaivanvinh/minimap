// Reward points: the rules the server and the browser share. People earn points for the time
// they spend in an earning office (by default the first office on the map) during office hours
// on workdays, up to a daily cap, like pay by the hour. Earned points only reach the balance when
// the person presses Claim, which works during the claim windows (12:00 to 14:00 and 17:00 to
// 23:59 by default), as often as they like. Points keep coming after a claim while they stay in
// the office. Points still unclaimed at the morning reset (the server's RESET_AT) are lost, which
// is what brings people back to the app.
// On a workday, someone who never checks in loses points. A balance never goes below zero. A day
// when nobody checks in at all costs nobody anything, so holidays and closures need no setup.

export interface PointsSettings {
  /** Points for each hour in an earning office. */
  perHour: number;
  /** Hours a day that can earn, at most. */
  dailyCapHours: number;
  /** Points lost on a workday without a check-in. */
  missPenalty: number;
  /** Office hours, HH:MM on the team's clock. Only time between them earns. */
  start: string;
  end: string;
  /** Days that earn and can cost points: 0 is Sunday, 6 is Saturday. */
  workdays: number[];
  /** Ids of the offices that earn. Empty means the first office on the map. */
  offices: string[];
  /** When Claim works, HH:MM to HH:MM on the same day (both minutes included), earliest first. */
  claimWindows: ClaimWindow[];
}

export interface ClaimWindow {
  from: string;
  to: string;
}

/** One person's line in a closed day. */
export interface DayLine {
  username: string;
  /** Claimed, so already in the balance. */
  earned: number;
  /** Earned but never claimed, so lost. */
  lost: number;
  penalty: number;
}

export interface DayRecord {
  day: string;
  lines: DayLine[];
}

/** A change the admin made by hand, with the reason everyone sees. */
export interface Adjustment {
  at: string;
  username: string;
  amount: number;
  reason: string;
}

/** What everyone may see. */
export interface PointsView {
  settings: PointsSettings;
  day: string;
  /** Everyone's balance, highest first, with the points they have earned today and not claimed yet. */
  board: { username: string; balance: number; toClaim: number }[];
  /** The morning reset, when unclaimed points are lost. */
  resetAt: string;
  history: DayRecord[];
  adjustments: Adjustment[];
}

/** What only the person sees about their own stay in the office. */
export interface PointsMe {
  /** In an earning office now. */
  inOffice: boolean;
  /** Minutes counted today so far, before the cap. */
  minutesToday: number;
  checkedIn: boolean;
  /** Earned today and not claimed yet. */
  toClaim: number;
  /** A claim window is open now. */
  claimOpen: boolean;
  /** The open claim window, or else the next one today, or null after the last one. */
  window: ClaimWindow | null;
}

export const DEFAULT_SETTINGS: PointsSettings = {
  perHour: 10,
  dailyCapHours: 8,
  missPenalty: 20,
  start: '07:00',
  end: '19:00',
  workdays: [1, 2, 3, 4, 5],
  offices: [],
  claimWindows: [
    { from: '12:00', to: '14:00' },
    { from: '17:00', to: '23:59' },
  ],
};

export const MAX_PER_HOUR = 1000;
export const MAX_PENALTY = 10_000;
export const MAX_CLAIM_WINDOWS = 4;
export const MAX_REASON = 80;
export const MAX_ADJUST = 100_000;
/** Closed days kept, and hand changes kept. Old ones are dropped to stay small. */
export const HISTORY_DAYS = 60;
export const MAX_ADJUSTMENTS = 100;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function minuteOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

const isWhole = (value: unknown, max: number): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;

/** Settings from a request or a file, or an error message for the first thing that is wrong. */
export function cleanSettings(value: unknown, places: readonly string[]): PointsSettings | string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'Send the settings as an object.';
  const v = value as Record<string, unknown>;
  if (!isWhole(v.perHour, MAX_PER_HOUR)) return `Points an hour must be a whole number from 0 to ${MAX_PER_HOUR}.`;
  if (!isWhole(v.dailyCapHours, 24) || v.dailyCapHours === 0) return 'The daily cap must be 1 to 24 hours.';
  if (!isWhole(v.missPenalty, MAX_PENALTY)) return `The penalty must be a whole number from 0 to ${MAX_PENALTY}.`;
  if (typeof v.start !== 'string' || !TIME.test(v.start) || typeof v.end !== 'string' || !TIME.test(v.end)) {
    return 'Office hours must look like 08:00.';
  }
  if (minuteOf(v.end) <= minuteOf(v.start)) return 'Office hours must end after they start.';
  if (!Array.isArray(v.workdays) || !v.workdays.every((d) => isWhole(d, 6))) return 'Workdays must be numbers from 0 (Sunday) to 6.';
  if (!Array.isArray(v.offices) || !v.offices.every((id) => typeof id === 'string' && places.includes(id))) {
    return 'Pick offices that are on the map.';
  }
  if (!Array.isArray(v.claimWindows) || !v.claimWindows.length || v.claimWindows.length > MAX_CLAIM_WINDOWS) {
    return `Set 1 to ${MAX_CLAIM_WINDOWS} claim windows.`;
  }
  const claimWindows: ClaimWindow[] = [];
  for (const w of v.claimWindows as unknown[]) {
    const { from, to } = (typeof w === 'object' && w !== null ? w : {}) as Record<string, unknown>;
    if (typeof from !== 'string' || !TIME.test(from) || typeof to !== 'string' || !TIME.test(to)) return 'Claim windows must look like 12:00 to 14:00.';
    if (minuteOf(to) <= minuteOf(from)) return 'A claim window must end after it starts, on the same day.';
    claimWindows.push({ from, to });
  }
  claimWindows.sort((a, b) => minuteOf(a.from) - minuteOf(b.from));
  return {
    perHour: v.perHour,
    dailyCapHours: v.dailyCapHours,
    missPenalty: v.missPenalty,
    start: v.start,
    end: v.end,
    workdays: [...new Set(v.workdays as number[])].sort(),
    offices: [...new Set(v.offices as string[])],
    claimWindows,
  };
}

/** The offices that earn: the chosen ones still on the map, or the first office. */
export function earningOffices(settings: Pick<PointsSettings, 'offices'>, places: readonly string[]): string[] {
  const chosen = settings.offices.filter((id) => places.includes(id));
  if (chosen.length) return chosen;
  return places.length ? [places[0]!] : [];
}

/** Points for minutes in the office on one day, after the cap. */
export function pointsFor(minutes: number, settings: Pick<PointsSettings, 'perHour' | 'dailyCapHours'>): number {
  return Math.floor((Math.min(minutes, settings.dailyCapHours * 60) * settings.perHour) / 60);
}

/** A balance after a change, never below zero. */
export function addPoints(balance: number, change: number): number {
  return Math.max(0, balance + change);
}

// ---- Time ---------------------------------------------------------------

const formats = new Map<string, Intl.DateTimeFormat>();

/** The wall clock of a time zone (or the computer's own): the date, the minute of the day and the weekday. */
export function wallClock(at: Date, timeZone?: string): { day: string; minute: number; weekday: number } {
  const key = timeZone ?? '';
  let format = formats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    });
    formats.set(key, format);
  }
  const parts = format.formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day: `${get('year')}-${get('month')}-${get('day')}`, minute: Number(get('hour')) * 60 + Number(get('minute')), weekday };
}

const MINUTE = 60_000;

/**
 * The minutes between two instants that fall in office hours on a workday, by day. It walks
 * from one edge of office hours to the next, reading the wall clock again at each, so a day
 * with a clock change is off by at most that hour's change, and only at night.
 */
export function officeMinutes(
  from: Date,
  to: Date,
  settings: Pick<PointsSettings, 'start' | 'end' | 'workdays'>,
  timeZone?: string,
): Map<string, number> {
  const out = new Map<string, number>();
  const start = minuteOf(settings.start);
  const end = minuteOf(settings.end);
  let t = Math.floor(from.getTime() / MINUTE) * MINUTE;
  const stop = to.getTime();
  // A stay is at most a few days, but a broken clock must not loop forever.
  for (let steps = 0; t < stop && steps < 1000; steps++) {
    const { day, minute, weekday } = wallClock(new Date(t), timeZone);
    let next: number;
    if (!settings.workdays.includes(weekday) || minute >= end) next = t + (1440 - minute) * MINUTE;
    else if (minute < start) next = t + (start - minute) * MINUTE;
    else {
      next = Math.min(stop, t + (end - minute) * MINUTE);
      out.set(day, (out.get(day) ?? 0) + Math.round((next - Math.max(t, from.getTime())) / MINUTE));
    }
    t = Math.max(next, t + MINUTE);
  }
  return out;
}

function previousDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** The points day an instant belongs to: the date of the last morning reset (RESET_AT) before it. */
export function pointsDay(at: Date, resetAt: string, timeZone?: string): string {
  const { day, minute } = wallClock(at, timeZone);
  return minute < minuteOf(resetAt) ? previousDay(day) : day;
}

/**
 * The claim window for a points day at `at`: the open one, or else the next one that day, or null
 * once the last has closed (which includes the hours after midnight before the reset).
 */
export function claimWindow(
  at: Date,
  day: string,
  settings: Pick<PointsSettings, 'claimWindows'>,
  timeZone?: string,
): { open: boolean; window: ClaimWindow | null } {
  const clock = wallClock(at, timeZone);
  if (clock.day !== day) return { open: false, window: null };
  for (const w of settings.claimWindows) {
    if (clock.minute > minuteOf(w.to)) continue;
    return { open: clock.minute >= minuteOf(w.from), window: w };
  }
  return { open: false, window: null };
}

export function isWorkday(day: string, settings: Pick<PointsSettings, 'workdays'>): boolean {
  return settings.workdays.includes(new Date(`${day}T12:00:00Z`).getUTCDay());
}

/** Points earned on a day and not claimed yet. Never below zero, even after the cap is lowered. */
export function unclaimed(minutes: number, claimed: number, settings: Pick<PointsSettings, 'perHour' | 'dailyCapHours'>): number {
  return Math.max(0, pointsFor(minutes, settings) - claimed);
}

/**
 * A closed day, by person: what they claimed, what they never claimed and so lost, and the
 * penalty. Someone on the day's list who never checked in on a workday loses the penalty,
 * unless nobody checked in at all that day.
 */
export function closeDay(
  day: string,
  roster: readonly string[],
  checkedIn: ReadonlySet<string>,
  minutes: ReadonlyMap<string, number>,
  claimed: ReadonlyMap<string, number>,
  settings: PointsSettings,
): DayLine[] {
  const fines = isWorkday(day, settings) && checkedIn.size > 0 && settings.missPenalty > 0;
  const names = new Set([...roster, ...minutes.keys(), ...claimed.keys()]);
  const lines: DayLine[] = [];
  for (const username of names) {
    const earned = claimed.get(username) ?? 0;
    const lost = unclaimed(minutes.get(username) ?? 0, earned, settings);
    const penalty = fines && roster.includes(username) && !checkedIn.has(username) ? settings.missPenalty : 0;
    if (earned || lost || penalty) lines.push({ username, earned, lost, penalty });
  }
  return lines;
}

// ---- Words --------------------------------------------------------------

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Workdays in words, like "Mon to Fri" or "Mon, Wed, Fri". */
export function workdaysText(days: readonly number[]): string {
  const sorted = [...days].sort();
  if (!sorted.length) return 'no days';
  const run = sorted.every((d, i) => i === 0 || d === sorted[i - 1]! + 1);
  if (run && sorted.length > 2) return `${DAY_NAMES[sorted[0]!]} to ${DAY_NAMES[sorted[sorted.length - 1]!]}`;
  return sorted.map((d) => DAY_NAMES[d]).join(', ');
}

/** Claim windows in words, like "12:00 to 14:00 and 17:00 to 23:59". */
export function windowsText(windows: readonly ClaimWindow[]): string {
  return windows.map((w) => `${w.from} to ${w.to}`).join(' and ');
}

export function pointsText(n: number): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'point' : 'points'}`;
}
