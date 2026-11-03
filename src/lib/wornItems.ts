// Glasses and the mustache are ready-made lines, so 2D and 3D draw the same shapes
// and they wrap around the 3D face just like someone's own drawing.
import type { Stroke, WornItem } from '../../shared/look.ts';

const INK = '#2a2657';

function ring(cx: number, cy: number, radius: number): number[] {
  const points: number[] = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    points.push(Math.round((cx + Math.cos(angle) * radius) * 10) / 10, Math.round((cy + Math.sin(angle) * radius) * 10) / 10);
  }
  return points;
}

const GLASSES: Stroke[] = [
  { color: INK, width: 1.8, points: ring(23, 36, 6.5) },
  { color: INK, width: 1.8, points: ring(41, 36, 6.5) },
  { color: INK, width: 1.8, points: [29.5, 35, 34.5, 35] },
  { color: INK, width: 1.8, points: [16.5, 35, 10, 33] },
  { color: INK, width: 1.8, points: [47.5, 35, 54, 33] },
];

const MUSTACHE: Stroke[] = [
  { color: INK, width: 3.5, points: [32, 44, 29, 45.8, 26, 46, 23.5, 44.6] },
  { color: INK, width: 3.5, points: [32, 44, 35, 45.8, 38, 46, 40.5, 44.6] },
];

/** The smile moves down this far to make room under a mustache. */
export const MUSTACHE_SMILE_DROP = 7;

/** The lines for whatever someone is wearing. The hat is a solid shape, so it isn't here. */
export function wornStrokes(wearing: readonly WornItem[]): Stroke[] {
  return [...(wearing.includes('glasses') ? GLASSES : []), ...(wearing.includes('mustache') ? MUSTACHE : [])];
}
