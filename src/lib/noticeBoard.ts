// What the map shows about votes, the same in 2D and 3D: the notice board's notes (the
// first few open votes, ending soonest first, with a "+N" for the rest), and the wall TV's
// countdown in a vote's last hour.
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

/** The wall TV's card in the last hour of a vote: the one ending soonest, or null. */
export function countdown(votes: VoteView[], now: Date): { id: string; text: string } | null {
  const vote = mapSummary(votes, now).find((v) => Date.parse(v.endsAt) - now.getTime() <= LAST_HOUR_MS);
  if (!vote) return null;
  const waiting = vote.voters.length - vote.voted.length;
  const left = timeLeft(Date.parse(vote.endsAt) - now.getTime());
  const people = waiting === 0 ? 'everyone has voted' : `${waiting} ${waiting === 1 ? 'person' : 'people'} left`;
  return { id: vote.id, text: `${vote.title} closes in ${left}, ${people}` };
}
