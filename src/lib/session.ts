// One browser login shared by status, account settings, and the map header.
import { useCallback, useEffect, useState } from 'react';
import type { AuthResult, TeamState } from '../../shared/types.ts';
import { api, ApiFailure, errorText } from './api.ts';
import { savedLogin } from './savedLogin.ts';
import { shouldDropSession } from './sessionRules.ts';

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
  const member = state?.users.find((u) => u.username === candidate?.username);
  const known = state ? Boolean(member) : null;
  // A release keeps the username on the roster, but invalidates its token.
  const claimed = member?.claimed ?? false;
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
    if (known === null) return;
    if (shouldDropSession(known)) {
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
        if (shouldDropSession(known, err instanceof ApiFailure ? err.status : undefined)) storeSession(null);
        else setError(errorText(err));
      });
    return () => {
      active = false;
    };
  }, [candidate, known, claimed, attempt]);
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

export type Session = ReturnType<typeof useSession>;
