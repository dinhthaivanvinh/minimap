// The part of a person's card that says it is their birthday or work anniversary today, who has
// sent wishes, and a button for teammates who are logged in to send their own.
import { useState } from 'react';
import styled from 'styled-components';
import { todayText, type CelebrateView } from '../../shared/celebrate.ts';
import type { AuthResult, TeamUser } from '../../shared/types.ts';
import { api, errorText } from '../lib/api.ts';
import { theme } from '../styles/theme.ts';
import { Button } from '../styles/ui.ts';

const Box = styled.div`
  margin: 9px 0 0;
  padding: 8px 10px;
  border: ${theme.thinLine};
  border-radius: 12px;
  background: #ffe1ea;

  strong { display: block; }
  p { margin: 4px 0 0; font-size: 14px; overflow-wrap: anywhere; }
  button { margin-top: 8px; }
`;

const Problem = styled.p`
  color: ${theme.error};
  font-weight: 800;
`;

interface CardPartyProps {
  user: TeamUser;
  users: TeamUser[];
  celebrate: CelebrateView | null;
  login: AuthResult | null;
}

export function CardParty({ user, users, celebrate, login }: CardPartyProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const today = celebrate?.celebrations.filter((c) => c.days === 0 && c.username === user.username) ?? [];
  if (!today.length) return null;

  const wishes = [...new Set(today.flatMap((c) => c.wishes))];
  const nickname = (name: string) => users.find((u) => u.username === name)?.nickname || name;
  const sent = Boolean(login && wishes.includes(login.username));
  const canWish = login && login.username !== user.username;

  async function wish() {
    if (!login) return;
    setSending(true);
    setError('');
    try {
      // The live update brings the new wish, and with it the confetti.
      await api('POST', '/api/celebrate/wish', { to: user.username }, { Authorization: `Bearer ${login.token}` });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Box>
      {today.map((c) => (
        <strong key={c.kind}>
          {c.kind === 'birthday' ? '🎂' : '🎉'} {todayText(c)}
        </strong>
      ))}
      {wishes.length > 0 && <p>Wishes from {wishes.map(nickname).join(', ')}</p>}
      {canWish && (
        <Button $small type="button" disabled={sending || sent} onClick={() => void wish()}>
          {sent ? 'Wishes sent ✓' : 'Send wishes 🎉'}
        </Button>
      )}
      {!login && <p>Log in on <a href="/me">Update status</a> to send wishes.</p>}
      {error && <Problem role="alert">{error}</Problem>}
    </Box>
  );
}
