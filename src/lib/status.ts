// Turning a scheduled change into words, and a picked time into an exact instant.
import type { TeamUser } from '../../shared/types.ts';

/** A time of day in the viewer's own time zone, like "4:00 PM". */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** What teammates see before the change fires, or an empty string if nothing is pending. */
export function scheduledText({ scheduled }: Pick<TeamUser, 'scheduled'>): string {
  if (!scheduled) return '';
  const time = clockTime(scheduled.at);
  return scheduled.status ? `${time}: ${scheduled.status}` : `Leaving at ${time}`;
}

/** The current status and any pending change, for places that show them as one text. */
export function shownStatus(user: Pick<TeamUser, 'status' | 'scheduled'>): string {
  return [user.status, scheduledText(user)].filter(Boolean).join(' · ');
}

/**
 * The next time the clock shows `time` ("16:00"): today, or tomorrow if it has already passed.
 * The server decides whether that's allowed.
 */
export function nextInstant(time: string, now = new Date()): string {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, minute);
  return (today > now ? today : tomorrow).toISOString();
}

/** An instant as the value of a time input ("16:00"), in the viewer's own time zone. */
export function timeInputValue(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
