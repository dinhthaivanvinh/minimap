// What the map's notice board shows, the same in 2D and 3D: a note for each of the first
// few open votes, ending soonest first, with its time left and a "+N" for the rest.
import { LAST_HOUR_MS, mapSummary, type VoteView } from '../../shared/vote.ts';
import { timeLeft } from './voteTime.ts';

export const MAX_NOTES = 4;
const MAX_NOTE_TITLE = 18;

export interface BoardNote {
  id: string;
  title: string;
  /** Time left, like "42 min". */
  left: string;
  /** In its last hour: the note turns red and pulses. */
  urgent: boolean;
}

export interface Board {
  notes: BoardNote[];
  /** Open votes that don't fit on the board. */
  more: number;
}

/** A name short enough for a paper note. */
export function shortTitle(title: string): string {
  const chars = [...title];
  return chars.length <= MAX_NOTE_TITLE ? title : `${chars.slice(0, MAX_NOTE_TITLE - 1).join('').trimEnd()}…`;
}

export function boardNotes(votes: VoteView[], now: Date): Board {
  const open = mapSummary(votes, now);
  return {
    notes: open.slice(0, MAX_NOTES).map((vote) => {
      const ms = Date.parse(vote.endsAt) - now.getTime();
      return { id: vote.id, title: shortTitle(vote.title), left: timeLeft(ms), urgent: ms <= LAST_HOUR_MS };
    }),
    more: Math.max(0, open.length - MAX_NOTES),
  };
}

/** Where a note links to. The board itself links to /vote. */
export function voteLink(id: string): string {
  return `/vote?id=${encodeURIComponent(id)}`;
}
