// What this browser remembers for voting: the login saved by My status (`minimap.auth`,
// in localStorage) and the admin password saved by the Admin page (`minimap.admin`, in
// sessionStorage, so only in that tab). Storage can be blocked, and its contents can be
// anything, so both read safely and give nothing when in doubt.
import type { AuthResult } from '../../shared/types.ts';

export function savedLogin(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): AuthResult | null {
  try {
    const value: unknown = JSON.parse(storage?.getItem('minimap.auth') ?? 'null');
    if (typeof value !== 'object' || value === null) return null;
    const { token, username } = value as Record<string, unknown>;
    return typeof token === 'string' && token && typeof username === 'string' && username ? { token, username } : null;
  } catch {
    return null;
  }
}

export function savedAdminPassword(storage: Pick<Storage, 'getItem'> | undefined = globalThis.sessionStorage): string {
  try {
    return storage?.getItem('minimap.admin') ?? '';
  } catch {
    return '';
  }
}
