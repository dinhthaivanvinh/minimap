import type { TeamState } from '../../shared/types.ts';

export const ASSEMBLY_MS = 10_500;
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
  const p = reduced ? 1 : Math.max(0, Math.min(1, (elapsed - arrival) / 1000));
  const ease = 1 - (1 - p) ** 3;
  const impact = reduced ? 0 : Math.max(0, 1 - Math.abs(p - 0.8) / 0.2);
  return {
    visible: p > 0,
    impact,
    opacity: Math.min(1, p * 3),
    portal: reduced ? 0 : Math.max(elapsed >= 6500 ? 0.28 : 0, 1 - Math.abs(p - 0.3) / 0.7),
    x: p === 1 ? 0 : (index % 2 ? 1 : -1) * (1 - ease) * 100,
    y: p === 1 ? 0 : p < 0.8 ? -75 * (1 - p / 0.8) ** 2 : Math.sin(((p - 0.8) / 0.2) * Math.PI) * 2.5,
    scale: 0.65 + ease * 0.35,
    lean: reduced || p === 1 ? 0 : (index % 2 ? 1 : -1) * (1 - p) * 12,
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
  const spread = 0.17 + ((tier - 1) / Math.max(1, tiers - 1)) * 0.25;
  return { x: 0.5 + (index % 2 ? -1 : 1) * spread, y: 0.9 - tier * 0.055, scale: 1 - tier * 0.07 };
}
