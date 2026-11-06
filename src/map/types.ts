import type { TeamState, TeamUser } from '../../shared/types.ts';
import type { VoteView } from '../../shared/vote.ts';
import type { SelectHandler } from '../components/Badge.tsx';
import type { Ambience } from '../lib/ambience.ts';

/** Asks the map to bring a person into view. `at` lets the same person be requested twice. */
export interface FocusRequest {
  username: string;
  at: number;
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
}
