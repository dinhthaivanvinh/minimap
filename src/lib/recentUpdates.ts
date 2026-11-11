// The rules of the home page's "Recent updates" card: who changed their place or status
// in the last few minutes. The server keeps no feed. Each user's `updatedAt` says when
// their whereabouts last changed, so the rows come from comparing each new team state
// with the one before it, and from `updatedAt` alone when the page has just opened.
import type { Place, TeamState, TeamUser } from '../../shared/types.ts';
import { placeName } from './layout.ts';

/** How long a row stays, and how far back a page that has just opened looks. */
export const RECENT_MS = 5 * 60_000;
export const MAX_RECENT = 5;

export interface RecentUpdate {
  username: string;
  /** When it happened: the user's `updatedAt`, which is the server's clock, in ms. */
  at: number;
  place: string | null;
  status: string;
  /** Where they were and what their status was before. Missing for a row seen as the page opened. */
  from?: { place: string | null; status: string };
  /** A scheduled change ("Leaving early") made it, rather than the person by hand. */
  scheduled: boolean;
}

// When someone's place or status last changed, in ms. Not a number if they have never set one.
function changedAt(user: TeamUser): number {
  return user.updatedAt ? Date.parse(user.updatedAt) : NaN;
}

// A server clock ahead of this screen's puts `at` in the future. That counts as now.
function isRecent(at: number, now: Date): boolean {
  return now.getTime() - at < RECENT_MS;
}

/**
 * The rows for a page that has just opened: everyone whose place or status changed in the
 * last 5 minutes, with where they are now. Someone with no place and no status is left out:
 * they have nothing to show, and may only have been cleared by the morning reset since.
 *
 * Pass the last state seen as `since` when live updates come back after being cut off (a
 * laptop that slept, a server restart). States were missed, perhaps a morning reset too, so
 * what someone changed from isn't known. Only people updated since then get a row.
 */
export function seedUpdates(state: TeamState, now: Date, since: TeamState | null = null): RecentUpdate[] {
  const seen = new Map(since?.users.map((user) => [user.username, user.updatedAt]));
  return state.users.flatMap((user) => {
    const at = changedAt(user);
    if (!isRecent(at, now) || (user.place === null && !user.status)) return [];
    if (since && seen.get(user.username) === user.updatedAt) return [];
    return [{ username: user.username, at, place: user.place, status: user.status, scheduled: false }];
  });
}

/**
 * The rows a live update adds: people whose `updatedAt` moved and whose place or status
 * is different. A new nickname or character moves neither. The morning reset clears every
 * place and status but leaves `updatedAt` alone, so it doesn't fill the card with the whole team.
 * `prev` must be the state right before `next`, with none missed in between.
 */
export function diffUpdates(prev: TeamState, next: TeamState): RecentUpdate[] {
  // A Map, because a username such as __proto__ breaks a plain object.
  const before = new Map(prev.users.map((user) => [user.username, user]));
  return next.users.flatMap((user) => {
    const old = before.get(user.username);
    // Someone just added to the team has no "before".
    if (!old || user.updatedAt === old.updatedAt) return [];
    if (user.place === old.place && user.status === old.status) return [];
    const at = changedAt(user);
    if (Number.isNaN(at)) return [];
    // A scheduled change fires at its time or later, and puts the person in the place it
    // named. Going there by hand before then also ends it, but that is the person's own move.
    const plan = old.scheduled;
    const scheduled = Boolean(plan && !user.scheduled && user.place === plan.place && at >= Date.parse(plan.at));
    return [{ username: user.username, at, place: user.place, status: user.status, from: { place: old.place, status: old.status }, scheduled }];
  });
}

/** One row for each person, showing their latest change: newest first, none older than 5 minutes, 5 at most. */
export function mergeUpdates(list: RecentUpdate[], added: RecentUpdate[], now: Date): RecentUpdate[] {
  const latest = new Map<string, RecentUpdate>();
  for (const row of [...list, ...added]) latest.set(row.username, row);
  return [...latest.values()]
    .filter((row) => isRecent(row.at, now))
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_RECENT);
}

/** The rows the card shows: newer than what was closed, and still younger than 5 minutes. */
export function visibleUpdates(list: RecentUpdate[], now: Date, closedAt: number): RecentUpdate[] {
  return list.filter((row) => row.at > closedAt && isRecent(row.at, now));
}

/**
 * What to remember when the card is closed: the time of the newest row it was showing.
 * Rows are compared with it, not with this screen's clock, so Close hides exactly what was
 * showing and the next update brings the card back, even when the two clocks disagree.
 */
export function closeTime(rows: RecentUpdate[]): number {
  return Math.max(0, ...rows.map((row) => row.at));
}

/**
 * What a row says after the person's name, with the space or colon that joins the two:
 * "Lan" + " moved to Work from home", "Minh" + ': "Out for lunch"'.
 */
export function updateText(row: RecentUpdate, places: Place[]): string {
  const where = placeName(places, row.place);
  const said = row.status ? `: "${row.status}"` : '';
  // Seen as the page opened, so all that is known is where they are now.
  if (!row.from) return ` is in ${where}${said}`;
  const note = row.scheduled ? ' (scheduled)' : '';
  if (row.place !== row.from.place) return ` moved to ${where}${row.status === row.from.status ? '' : said}${note}`;
  return `${said || ' cleared their status'}${note}`;
}

/** How long ago, in whole minutes: "now", then "1 min" to "4 min". */
export function agoText(row: RecentUpdate, now: Date): string {
  const minutes = Math.floor((now.getTime() - row.at) / 60_000);
  return minutes < 1 ? 'now' : `${minutes} min`;
}
