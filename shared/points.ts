// Reward points: the rules the server and the browser share. People earn points for the time
// they spend in an earning office (by default the first office on the map) during office hours
// on workdays, up to a daily cap, like pay by the hour. On a workday, someone who never checks in
// loses points. A balance never goes below zero. A day when nobody checks in at all costs nobody
// anything, so holidays and office closures need no setup.

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
  /** Public addresses of the office network. Empty means no check. */
  ips: string[];
}

/** One person's line in a closed day. */
export interface DayLine {
  username: string;
  earned: number;
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
  settings: Omit<PointsSettings, 'ips'> & { ipCheck: boolean; offices: string[] };
  day: string;
  /** Everyone's balance with today's points so far, highest first. */
  board: { username: string; balance: number; today: number }[];
  history: DayRecord[];
  adjustments: Adjustment[];
}

/** What only the person sees about their own stay in the office. */
export interface PointsMe {
  /** In an earning office now. */
  inOffice: boolean;
  /** That stay earns: the office network was seen, or there is no check. */
  verified: boolean;
  /** Minutes counted today so far, before the cap. */
  minutesToday: number;
  checkedIn: boolean;
}

export const DEFAULT_SETTINGS: PointsSettings = {
  perHour: 10,
  dailyCapHours: 8,
  missPenalty: 20,
  start: '08:00',
  end: '18:00',
  workdays: [1, 2, 3, 4, 5],
  offices: [],
  ips: [],
};

export const MAX_PER_HOUR = 1000;
export const MAX_PENALTY = 10_000;
export const MAX_IPS = 20;
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
  if (!Array.isArray(v.ips) || v.ips.length > MAX_IPS) return `List up to ${MAX_IPS} office addresses.`;
  const ips: string[] = [];
  for (const ip of v.ips) {
    const clean = cleanIp(ip);
    if (!clean) return `${String(ip).slice(0, 50)} is not an IP address. Use one like 203.0.113.7 or 203.0.113.0/24.`;
    if (!ips.includes(clean)) ips.push(clean);
  }
  return {
    perHour: v.perHour,
    dailyCapHours: v.dailyCapHours,
    missPenalty: v.missPenalty,
    start: v.start,
    end: v.end,
    workdays: [...new Set(v.workdays as number[])].sort(),
    offices: [...new Set(v.offices as string[])],
    ips,
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

// ---- Addresses ----------------------------------------------------------

function ipv4(text: string): number | null {
  const parts = text.split('.');
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return null;
  return parts.reduce((n, p) => n * 256 + Number(p), 0);
}

/** A plain address the same way every time: IPv4 inside IPv6 (`::ffff:1.2.3.4`) becomes IPv4. */
export function plainIp(ip: string): string {
  const text = ip.trim().toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  return mapped ? mapped[1]! : text;
}

/** An address or IPv4 range for the list, or null when it isn't one. */
export function cleanIp(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 50) return null;
  const text = plainIp(value);
  const [address, bits, extra] = text.split('/');
  if (extra !== undefined || !address) return null;
  if (ipv4(address) !== null) {
    if (bits === undefined) return address;
    return /^\d{1,2}$/.test(bits) && Number(bits) <= 32 ? `${address}/${Number(bits)}` : null;
  }
  // IPv6: only whole addresses, compared as text.
  return bits === undefined && /^[0-9a-f:]+$/.test(address) && address.includes(':') ? address : null;
}

/** Whether an address is on the office's list. An empty list lets everyone through. */
export function ipAllowed(ip: string | undefined, list: readonly string[]): boolean {
  if (!list.length) return true;
  if (!ip) return false;
  const address = plainIp(ip);
  const n = ipv4(address);
  return list.some((entry) => {
    const [base, bits] = entry.split('/');
    if (bits === undefined) return base === address;
    const b = ipv4(base!);
    if (n === null || b === null) return false;
    const size = 2 ** (32 - Number(bits));
    return Math.floor(n / size) === Math.floor(b / size);
  });
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

export function isWorkday(day: string, settings: Pick<PointsSettings, 'workdays'>): boolean {
  return settings.workdays.includes(new Date(`${day}T12:00:00Z`).getUTCDay());
}

/**
 * The points for a closed day, by person. Someone on the day's list who never checked in on a
 * workday loses the penalty, unless nobody checked in at all that day.
 */
export function closeDay(
  day: string,
  roster: readonly string[],
  checkedIn: ReadonlySet<string>,
  minutes: ReadonlyMap<string, number>,
  settings: PointsSettings,
): DayLine[] {
  const fines = isWorkday(day, settings) && checkedIn.size > 0 && settings.missPenalty > 0;
  const names = new Set([...roster, ...minutes.keys()]);
  const lines: DayLine[] = [];
  for (const username of names) {
    const earned = pointsFor(minutes.get(username) ?? 0, settings);
    const penalty = fines && roster.includes(username) && !checkedIn.has(username) ? settings.missPenalty : 0;
    if (earned || penalty) lines.push({ username, earned, penalty });
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

export function pointsText(n: number): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'point' : 'points'}`;
}
