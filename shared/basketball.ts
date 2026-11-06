export const ROUND_MS = 60_000;
export const SHOT_GAP = 450;
export const AIM_PERIOD = 2400;
export interface Round {
  ticket: string;
  seed: number;
}
export interface Result {
  score: number;
  streak: number;
  made: number;
  attempts: number;
  hit: boolean;
}
export interface RecordScore {
  username: string;
  score: number;
  at: string;
}
export interface BasketballRecords {
  allTime: RecordScore[];
  weekly: RecordScore[];
  week: string;
}
export function weekKey(at: Date): string {
  const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}
export function aimAt(ms: number, seed: number): number {
  const phase = ((ms + seed) % AIM_PERIOD) / (AIM_PERIOD / 2);
  return phase <= 1 ? phase : 2 - phase;
}
export function targetWidth(streak: number): number {
  return Math.max(0.18, 0.34 - streak * 0.016);
}
function basketPoints(streak: number): number {
  return 2 + Math.min(5, Math.floor(streak / 3));
}
// Random targets can move between shots, so cadence provides the safe score bound.
const MAX_BASKETS = Math.ceil(ROUND_MS / SHOT_GAP);
export const MAX_ROUND_SCORE = Array.from({ length: MAX_BASKETS }, (_, i) => basketPoints(i + 1)).reduce(
  (sum, points) => sum + points,
  0,
);

/** A seeded target for each attempt, shared by the display and server replay. */
export function targetCenter(seed: number, attempt: number): number {
  let center = 0.5;
  for (let index = 0; index <= attempt; index++) {
    let value = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
    value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
    value = (value ^ (value >>> 15)) >>> 0;
    let next = 0.2 + (value / 0x100000000) * 0.6;
    // Avoid a "new" zone that appears to stay in the same place.
    if (index > 0 && Math.abs(next - center) < 0.14) next += next < 0.5 ? 0.3 : -0.3;
    center = next;
  }
  return center;
}

export function shoot(previous: Result, ms: number, seed: number): Result {
  const hit =
    Math.abs(aimAt(ms, seed) - targetCenter(seed, previous.attempts)) <= targetWidth(previous.streak) / 2;
  const streak = hit ? previous.streak + 1 : 0;
  return {
    hit,
    attempts: previous.attempts + 1,
    streak,
    made: previous.made + Number(hit),
    score: previous.score + (hit ? basketPoints(streak) : 0),
  };
}
export const EMPTY_RESULT: Result = { score: 0, streak: 0, made: 0, attempts: 0, hit: false };
export function replay(shots: unknown, seed: number): Result {
  if (!Array.isArray(shots) || shots.length > Math.ceil(ROUND_MS / SHOT_GAP))
    throw new Error('Invalid shot list.');
  let last = -SHOT_GAP;
  let result = EMPTY_RESULT;
  for (const ms of shots) {
    if (!Number.isInteger(ms) || ms < 0 || ms >= ROUND_MS || ms - last < SHOT_GAP)
      throw new Error('Invalid shot timing.');
    result = shoot(result, ms, seed);
    last = ms;
  }
  return result;
}
export function rank(records: RecordScore[]): RecordScore[] {
  return [...records].sort(
    (a, b) => b.score - a.score || a.at.localeCompare(b.at) || a.username.localeCompare(b.username),
  );
}
