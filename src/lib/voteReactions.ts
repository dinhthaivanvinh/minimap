// How characters react to votes, planned from two looks at the votes: before and after a
// live update or a tick of the clock. The maps only play the plan. A reaction never gives
// away a pick on an anonymous vote: a hop only says someone voted, which everyone can see,
// and when an anonymous vote closes, everyone invited gets the same confetti.
import { results, type VoteView } from '../../shared/vote.ts';

export type ReactionKind = 'hop' | 'cheer' | 'clap' | 'confetti';

export interface Reaction {
  username: string;
  kind: ReactionKind;
  /** How long it plays, in ms. */
  ms: number;
}

export interface VoteSnapshot {
  votes: VoteView[];
  at: Date;
}

export const REACTION_MS: Record<ReactionKind, number> = { hop: 600, cheer: 3000, clap: 3000, confetti: 1500 };
/** A close seen later than this (a sleeping tab, a map opened afterwards) gets no reaction. */
export const LATE_MS = 60_000;
// When someone has more than one reaction, the biggest one plays.
const RANK: ReactionKind[] = ['hop', 'clap', 'confetti', 'cheer'];

export function reactions(prev: VoteSnapshot | null, next: VoteSnapshot): Reaction[] {
  // A map that has just opened has nothing to compare with, so nothing is late news to it.
  if (!prev) return [];
  const found = new Map<string, ReactionKind>();
  const add = (username: string, kind: ReactionKind) => {
    const current = found.get(username);
    if (!current || RANK.indexOf(kind) > RANK.indexOf(current)) found.set(username, kind);
  };

  const before = new Map(prev.votes.map((v) => [v.id, v]));
  for (const vote of next.votes) {
    const old = before.get(vote.id);
    if (!old) continue;

    // New voters hop once. A changed ballot leaves the list of voters as it was, so nobody hops.
    for (const name of vote.voted) if (!old.voted.includes(name)) add(name, 'hop');

    const end = Date.parse(vote.endsAt);
    const closedNow = end > prev.at.getTime() && end <= next.at.getTime() && next.at.getTime() - end <= LATE_MS;
    if (!closedNow || vote.voted.length === 0) continue;
    if (vote.anonymous) {
      for (const name of vote.voters) add(name, 'confetti');
      continue;
    }
    const winners = new Set(results(vote).winners.flatMap((o) => o.pickedBy ?? []));
    for (const name of vote.voters) add(name, winners.has(name) ? 'cheer' : 'clap');
  }
  return [...found].map(([username, kind]) => ({ username, kind, ms: REACTION_MS[kind] }));
}
