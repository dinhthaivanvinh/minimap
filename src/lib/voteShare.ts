// Sharing one vote by its address: the full link to send someone, and passing it to the
// phone's share sheet or the clipboard. Kept apart from React so it can be tested.
import { voteLink } from './noticeBoard.ts';

/**
 * The full address of one vote. The team address the admin set wins, because the address
 * this browser uses (localhost, a LAN name) may not open on someone else's device.
 */
export function shareLink(id: string, publicUrl: string, origin: string): string {
  let base = origin;
  try {
    if (publicUrl) base = new URL(publicUrl).origin;
  } catch {} // The server checks the team address, so this only guards against an old value.
  return new URL(voteLink(id), base).href;
}

/** The parts of `navigator` that sharing uses, so tests can pretend. */
export interface ShareTools {
  share?: (data: { title: string; text?: string; url: string }) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

/**
 * - `shared`: the share sheet sent it.
 * - `copied`: the link is on the clipboard.
 * - `cancelled`: the person closed the share sheet.
 * - `failed`: neither works here (a plain http:// address has no clipboard), so show the link.
 */
export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Opens the share sheet where there is one, and copies the link otherwise. */
export async function shareVote(title: string, url: string, tools: ShareTools): Promise<ShareResult> {
  if (tools.share) {
    try {
      await tools.share({ title, text: `Vote: ${title}`, url });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
      // Some browsers have a share sheet but refuse to open it. Try the clipboard instead.
    }
  }
  try {
    if (!tools.clipboard) return 'failed';
    await tools.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
