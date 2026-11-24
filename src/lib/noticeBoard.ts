// What the map shows about votes, the same in 2D and 3D: the notice board's notes (the
// first few open votes, ending soonest first, with a "+N" for the rest, and a note with the
// reward points leaders), and the wall TV's countdown in a vote's last hour.
import type { PointsView } from '../../shared/points.ts';
import type { TeamUser } from '../../shared/types.ts';
import { LAST_HOUR_MS, mapSummary, type VoteView } from '../../shared/vote.ts';
import { timeLeft } from './voteTime.ts';

export const MAX_NOTES = 4;
const MAX_NOTE_TITLE = 18;
const MAX_LEADER_NAME = 10;
/** Leaders on the points note. */
export const MAX_LEADERS = 3;

export interface BoardNote {
  id: string;
  title: string;
  /** Time left, like "42 min". */
  left: string;
  /** In its last hour: the note turns red and pulses. */
  urgent: boolean;
}

/** Someone on the points note: a short name and their claimed points. */
export interface Leader {
  name: string;
  points: number;
}

export interface Board {
  notes: BoardNote[];
  /** Open votes that don't fit on the board. */
  more: number;
  /** The points note, which takes one note's place. Null before points have loaded. */
  leaders: Leader[] | null;
}

/** A name short enough for a paper note. */
export function shortTitle(title: string): string {
  const chars = [...title];
  return chars.length <= MAX_NOTE_TITLE ? title : `${chars.slice(0, MAX_NOTE_TITLE - 1).join('').trimEnd()}…`;
}

export function boardNotes(votes: VoteView[], now: Date, leaders: Leader[] | null = null): Board {
  const open = mapSummary(votes, now);
  const room = leaders ? MAX_NOTES - 1 : MAX_NOTES;
  return {
    notes: open.slice(0, room).map((vote) => {
      const ms = Date.parse(vote.endsAt) - now.getTime();
      return { id: vote.id, title: shortTitle(vote.title), left: timeLeft(ms), urgent: ms <= LAST_HOUR_MS };
    }),
    more: Math.max(0, open.length - room),
    leaders,
  };
}

function shortName(name: string): string {
  const chars = [...name];
  return chars.length <= MAX_LEADER_NAME ? name : `${chars.slice(0, MAX_LEADER_NAME - 1).join('').trimEnd()}…`;
}

/** The top few on the points board who have any points, by nickname. */
export function topLeaders(view: PointsView | null, users: readonly TeamUser[]): Leader[] | null {
  if (!view) return null;
  const nickname = new Map(users.map((u) => [u.username, u.nickname]));
  return view.board
    .map((line) => ({ name: shortName(nickname.get(line.username) ?? line.username), points: line.balance }))
    .filter((leader) => leader.points > 0)
    .slice(0, MAX_LEADERS);
}

/** What the points note says to screen readers, the same on both maps. */
export function leadersLabel(leaders: readonly Leader[]): string {
  return leaders.length ? `Top points: ${leaders.map((l) => `${l.name} ${l.points}`).join(', ')}` : 'Reward points: nobody has points yet';
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
