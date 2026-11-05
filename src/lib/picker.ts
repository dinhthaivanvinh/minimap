// The random member picker's claw machine. Choosing the winner and planning the
// animation are kept apart: the winner is picked once, fairly, before anything
// moves, and the claw's wandering only ever uses a separate source of randomness.
// Nothing here touches React or the DOM, so it can be tested on its own.
//
// Positions are in machine units: the glass is 100 wide and 75 tall, x grows to
// the right and y grows downwards. The page turns them into `cqw` lengths.

export const MACHINE_HEIGHT = 75;
/** Where the claw's cable hangs from. */
export const RAIL_Y = 3;
/** The floor that characters stand on, in the tray and in the chute. */
export const FLOOR_Y = 70;
/** The prize chute, on the left of the machine. */
export const CHUTE = { left: 2, right: 22, top: 44, x: 12 } as const;
/** Where characters can stand. */
export const TRAY = { left: 26, right: 97 } as const;
/** Larger pools are all still eligible, but only this many appear in the tray. */
export const MAX_SHOWN = 15;

const NAME_HEIGHT = 3.6;
/** Space above the claw's head, and between its open fingers and the back row. */
const CLAW_CLEARANCE = 7;
const MAX_SIZE = 14;
/** A character's height for its width; matches the Mochi art's viewBox. */
export const CHARACTER_ASPECT = 62 / 64;
/** The claw is this many times as wide as the characters it grabs. */
export const CLAW_SCALE = 1.5;
/** Where the claw holds a character, as a share of the claw's width below its top. */
export const CLAW_GRIP = 0.6;

export type Phase = 'idle' | 'loading' | 'searching' | 'grabbing' | 'lifting' | 'delivering' | 'revealing' | 'completed';
export const PHASES: readonly Phase[] = ['idle', 'loading', 'searching', 'grabbing', 'lifting', 'delivering', 'revealing', 'completed'];

/** Where the winner is: still in the tray, held by the claw, or dropped in the chute. */
export type PrizeAt = 'tray' | 'claw' | 'chute';

export interface Slot {
  x: number;
  /** The y of the character's feet. */
  foot: number;
  /** 0 is the front row. Front rows are drawn on top. */
  row: number;
}

export interface TrayLayout {
  /** Every character's width. */
  size: number;
  /** The distance between neighbours in a row, which name tags must fit in. */
  spacing: number;
  slots: Slot[];
}

/** One stretch of the animation: the claw glides to this state over `duration` milliseconds. */
export interface DrawStep {
  phase: Phase;
  x: number;
  /** The claw's grip point, where a held character's middle is. */
  y: number;
  open: boolean;
  prize: PrizeAt;
  duration: number;
  /** Falling eases in; everything else moves smoothly in and out. */
  ease: 'move' | 'drop';
}

export interface Draw<T> {
  /** Every eligible member, the winner included. */
  pool: readonly T[];
  winner: T;
  /** The characters in the tray, the winner among them. */
  shown: T[];
  /** Index of the winner in `shown`. */
  winnerSlot: number;
  layout: TrayLayout;
  steps: DrawStep[];
}

/** A random 32-bit unsigned integer from the browser's (or Node's) secure generator. */
export function secureUint32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/**
 * A uniformly random index below `count`. Values from the top of the 32-bit range
 * that would make some indexes slightly more likely than others are thrown away.
 */
export function pickIndex(count: number, nextUint32: () => number = secureUint32): number {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('Nothing to pick from');
  const limit = Math.floor(0x1_0000_0000 / count) * count;
  for (;;) {
    const value = nextUint32() >>> 0;
    if (value < limit) return value % count;
  }
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** The characters shown in the tray before a draw: the first ones in the pool. */
export function previewPool<T>(pool: readonly T[]): T[] {
  return pool.slice(0, MAX_SHOWN);
}

/** Lays characters out in up to three rows, bigger when there are fewer of them. */
export function trayLayout(count: number): TrayLayout {
  if (count < 1) return { size: MAX_SIZE, spacing: TRAY.right - TRAY.left, slots: [] };
  const rows = count <= 4 ? 1 : count <= 10 ? 2 : 3;
  const cols = Math.ceil(count / rows);
  const width = TRAY.right - TRAY.left;
  const dx = width / cols;
  // Small enough to fit across the tray, and for every row to stay below the travelling claw.
  const clear = FLOOR_Y - RAIL_Y - CLAW_CLEARANCE - (rows - 1) * NAME_HEIGHT;
  const tallest = clear / (rows * CHARACTER_ASPECT + CLAW_SCALE);
  const size = Math.min(MAX_SIZE, dx * 0.82, tallest);
  const rowStep = size * CHARACTER_ASPECT + NAME_HEIGHT;

  // As even as possible, with any extra characters in the front rows.
  const perRow = Array.from({ length: rows }, (_, row) => Math.floor(count / rows) + (row < count % rows ? 1 : 0));
  const slots: Slot[] = [];
  for (let row = rows - 1; row >= 0; row--) {
    const inRow = perRow[row] ?? 0;
    for (let i = 0; i < inRow; i++) {
      slots.push({ x: TRAY.left + width / 2 + (i - (inRow - 1) / 2) * dx, foot: FLOOR_Y - row * rowStep, row });
    }
  }
  return { size, spacing: dx, slots };
}

export function clawWidth(size: number): number {
  return size * CLAW_SCALE;
}

/** The grip height where the claw rests and travels, clear of every character. */
export function travelY(size: number): number {
  return RAIL_Y + 5 + clawWidth(size) * CLAW_GRIP;
}

/** The grip height where the claw waits between draws. */
export function homeY(size: number): number {
  return travelY(size) - 2;
}

/** Where the winner's feet are at a step, so it can glide along with the claw. */
export function prizeFoot(step: Pick<DrawStep, 'prize' | 'x' | 'y'>, slot: Slot, size: number): { x: number; foot: number } {
  if (step.prize === 'claw') return { x: step.x, foot: step.y + (size * CHARACTER_ASPECT) / 2 };
  if (step.prize === 'chute') return { x: CHUTE.x, foot: FLOOR_Y };
  return { x: slot.x, foot: slot.foot };
}

/** The resting state before and after draws. */
export function restingStep(size: number): DrawStep {
  return { phase: 'idle', x: CHUTE.x, y: homeY(size), open: true, prize: 'tray', duration: 0, ease: 'move' };
}

export function totalDuration(steps: readonly DrawStep[]): number {
  return steps.reduce((sum, step) => sum + step.duration, 0);
}

/**
 * Plans the claw's moves to collect the winner in `slot`. `random` only changes how
 * the claw looks around: which characters it hovers over and whether it fakes a grab.
 */
export function planSteps(layout: TrayLayout, winnerSlot: number, random: () => number = Math.random): DrawStep[] {
  const { size, slots } = layout;
  const target = slots[winnerSlot];
  if (!target) throw new RangeError('The winner is not in the tray');
  const top = travelY(size);
  const grip = target.foot - (size * CHARACTER_ASPECT) / 2;
  const steps: DrawStep[] = [];
  const add = (phase: Phase, x: number, y: number, duration: number, extra: Partial<DrawStep> = {}) => {
    const last = steps[steps.length - 1];
    steps.push({ phase, x, y, duration, open: true, prize: 'tray', ease: 'move', ...last && { open: last.open, prize: last.prize }, ...extra });
  };

  add('loading', CHUTE.x, homeY(size), 600, { open: true, prize: 'tray' });

  // Hover over two or three other characters first; empty spots when there's nobody else.
  const stops = 2 + Math.floor(random() * 2);
  const others = shuffled(slots.filter((_, i) => i !== winnerSlot), random).map((slot) => slot.x);
  while (others.length < stops) others.push(TRAY.left + 4 + random() * (TRAY.right - TRAY.left - 8));
  const fakeAt = stops === 2 ? Math.floor(random() * stops) : -1;
  for (const [i, x] of others.slice(0, stops).entries()) {
    add('searching', x, top, 450);
    if (i === fakeAt) {
      add('searching', x, top + 7, 250);
      add('searching', x, top, 250);
    } else {
      add('searching', x, top, 200);
    }
  }

  add('searching', target.x, top, 500);
  add('searching', target.x, top, 250);
  add('grabbing', target.x, grip, 600);
  add('grabbing', target.x, grip, 250, { open: false });
  add('lifting', target.x, top, 600, { prize: 'claw' });
  add('delivering', CHUTE.x, top, 800);
  add('delivering', CHUTE.x, top, 400, { open: true, prize: 'chute', ease: 'drop' });
  add('revealing', CHUTE.x, homeY(size), 600);
  add('completed', CHUTE.x, homeY(size), 0);
  return steps;
}

export interface DrawOptions {
  /** Picks the winner. Secure and unbiased by default. */
  nextUint32?: () => number;
  /** Only for the look of the draw: which characters are shown and where the claw wanders. */
  random?: () => number;
}

/** Picks a winner from the pool, then plans how the claw collects them. */
export function createDraw<T>(pool: readonly T[], { nextUint32 = secureUint32, random = Math.random }: DrawOptions = {}): Draw<T> {
  const winner = pool[pickIndex(pool.length, nextUint32)]!;

  // A big pool shows the winner among a random handful, so the tray gives nothing away.
  let shown: T[];
  if (pool.length <= MAX_SHOWN) {
    shown = [...pool];
  } else {
    const others = shuffled(pool.filter((member) => member !== winner), random).slice(0, MAX_SHOWN - 1);
    shown = shuffled([...others, winner], random);
  }

  const winnerSlot = shown.indexOf(winner);
  const layout = trayLayout(shown.length);
  return { pool, winner, shown, winnerSlot, layout, steps: planSteps(layout, winnerSlot, random) };
}

export interface ConfettiPiece {
  /** Across the reveal card, 0 to 100. */
  left: number;
  delay: number;
  duration: number;
  /** How far it drifts sideways while it falls, in px. */
  drift: number;
  spin: number;
  color: string;
}

const CONFETTI_COLORS = ['#ff9cc2', '#ffe27a', '#bdf0d2', '#8fc9ff', '#b7a6ff', '#ff7b9c'];

export function confetti(count: number, random: () => number = Math.random): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    left: random() * 100,
    delay: random() * 400,
    duration: 1200 + random() * 900,
    drift: (random() - 0.5) * 120,
    spin: (random() < 0.5 ? -1 : 1) * (360 + random() * 540),
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
  }));
}
