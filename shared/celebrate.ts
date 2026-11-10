// Birthdays and work anniversaries: the rules the server and the browser share. A birthday
// is kept as a month and day only (never the year), and a start date as a full date, so the
// map can say how many years someone has been on the team. Every date here is a day on the
// team's own calendar, written YYYY-MM-DD, so the server decides when a day begins.

export type CelebrationKind = 'birthday' | 'anniversary';

/** What is kept about one person. Null means not set. */
export interface CelebrateDates {
  /** MM-DD. */
  birthday: string | null;
  /** YYYY-MM-DD, the first day on the team. */
  joined: string | null;
}

export interface Celebration {
  username: string;
  kind: CelebrationKind;
  /** The day it falls on, YYYY-MM-DD. */
  date: string;
  /** Days from today: 0 is today. */
  days: number;
  /** Years on the team, for anniversaries. */
  years?: number;
  /** Who sent wishes, for today's celebrations only. */
  wishes: string[];
}

/** What everyone may see: today's and the coming days' celebrations, soonest first. */
export interface CelebrateView {
  today: string;
  celebrations: Celebration[];
}

/** How far ahead the side panel looks. */
export const UPCOMING_DAYS = 30;
/** How many coming celebrations the side panel lists. */
export const MAX_UPCOMING = 3;

const MONTH_DAY_RE = /^(\d{2})-(\d{2})$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FIRST_YEAR = 1970;

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

function daysIn(month: number, year: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** A month and day that exist in some year, such as 02-29. */
export function isMonthDay(value: unknown): value is string {
  const match = typeof value === 'string' ? MONTH_DAY_RE.exec(value) : null;
  if (!match) return false;
  const [month, day] = [Number(match[1]), Number(match[2])];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysIn(month, 2024);
}

/** A real calendar date from 1970 on. */
export function isDate(value: unknown): value is string {
  const match = typeof value === 'string' ? DATE_RE.exec(value) : null;
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return year >= FIRST_YEAR && month >= 1 && month <= 12 && day >= 1 && day <= daysIn(month, year);
}

/** Today on the wall calendar of a time zone (or the computer's own). */
export function dateIn(now: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(date: string, days: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Whether a MM-DD falls on a date. A 29 February falls on the 28th in other years. */
export function fallsOn(monthDay: string, date: string): boolean {
  const year = Number(date.slice(0, 4));
  const shown = monthDay === '02-29' && !isLeap(year) ? '02-28' : monthDay;
  return date.slice(5) === shown;
}

/**
 * Everyone's celebrations from today to `days` ahead, soonest first. An anniversary starts
 * at one year: a start date that is today or still to come isn't one yet.
 */
export function celebrations(people: Iterable<readonly [string, CelebrateDates]>, today: string, days = UPCOMING_DAYS): Celebration[] {
  const found: Celebration[] = [];
  const list = [...people];
  for (let ahead = 0; ahead <= days; ahead++) {
    const date = addDays(today, ahead);
    const year = Number(date.slice(0, 4));
    const day: Celebration[] = [];
    for (const [username, { birthday, joined }] of list) {
      if (birthday && fallsOn(birthday, date)) day.push({ username, kind: 'birthday', date, days: ahead, wishes: [] });
      const years = joined ? year - Number(joined.slice(0, 4)) : 0;
      if (joined && years >= 1 && fallsOn(joined.slice(5), date)) {
        day.push({ username, kind: 'anniversary', date, days: ahead, years, wishes: [] });
      }
    }
    day.sort((a, b) => a.username.localeCompare(b.username) || a.kind.localeCompare(b.kind));
    found.push(...day);
  }
  return found;
}

/** What a person celebrates today, or null. A birthday wins when both fall on the same day. */
export function todayKind(view: CelebrateView | null, username: string): CelebrationKind | null {
  const mine = view?.celebrations.filter((c) => c.days === 0 && c.username === username) ?? [];
  if (!mine.length) return null;
  return mine.some((c) => c.kind === 'birthday') ? 'birthday' : 'anniversary';
}

/** Who has sent wishes to a person today, over all of their celebrations. */
export function wishesFor(view: CelebrateView | null, username: string): string[] {
  const today = view?.celebrations.filter((c) => c.days === 0 && c.username === username) ?? [];
  return [...new Set(today.flatMap((c) => c.wishes))];
}

/** "Lan's birthday" or "Minh: 3 years on the team". */
export function celebrationText(c: Pick<Celebration, 'kind' | 'years'>, name: string): string {
  if (c.kind === 'birthday') return `${name}’s birthday`;
  return `${name}: ${c.years} year${c.years === 1 ? '' : 's'} on the team`;
}

/** "Birthday today!" or "3 years on the team today!", for the person's own card. */
export function todayText(c: Pick<Celebration, 'kind' | 'years'>): string {
  if (c.kind === 'birthday') return 'Birthday today!';
  return `${c.years} year${c.years === 1 ? '' : 's'} on the team today!`;
}

/** "Today", "Tomorrow" or "In 5 days". */
export function whenText(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}
