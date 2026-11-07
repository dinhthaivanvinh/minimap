// Where the towers of a vote's 3D results go: one per option, in the order they were
// added (so a tower stays put as it grows), as tall as its count, the winner gold-topped
// once the vote has closed. VoteSkyline3D.tsx only draws them.
import { results, type VoteView } from '../../shared/vote.ts';

export const TOWER_GAP = 2.4;
const MIN_HEIGHT = 0.2;
const MAX_HEIGHT = 6;

export interface Tower {
  id: string;
  label: string;
  count: number;
  x: number;
  height: number;
  gold: boolean;
}

export function skylineTowers(vote: Pick<VoteView, 'options' | 'voted'>, closed: boolean): Tower[] {
  const { winners } = results(vote);
  const gold = new Set(closed ? winners.map((w) => w.id) : []);
  const most = Math.max(1, ...vote.options.map((o) => o.count));
  const middle = ((vote.options.length - 1) * TOWER_GAP) / 2;
  return vote.options.map((option, i) => ({
    id: option.id,
    label: option.text,
    count: option.count,
    x: i * TOWER_GAP - middle,
    height: MIN_HEIGHT + (option.count / most) * (MAX_HEIGHT - MIN_HEIGHT),
    gold: gold.has(option.id),
  }));
}
