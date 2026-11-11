// A character starts from its username, so it stays the same until someone decorates it.
import type { CelebrationKind } from '../../shared/celebrate.ts';
import type { FundTier } from '../../shared/fund.ts';
import { ACCESSORIES, type Accessory, type CharacterDesign } from '../../shared/look.ts';

export const DEFAULT_COLORS = ['#ff9cc2', '#ffc46b', '#ffe27a', '#9fe89a', '#7fe0d6', '#8fc9ff', '#b7a6ff', '#f5a6f0'] as const;

export interface Look extends CharacterDesign {
  accessory: Accessory;
  /** Offsets the idle animation so people don't all bob together. */
  phase: number;
  /** The fund look to wear over everything else, or null for none (see fundLook.ts). */
  fund: FundTier | null;
  /** A birthday or work anniversary today: a party hat and a balloon (see celebrateLook.ts). */
  party: CelebrationKind | null;
}

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text.toLowerCase()) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function defaultDesign(username: string): CharacterDesign {
  return { color: DEFAULT_COLORS[hash(username) % DEFAULT_COLORS.length] ?? DEFAULT_COLORS[0], wearing: [], strokes: [] };
}

export function lookFor(username: string, design?: CharacterDesign | null, fund: FundTier | null = null, party: CelebrationKind | null = null): Look {
  const h = hash(username);
  return {
    ...(design ?? defaultDesign(username)),
    accessory: ACCESSORIES[(h >>> 8) % ACCESSORIES.length] ?? ACCESSORIES[0],
    phase: (h >>> 16) % 7,
    fund,
    party,
  };
}

export const SHORT_STATUS = 14;

export function statusKind(status: string): 'none' | 'short' | 'long' {
  if (!status) return 'none';
  return [...status].length <= SHORT_STATUS ? 'short' : 'long';
}
