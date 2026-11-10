// One browser login shared by status, account settings, and the map header.
import { useCallback, useEffect, useState } from 'react';
import type { AuthResult, TeamState } from '../../shared/types.ts';
import { api, ApiFailure, errorText } from './api.ts';
import { savedLogin } from './savedLogin.ts';

// A blocked storage area should still allow login until this page is left.
let transient: AuthResult | null | undefined;
const readSession = () => (transient === undefined ? savedLogin() : transient);

export function storeSession(value: AuthResult | null) {
  try {
    if (value) localStorage.setItem('minimap.auth', JSON.stringify(value));
    else localStorage.removeItem('minimap.auth');
    transient = undefined;
  } catch {
    transient = value;
  }
  window.dispatchEvent(new Event('minimap-session'));
}

export function useSession(state: TeamState | null) {
  const [candidate, setCandidate] = useState(readSession);
  const [confirmed, setConfirmed] = useState<AuthResult | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const read = () => {
      const next = readSession();
      setCandidate((current) =>
        current?.token === next?.token && current?.username === next?.username ? current : next,
      );
    };
    window.addEventListener('storage', read);
    window.addEventListener('minimap-session', read);
    read();
    return () => {
      window.removeEventListener('storage', read);
      window.removeEventListener('minimap-session', read);
    };
  }, []);
  useEffect(() => {
    let active = true;
    setError('');
    if (!candidate) {
      setConfirmed(null);
      return;
    }
    if (!state) return;
    if (!state.users.some((u) => u.username === candidate.username)) {
      storeSession(null);
      return;
    }
    void api<{ username: string }>('GET', '/api/me', undefined, {
      Authorization: `Bearer ${candidate.token}`,
    })
      .then((result) => {
        if (!active) return;
        if (result.username === candidate.username) setConfirmed(candidate);
        else storeSession(null);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiFailure && err.status === 401) storeSession(null);
        else setError(errorText(err));
      });
    return () => {
      active = false;
    };
  }, [candidate, state, attempt]);
  const auth =
    candidate && confirmed?.token === candidate.token && confirmed.username === candidate.username
      ? candidate
      : null;
  return {
    auth,
    pending: Boolean(candidate && !auth && !error),
    error,
    retry: useCallback(() => setAttempt((n) => n + 1), []),
  };
}
