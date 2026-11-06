import type { TeamState, TeamUser } from '../../shared/types.ts';
import type { LatestResult, VoteView } from '../../shared/vote.ts';
import type { SelectHandler } from '../components/Badge.tsx';
import type { Ambience } from '../lib/ambience.ts';

/** Asks the map to bring a person into view. `at` lets the same person be requested twice. */
export interface FocusRequest {
  username: string;
  at: number;
}

/** What the map shows about votes beyond the notice board. Each screen can turn them off. */
export interface VoteMarks {
  /** People invited to an open vote shown on the map who haven't voted yet. */
  waiting: ReadonlySet<string>;
  /** A vote that closed in the last 3 hours, for the banner. */
  result: LatestResult | null;
}

export interface MapProps {
  state: TeamState;
  isDimmed: (user: TeamUser) => boolean;
  selected: string | null;
  focus: FocusRequest | null;
  onSelect: SelectHandler;
  onArcade: (trigger: HTMLElement) => void;
  /** The time of day and weather to show (lib/ambience.ts). */
  look: Ambience;
  /** The team's votes, as anyone may see them. The notice board shows the open ones. */
  votes: VoteView[];
  /** Markers over people who haven't voted, and the latest result's banner. Null when turned off. */
  voteMarks: VoteMarks | null;
}
