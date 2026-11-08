// Times for team votes in words, in the viewer's own time zone: how long is left, when
// a vote ended, the quick end-time picks and the value of a date-and-time input.
import { clockTime } from './status.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A short time left, like "42 min", "5 h" or "3 d". */
export function timeLeft(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.ceil(ms / MINUTE))} min`;
  if (ms < 2 * DAY) return `${Math.floor(ms / HOUR)} h`;
  return `${Math.floor(ms / DAY)} d`;
}

/** "ends in 2 h" while a vote is open, then "ended Fri 11:00 AM". */
export function endsText(endsAt: string, now: Date): string {
  const end = new Date(endsAt);
  const left = end.getTime() - now.getTime();
  if (left > 0) return `ends in ${timeLeft(left)}`;
  const recent = now.getTime() - end.getTime() < 6 * DAY;
  const day = recent ? end.toLocaleDateString([], { weekday: 'short' }) : end.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  return `ended ${day} ${clockTime(endsAt)}`;
}

export interface QuickEnd {
  label: string;
  at: string;
}

/** The quick picks for when a new vote ends. Ones already passed are left out. */
export function quickEnds(now: Date): QuickEnd[] {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const picks = [
    { label: 'In 1 hour', at: new Date(now.getTime() + HOUR) },
    { label: 'End of today', at: new Date(y, m, d, 23, 59) },
    { label: 'Tomorrow 12:00', at: new Date(y, m, d + 1, 12, 0) },
    { label: 'In 1 week', at: new Date(now.getTime() + 7 * DAY) },
  ];
  return picks.filter((p) => p.at > now).map((p) => ({ label: p.label, at: p.at.toISOString() }));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** An instant as the value of a date-and-time input ("2026-11-06T16:00"), in local time. */
export function localInputValue(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

/** A date-and-time input's value back as an exact instant, or '' when it is empty or not valid. */
export function fromLocalInput(value: string): string {
  // Without a zone, a date and time is read as local time, which is what the input shows.
  const t = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? new Date(value) : new Date(NaN);
  return Number.isNaN(t.getTime()) ? '' : t.toISOString();
}
