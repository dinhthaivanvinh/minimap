// Birthdays and anniversaries in the browser: which users celebrate today (so both maps put
// a party hat and a balloon on them), the balloon's colours, and the confetti that plays when
// a teammate sends wishes.
import { todayKind, wishesFor, type CelebrateView, type CelebrationKind } from '../../shared/celebrate.ts';
import type { TeamUser } from '../../shared/types.ts';
import { REACTION_MS, type Reaction } from './voteReactions.ts';

/** A red balloon for birthdays and a gold one for anniversaries. */
export const BALLOON: Record<CelebrationKind, { fill: string; shade: string }> = {
  birthday: { fill: '#ff5f7e', shade: '#c93a58' },
  anniversary: { fill: '#f2b631', shade: '#b07a12' },
};
export const PARTY_HAT = '#8fc9ff';
export const PARTY_DOTS = '#ff6f9f';

/** The team's users with what they celebrate today added. */
export function withCelebration<T extends { username: string }>(users: T[], view: CelebrateView | null): (T & Pick<TeamUser, 'celebration'>)[] {
  if (!view?.celebrations.some((c) => c.days === 0)) return users;
  return users.map((user) => {
    const celebration = todayKind(view, user.username);
    return celebration ? { ...user, celebration } : user;
  });
}

/** Confetti over each person who got new wishes between two looks at the celebrations. */
export function wishReactions(prev: CelebrateView | null, next: CelebrateView): Reaction[] {
  // A map that has just opened, or a new day, has nothing new to celebrate.
  if (!prev || prev.today !== next.today) return [];
  const names = new Set(next.celebrations.filter((c) => c.days === 0).map((c) => c.username));
  return [...names]
    .filter((name) => wishesFor(next, name).length > wishesFor(prev, name).length)
    .map((username) => ({ username, kind: 'confetti', ms: REACTION_MS.confetti }));
}
