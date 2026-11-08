import type { TeamState } from '../../shared/types.ts';

// Heroes finish crossing their doorways and the pre-finale camera sweep settles by this point.
export const ARRIVAL_MS = 6500;
// The 3D finale's camera lingers on each hero this long before moving to the next.
export const FLYBY_CLOSEUP_MS = 2500;
// Then eases back out to the wide shot in this long, for a clean landing frame.
export const FLYBY_RETURN_MS = 1200;
// Every hero gets a close-up, so the celebration's length grows with the team.
export const assemblyMs = (heroCount: number) =>
  ARRIVAL_MS + Math.max(0, heroCount) * FLYBY_CLOSEUP_MS + FLYBY_RETURN_MS;
export function officeAssembly(state: Pick<TeamState, 'places' | 'users'>) {
  const offices = new Set(state.places.map((p) => p.id));
  const members = state.users.filter((user) => user.place !== null && offices.has(user.place));
  const total = state.users.length;
  return {
    members,
    total,
    required: Math.ceil(total * 0.75),
    unlocked: total > 0 && members.length * 4 >= total * 3,
  };
}
export function heroPose(index: number, count: number, elapsed: number, reduced = false) {
  const arrival = 1200 + (index / Math.max(1, count - 1)) * 3600;
  // Open, cross the doorway, settle forward, then close behind the hero.
  const p = reduced ? 1 : Math.max(0, Math.min(1, (elapsed - arrival) / 1400));
  const window = (start: number, end: number) => Math.max(0, Math.min(1, (p - start) / (end - start)));
  const smooth = (v: number) => v * v * (3 - 2 * v);
  const emerge = smooth(window(0.18, 0.72));
  const settle = smooth(window(0.72, 0.86));
  const portalScale = reduced ? 0 : smooth(window(0, 0.18)) * (1 - smooth(window(0.82, 1)));
  return {
    progress: p,
    emerge,
    visible: emerge > 0,
    impact: reduced ? 0 : Math.max(0, 1 - Math.abs(p - 0.86) / 0.12),
    opacity: emerge,
    portal: portalScale > 0 ? 1 : 0,
    portalScale,
    portalRotation: p * Math.PI * 3,
    // Both renderers start at the fixed doorway, never at a scene edge.
    x: 0,
    y: settle === 1 ? 0 : (1 - emerge) * -18 - (1 - settle) * 8,
    scale: 0.82 + emerge * 0.18,
    lean: reduced || emerge === 1 ? 0 : Math.sin(emerge * Math.PI * 2) * 3,
    forward: emerge * 0.75 + settle * 0.25,
    depthScale: 0.025 + emerge * 0.975,
  };
}
export function heroGrid(count: number) {
  const columns = Math.min(Math.max(1, count), 8, Math.max(1, Math.ceil(Math.sqrt(count * 1.7))));
  return { columns, rows: Math.ceil(count / columns) };
}

/** A spearhead rather than a class-photo grid: one lead, pairs fanning behind. */
export function heroFormation(index: number, count: number) {
  if (count > 15) {
    const grid = heroGrid(count);
    return {
      x: 0.09 + (((index % grid.columns) + 0.5) / grid.columns) * 0.82,
      y: 0.4 + ((Math.floor(index / grid.columns) + 1) / grid.rows) * 0.49,
      scale: Math.max(0.25, 2.2 / grid.columns),
    };
  }
  if (index === 0) return { x: 0.5, y: 0.9, scale: 1 };
  const tier = Math.ceil(index / 2),
    tiers = Math.ceil((count - 1) / 2);
  // Every neighbour is the same step apart, lead to first wing included; small teams keep a
  // comfortable step and big ones tighten so the outermost pair still fits.
  const spread = tier * Math.min(0.17, 0.42 / tiers);
  return { x: 0.5 + (index % 2 ? -1 : 1) * spread, y: 0.9 - tier * 0.055, scale: 1 - tier * 0.07 };
}
