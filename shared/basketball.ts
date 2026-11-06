export const ROUND_MS = 60_000;
export const SHOT_GAP = 450;
export const AIM_PERIOD = 1200;
export interface Round {
  ticket: string;
  seed: number;
}
export interface Result {
  score: number;
  streak: number;
  made: number;
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
  return Math.max(0.08, 0.24 - streak * 0.022);
}
function basketPoints(streak: number): number {
  return 2 + Math.min(5, Math.floor(streak / 3));
}
// At most one basket fits in each crossing window (144ms wide, 450ms recharge).
// A round may catch both boundary windows as well as the intervening crossings.
const MAX_BASKETS = Math.ceil(ROUND_MS / (AIM_PERIOD / 2)) + 1;
export const MAX_ROUND_SCORE = Array.from({ length: MAX_BASKETS }, (_, i) => basketPoints(i + 1)).reduce(
  (sum, points) => sum + points,
  0,
);

export function shoot(previous: Result, ms: number, seed: number): Result {
  const hit = Math.abs(aimAt(ms, seed) - 0.5) <= targetWidth(previous.streak) / 2;
  const streak = hit ? previous.streak + 1 : 0;
  return {
    hit,
    streak,
    made: previous.made + Number(hit),
    score: previous.score + (hit ? basketPoints(streak) : 0),
  };
}
export const EMPTY_RESULT: Result = { score: 0, streak: 0, made: 0, hit: false };
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
