// Claiming reward points from the browser, shared by the Reward points page and a person's card on
// the map: the claim itself (with going Off when someone is done for the day), and the words for
// when Claim works.
import { pointsText, type PointsClaim, type PointsMe } from '../../shared/points.ts';
import { api, errorText } from './api.ts';

type Request = <T>(method: string, url: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;

export interface ClaimResult {
  /** Your day after the claim, or null when the claim failed. */
  me: PointsMe | null;
  text: string;
  problem: boolean;
}

/**
 * Claims everything waiting, then sets you to Off when asked. Never throws: a failure comes back
 * as a message, and a claim that worked is reported even when going Off then fails.
 */
export async function claimPoints(token: string, goOff: boolean, request: Request = api): Promise<ClaimResult> {
  const headers = { Authorization: `Bearer ${token}` };
  let result: PointsClaim;
  try {
    result = await request<PointsClaim>('POST', '/api/points/claim', {}, headers);
  } catch (err) {
    return { me: null, text: errorText(err), problem: true };
  }
  const { claimed, ...me } = result;
  const done = `Claimed ${pointsText(claimed)}.`;
  if (!goOff) return { me, text: `${done} Keep it up!`, problem: false };
  try {
    await request('PATCH', '/api/me', { place: 'off' }, headers);
  } catch (err) {
    return { me, text: `${done} But you’re still checked in: ${errorText(err)}`, problem: true };
  }
  // Off is not an earning office, so the time has stopped counting.
  return { me: { ...me, inOffice: false }, text: `${done} You’re Off now. See you tomorrow!`, problem: false };
}

/** When Claim works for you now: open until a time, opening later today, or closed until the reset. */
export function claimWindowText(me: Pick<PointsMe, 'claimOpen' | 'window'>, resetAt: string): string {
  if (!me.window) return `Claiming is closed for today, so these are lost at ${resetAt}.`;
  return me.claimOpen ? `You can claim until ${me.window.to}.` : `Claiming opens at ${me.window.from}.`;
}
