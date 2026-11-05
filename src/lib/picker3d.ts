// Turns the claw machine's planned steps (lib/picker.ts) into positions in the 3D
// cabinet, so the 2D and 3D views play exactly the same draw. The 2D tray stacks its
// rows upwards; the 3D tray puts them one behind another on the floor instead.
// Nothing here touches three.js, so it can be tested on its own.
import { BODY_CENTER_Y, BODY_RADIUS } from './drawing.ts';
import { CHARACTER_ASPECT, CHUTE, clawWidth, FLOOR_Y, travelY, type DrawStep, type TrayLayout } from './picker.ts';

/** World units per machine unit. The glass, 100 by 75 units, becomes 20 by 15. */
export const SCALE = 0.2;
/** The front row, which the chute lines up with. */
export const FRONT_Z = 1.6;
/** How far back each row stands. */
export const ROW_DEPTH = 4;
/** Height of a 3D character, accessories included, for one world unit of scale. */
export const CHARACTER_HEIGHT = 3.3;
/** The 3D claw travels lower than the 2D one, so the camera can stay close to the tray. */
export const LIFT = 0.75;
/** How far the claw's fingers turn outwards when it opens. */
export const OPEN_ANGLE = (20 * Math.PI) / 180;

export interface Vec {
  x: number;
  y: number;
  z: number;
}

export function worldX(x: number): number {
  return (x - 50) * SCALE;
}

export function rowZ(row: number): number {
  return FRONT_Z - row * ROW_DEPTH;
}

/** Scales a 3D character to the tray's character width. */
export function characterScale(size: number): number {
  return (size * SCALE) / (2 * BODY_RADIUS);
}

/** The claw's width in world units. */
export function clawSize(size: number): number {
  return clawWidth(size) * SCALE;
}

/**
 * Where the claw's grip point is. Above the tray, heights map across from 2D, a little lower.
 * Below its travelling height over a character, the claw instead heads for that
 * character's middle, so it closes around the body whichever row it's in.
 */
export function clawPose(step: Pick<DrawStep, 'x' | 'y' | 'slot'>, layout: TrayLayout): Vec {
  const slot = step.slot === null ? undefined : layout.slots[step.slot];
  const x = worldX(step.x);
  if (!slot) return { x, y: (FLOOR_Y - step.y) * SCALE * LIFT, z: FRONT_Z };

  const top = travelY(layout.size);
  const grip = slot.foot - (layout.size * CHARACTER_ASPECT) / 2;
  const high = (FLOOR_Y - Math.min(step.y, top)) * SCALE * LIFT;
  const down = Math.min(1, Math.max(0, (step.y - top) / (grip - top)));
  const middle = BODY_CENTER_Y * characterScale(layout.size);
  return { x, y: high + (middle - high) * down, z: rowZ(slot.row) };
}

/** Where the winner's feet are: in their tray spot, under the claw's grip, or in the chute. */
export function prizePose(step: Pick<DrawStep, 'x' | 'y' | 'slot' | 'prize'>, layout: TrayLayout, winnerSlot: number): Vec {
  if (step.prize === 'claw') {
    const claw = clawPose(step, layout);
    return { ...claw, y: claw.y - BODY_CENTER_Y * characterScale(layout.size) };
  }
  if (step.prize === 'chute') return { x: worldX(CHUTE.x), y: 0, z: FRONT_Z };
  return slotPose(layout, winnerSlot);
}

export function slotPose(layout: TrayLayout, index: number): Vec {
  const slot = layout.slots[index];
  if (!slot) return { x: worldX(CHUTE.x), y: 0, z: FRONT_Z };
  return { x: worldX(slot.x), y: 0, z: rowZ(slot.row) };
}

export function lerp(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

/** Matches the 2D view's CSS easing closely enough: smooth moves, and falls that speed up. */
export function ease(kind: DrawStep['ease'], t: number): number {
  const x = Math.min(1, Math.max(0, t));
  if (kind === 'drop') return x * x;
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}
