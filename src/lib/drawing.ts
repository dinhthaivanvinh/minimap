// Helpers for the lines people draw on their characters' faces. Nothing here
// touches the browser, so it can be tested on its own.
import { FACE, type Stroke } from '../../shared/look.ts';

/** Skips points closer than this, which keeps saved drawings small. */
const MIN_POINT_GAP = 0.8;

// The 3D body. scene3d.ts builds its sphere from these same numbers.
export const BODY_RADIUS = 1.35;
export const BODY_CENTER_Y = 1.25;
export const BODY_SCALE_Y = 0.98;
export const BODY_SCALE_Z = 0.95;

// World units per drawing unit, chosen so the drawn eyes (32 +/- 9, 36) land on
// the 3D eyes and the top of the drawn head (y 13) lands on top of the sphere.
export const DRAWING_SCALE = 0.0511;
const EYES_X = 32;
const EYES_Y = 36;
const EYES_WORLD_Y = 1.42;

export function pointPairs(stroke: Stroke): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i + 1 < stroke.points.length; i += 2) {
    pairs.push([stroke.points[i] ?? 0, stroke.points[i + 1] ?? 0]);
  }
  return pairs;
}

export function countPoints(strokes: Stroke[]): number {
  return strokes.reduce((sum, stroke) => sum + stroke.points.length / 2, 0);
}

/** The SVG path for a stroke. A single tap still leaves a dot. */
export function strokePath(stroke: Stroke): string {
  const [first, ...rest] = pointPairs(stroke);
  if (!first) return '';
  const start = `M${first[0]} ${first[1]}`;
  if (!rest.length) return `${start}h.01`;
  return `${start}L${rest.map(([x, y]) => `${x} ${y}`).join(' ')}`;
}

/** Keeps a point on the face, rounded the way the server stores it. */
export function clampToFace(x: number, y: number): [number, number] {
  const nx = (x - FACE.x) / FACE.radiusX;
  const ny = (y - FACE.y) / FACE.radiusY;
  const reach = Math.hypot(nx, ny);
  const scale = reach > 1 ? 1 / reach : 1;
  const round = (value: number) => Math.round(value * 10) / 10;
  return [round(FACE.x + nx * scale * FACE.radiusX), round(FACE.y + ny * scale * FACE.radiusY)];
}

/** Adds a point to a stroke being drawn, unless it's almost on top of the last one. */
export function extendStroke(stroke: Stroke, x: number, y: number): Stroke {
  const { points } = stroke;
  const lastX = points[points.length - 2] ?? Infinity;
  const lastY = points[points.length - 1] ?? Infinity;
  if (Math.hypot(x - lastX, y - lastY) < MIN_POINT_GAP) return stroke;
  return { ...stroke, points: [...points, x, y] };
}

/** Where a drawn point sits on the 3D character, wrapped onto the front of the body. */
export function surfacePoint(x: number, y: number, lift = 0): [number, number, number] {
  const worldX = (x - EYES_X) * DRAWING_SCALE;
  const worldY = EYES_WORLD_Y + (EYES_Y - y) * DRAWING_SCALE;
  const nx = worldX / BODY_RADIUS;
  const ny = (worldY - BODY_CENTER_Y) / (BODY_RADIUS * BODY_SCALE_Y);
  const depth = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return [worldX, worldY, BODY_RADIUS * BODY_SCALE_Z * depth + lift];
}
