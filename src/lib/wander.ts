// How 3D characters wander around their own room. Nothing here touches
// three.js or the browser, so it can be tested on its own. Points are on the
// ground, in the 3D scene's x and z.

export interface Point {
  x: number;
  z: number;
}

/** An area on the ground: a room's floor, or something to walk around. */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** How far a wander goes from where someone stands, so walks stay short. */
export const MAX_HOP = 16;
const TRIES = 12;

export function box(x: number, z: number, w: number, d: number): Box {
  return { minX: x, maxX: x + w, minZ: z, maxZ: z + d };
}

/** A box made bigger (or smaller, with a negative amount) on every side. */
export function grow(b: Box, by: number): Box {
  return { minX: b.minX - by, maxX: b.maxX + by, minZ: b.minZ - by, maxZ: b.maxZ + by };
}

export function contains(b: Box, p: Point): boolean {
  return p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
}

/** The nearest point inside the box. A box turned inside out by shrinking collapses to its middle. */
export function clampTo(b: Box, p: Point): Point {
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  return { x: clamp(p.x, b.minX, b.maxX), z: clamp(p.z, b.minZ, b.maxZ) };
}

/**
 * Picks somewhere new to walk to: inside the area, a short walk away, not on top
 * of furniture, and as far as possible from everyone else so people spread out.
 * Returns null when there's nowhere free to go.
 */
export function pickSpot(
  area: Box,
  from: Point,
  others: Point[],
  blocked: Box[],
  random: () => number = Math.random,
): Point | null {
  const reach = { minX: Math.max(area.minX, from.x - MAX_HOP), maxX: Math.min(area.maxX, from.x + MAX_HOP), minZ: Math.max(area.minZ, from.z - MAX_HOP), maxZ: Math.min(area.maxZ, from.z + MAX_HOP) };
  if (reach.minX > reach.maxX || reach.minZ > reach.maxZ) return null;

  let best: Point | null = null;
  let bestRoom = -1;
  for (let i = 0; i < TRIES; i++) {
    const spot = { x: reach.minX + random() * (reach.maxX - reach.minX), z: reach.minZ + random() * (reach.maxZ - reach.minZ) };
    if (blocked.some((b) => contains(b, spot))) continue;
    const room = others.reduce((nearest, o) => Math.min(nearest, Math.hypot(o.x - spot.x, o.z - spot.z)), Infinity);
    if (room > bestRoom) {
      best = spot;
      bestRoom = room;
    }
  }
  return best;
}

/**
 * Which way to step to reach the goal without walking through furniture.
 * When something close by is in the way, people walk round it, and standing too
 * close to it nudges them away. Returns a direction of length 1, or zero when already there.
 */
export function steer(from: Point, goal: Point, obstacles: Box[], radius: number): Point {
  const toGoal = { x: goal.x - from.x, z: goal.z - from.z };
  const goalDistance = Math.hypot(toGoal.x, toGoal.z);
  if (goalDistance < 1e-6) return { x: 0, z: 0 };
  let dir = { x: toGoal.x / goalDistance, z: toGoal.z / goalDistance };

  for (const b of obstacles) {
    const nearest = clampTo(b, from);
    let nx = from.x - nearest.x;
    let nz = from.z - nearest.z;
    let distance = Math.hypot(nx, nz);
    if (distance > radius) continue;
    if (distance < 1e-6) {
      // Already inside: head out the nearest way.
      const exits = [
        { x: -1, z: 0, d: from.x - b.minX },
        { x: 1, z: 0, d: b.maxX - from.x },
        { x: 0, z: -1, d: from.z - b.minZ },
        { x: 0, z: 1, d: b.maxZ - from.z },
      ].sort((a, c) => a.d - c.d);
      nx = exits[0]!.x;
      nz = exits[0]!.z;
      distance = 0;
    } else {
      nx /= distance;
      nz /= distance;
    }

    if (dir.x * nx + dir.z * nz < 0 && crosses(from, goal, grow(b, radius / 2))) {
      // It's in the way: walk along its side, going round whichever side of it
      // we're already on, seen from the goal. Each step takes us further that
      // way, so the choice holds and people don't dither in front of it.
      const offset = -toGoal.z * (from.x - (b.minX + b.maxX) / 2) + toGoal.x * (from.z - (b.minZ + b.maxZ) / 2);
      const across = -toGoal.z * -nz + toGoal.x * nx;
      const side = (offset >= 0 ? 1 : -1) * (across >= 0 ? 1 : -1);
      dir = { x: -nz * side, z: nx * side };
    }
    const push = (radius - distance) / radius;
    dir = { x: dir.x + nx * push, z: dir.z + nz * push };
  }

  const length = Math.hypot(dir.x, dir.z);
  return length < 1e-6 ? { x: 0, z: 0 } : { x: dir.x / length, z: dir.z / length };
}

/** Whether the straight line between two points passes through the box. */
export function crosses(from: Point, to: Point, b: Box): boolean {
  let enter = 0;
  let leave = 1;
  for (const [start, end, lo, hi] of [
    [from.x, to.x, b.minX, b.maxX],
    [from.z, to.z, b.minZ, b.maxZ],
  ] as const) {
    const delta = end - start;
    if (Math.abs(delta) < 1e-9) {
      if (start < lo || start > hi) return false;
      continue;
    }
    let t1 = (lo - start) / delta;
    let t2 = (hi - start) / delta;
    if (t1 > t2) [t1, t2] = [t2, t1];
    enter = Math.max(enter, t1);
    leave = Math.min(leave, t2);
    if (enter > leave) return false;
  }
  return true;
}
