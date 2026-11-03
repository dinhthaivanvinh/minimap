// How someone has decorated their character. The server validates against these
// limits, and the editor stops at them.

export const ACCESSORIES = ['sprout', 'ears', 'antenna', 'bow', 'party', 'headphones'] as const;

export type Accessory = (typeof ACCESSORIES)[number];

/** Things people choose to wear, in any combination. */
export const WORN_ITEMS = ['hat', 'glasses', 'mustache'] as const;

export type WornItem = (typeof WORN_ITEMS)[number];

export interface Stroke {
  color: string;
  width: number;
  /** Flat x, y pairs in the character's 64 by 62 drawing space. */
  points: number[];
}

export interface CharacterDesign {
  color: string;
  wearing: WornItem[];
  strokes: Stroke[];
}

export const MAX_STROKES = 40;
export const MAX_DRAWING_POINTS = 600;
export const MIN_STROKE_WIDTH = 1;
export const MAX_STROKE_WIDTH = 10;

/** The oval people can draw in, which covers the character's body and face. */
export const FACE = { x: 32, y: 35.5, radiusX: 24, radiusY: 22.5 } as const;

const FACE_TOLERANCE = 0.5; // Allows for points rounded just past the edge.

export function isOnFace(x: number, y: number): boolean {
  const nx = (x - FACE.x) / (FACE.radiusX + FACE_TOLERANCE);
  const ny = (y - FACE.y) / (FACE.radiusY + FACE_TOLERANCE);
  return nx * nx + ny * ny <= 1;
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
