// How each fund tier dresses a character, for both 2D and 3D. Things on the body (patches, a
// "nợ 50k" note, bow tie, medal, suit, gold chain) are ready-made lines, like the glasses in
// wornItems.ts, so they wrap around the 3D body for free. Things off the body (rain cloud,
// fly, top hat, crown, sparkles) are named here and drawn by each renderer.
import { shownTier, type FundPerson, type FundTier } from '../../shared/fund.ts';
import type { Stroke } from '../../shared/look.ts';
import type { TeamUser } from '../../shared/types.ts';

export const INK = '#2a2657';
export const GOLD = '#f2b631';
export const GOLD_DARK = '#b07a12';
export const CLOUD = '#8d8b85';
export const RAIN = '#6fb5f0';
const PATCH = '#a0784a';
const PATCH_GREY = '#8c8a80';
const BANDAGE = '#f0c9a0';
const NOTE = '#ffe27a';
const RED = '#e24b4a';

export interface FundArt {
  /** Drawn over the person's own drawing, so nobody can paint over a debt. */
  strokes: Stroke[];
  mouth: 'smile' | 'frown' | 'flat';
  /** Takes the place of the person's hat and automatic accessory. */
  headwear: 'tophat' | 'crown' | null;
  cloud: boolean;
  fly: boolean;
  sparkles: boolean;
}

const round = (n: number) => Math.round(n * 10) / 10;

function ring(cx: number, cy: number, radius: number): number[] {
  const points: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    points.push(round(cx + Math.cos(angle) * radius), round(cy + Math.sin(angle) * radius));
  }
  return points;
}

const line = (color: string, width: number, points: number[]): Stroke => ({ color, width, points });

const PATCHES: Stroke[] = [
  line(PATCH, 3.6, [13, 45, 21, 45]),
  line(PATCH, 3.6, [13, 48, 21, 48]),
  line(PATCH, 3.6, [13, 51, 21, 51]),
  line(INK, 0.9, [12.5, 43.5, 21.5, 52.5]),
  line(INK, 0.9, [12.5, 52.5, 21.5, 43.5]),
  line(PATCH_GREY, 3.4, [42, 51, 48, 51]),
  line(PATCH_GREY, 3.4, [42, 54, 48, 54]),
  line(INK, 0.8, [41.5, 49.5, 48.5, 55.5]),
  // A band-aid on the head.
  line(BANDAGE, 4.5, [38, 20, 48, 25]),
  line(INK, 0.8, [42.3, 21.6, 43.7, 23.4]),
  line(INK, 0.8, [42.1, 23.2, 43.9, 21.8]),
];

const IOU: Stroke[] = [
  line(NOTE, 3.6, [11, 46, 26, 46]),
  line(NOTE, 3.6, [11, 49, 26, 49]),
  line(NOTE, 3.6, [11, 52, 26, 52]),
  line(RED, 1.6, ring(18.5, 44.4, 0.5)),
  // "50k"
  line(INK, 1.1, [15.5, 46.6, 12.8, 46.6, 12.8, 48.6, 15, 48.6, 15.5, 49.2, 15.5, 50.4, 15, 51, 12.8, 51]),
  line(INK, 1.1, [17.2, 46.6, 19.6, 46.6, 19.6, 51, 17.2, 51, 17.2, 46.6]),
  line(INK, 1.1, [21.4, 46.2, 21.4, 51]),
  line(INK, 1.1, [24, 47.6, 21.4, 49.3, 24, 51]),
  // A sweat drop.
  line(RAIN, 1.5, [49, 20.5, 47.6, 24.6, 49, 26, 50.4, 24.6, 49, 20.5]),
  line(RAIN, 2, ring(49, 24.6, 0.6)),
];

const BOW_TIE: Stroke[] = [
  line(INK, 3, [27.5, 47.3, 27.5, 50.7]),
  line(INK, 2.6, [28.6, 47.7, 30.6, 48.7]),
  line(INK, 2.6, [28.6, 50.3, 30.6, 49.3]),
  line(INK, 3, [36.5, 47.3, 36.5, 50.7]),
  line(INK, 2.6, [35.4, 47.7, 33.4, 48.7]),
  line(INK, 2.6, [35.4, 50.3, 33.4, 49.3]),
  line(INK, 2.4, ring(32, 49, 0.6)),
];

const MEDAL: Stroke[] = [
  line(RED, 1.8, [30, 50.8, 31, 52]),
  line(RED, 1.8, [34, 50.8, 33, 52]),
  line(GOLD, 4, ring(32, 54.4, 1.7)),
  line(GOLD_DARK, 0.8, ring(32, 54.4, 1.9)),
  line(GOLD_DARK, 0.8, ring(32, 54.4, 0.6)),
];

const SUIT: Stroke[] = [
  line(INK, 7, [7, 43, 14, 50, 21, 58]),
  line(INK, 7, [7, 50, 13, 58]),
  line(INK, 7, [57, 43, 50, 50, 43, 58]),
  line(INK, 7, [57, 50, 51, 58]),
];

// Short pieces along a curve from (16, 45) to (48, 45) that hangs down to y 53.
function chain(): Stroke[] {
  const pieces: Stroke[] = [];
  const at = (t: number) => [round((1 - t) ** 2 * 16 + 2 * (1 - t) * t * 32 + t * t * 48), round((1 - t) ** 2 * 45 + 2 * (1 - t) * t * 61 + t * t * 45)];
  for (let i = 0; i < 14; i++) {
    const [x1 = 0, y1 = 0] = at(i / 14);
    const [x2 = 0, y2 = 0] = at((i + 0.55) / 14);
    pieces.push(line(GOLD, 2.2, [x1, y1, x2, y2]));
  }
  return pieces;
}

const PENDANT: Stroke[] = [
  line(GOLD, 3.4, ring(32, 55.4, 1.3)),
  line(GOLD_DARK, 0.8, [33.1, 54, 31.3, 54, 31.3, 55.4, 32.7, 55.4, 32.7, 56.8, 30.9, 56.8]),
  line(GOLD_DARK, 0.6, [32, 53.3, 32, 57.5]),
];

const MONOCLE: Stroke[] = [line(GOLD, 1.3, ring(41, 36, 5)), line(GOLD, 0.7, [45.5, 38.5, 49, 47])];

const NONE: FundArt = { strokes: [], mouth: 'smile', headwear: null, cloud: false, fly: false, sparkles: false };

/** What a tier wears. `null` (normal, or hidden) wears nothing. */
export function fundArt(tier: FundTier | null): FundArt {
  switch (tier) {
    case 'broke':
      return { ...NONE, strokes: PATCHES, mouth: 'frown', cloud: true, fly: true };
    case 'debtor':
      return { ...NONE, strokes: IOU, mouth: 'flat' };
    case 'rich':
      return { ...NONE, strokes: [...BOW_TIE, ...MEDAL] };
    case 'generous':
      return { ...NONE, strokes: [...SUIT, ...BOW_TIE, ...MEDAL] };
    case 'tycoon':
      return { ...NONE, strokes: [...SUIT, ...BOW_TIE, ...chain(), ...PENDANT], headwear: 'tophat', sparkles: true };
    case 'billionaire':
      return { ...NONE, strokes: [...SUIT, ...BOW_TIE, ...chain(), ...PENDANT, ...MONOCLE], headwear: 'crown', sparkles: true };
    default:
      return NONE;
  }
}

/** The tier a user's character shows, or null. */
export function userFundTier(user: Pick<TeamUser, 'fund'>): FundTier | null {
  return shownTier(user.fund);
}

/** The team's users with their fund standing added, for drawing and for the detail card. */
export function withFund<T extends { username: string }>(users: T[], people: readonly FundPerson[] | null): (T & Pick<TeamUser, 'fund'>)[] {
  if (!people?.length) return users;
  const byUsername = new Map(people.map(({ username, ...rest }) => [username, rest]));
  return users.map((user) => {
    const fund = byUsername.get(user.username);
    return fund ? { ...user, fund } : user;
  });
}
