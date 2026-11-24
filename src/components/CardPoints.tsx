// The part of a person's card that shows their reward points and what they have earned today and
// not claimed yet. On your own card it also has Claim, so you can claim from the map without
// opening the Reward points page; while you're still earning it asks, like that page, whether
// you're done for today.
import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { pointsText, type PointsMe, type PointsView } from '../../shared/points.ts';
import type { AuthResult, TeamUser } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { useMessage } from '../lib/hooks.ts';
import { claimPoints, claimWindowText } from '../lib/pointsClaim.ts';
import { theme } from '../styles/theme.ts';
import { Button } from '../styles/ui.ts';

const Box = styled.div`
  margin: 9px 0 0;
  padding: 8px 10px;
  border: ${theme.thinLine};
  border-radius: 12px;
  background: ${theme.hover};

  strong { font-size: 16px; white-space: nowrap; }
  p { margin: 4px 0 0; font-size: 14px; }
`;

const Waiting = styled.span`
  color: ${theme.inkSoft};
  font-weight: 700;
  white-space: nowrap;
`;

const Buttons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
`;

const Note = styled.p<{ $error: boolean }>`
  color: ${({ $error }) => ($error ? theme.error : theme.ink)};
  font-weight: 800;
`;

interface CardPointsProps {
  user: TeamUser;
  points: PointsView | null;
  /** The person logged in on this browser, who may claim on their own card. */
  login: AuthResult | null;
}

export function CardPoints({ user, points, login }: CardPointsProps) {
  const own = login?.username === user.username;
  const [me, setMe] = useState<PointsMe | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [message, showMessage] = useMessage(6000);

  // Your own day, read again whenever the board moves (someone moved, or time in the office counted).
  useEffect(() => {
    if (!own || !login) return;
    let live = true;
    api<PointsMe>('GET', '/api/points/me', undefined, { Authorization: `Bearer ${login.token}` })
      .then((next) => live && setMe(next))
      .catch(() => {}); // The board's numbers still show without it.
    return () => {
      live = false;
    };
  }, [own, login, points]);

  const line = points?.board.find((l) => l.username === user.username);
  // A rate and a penalty of 0 is how the admin turns points off.
  const off = points && !points.settings.perHour && !points.settings.missPenalty;
  if (!points || off || !line || !user.claimed) return null;
  const toClaim = own && me ? me.toClaim : line.toClaim;

  async function claim(goOff: boolean) {
    if (!login) return;
    setClaiming(true);
    const result = await claimPoints(login.token, goOff);
    if (result.me) setMe(result.me);
    showMessage(result.text, result.problem);
    setClaiming(false);
  }

  return (
    <Box>
      <strong>⭐ {pointsText(line.balance)}</strong>
      {toClaim > 0 && <Waiting> · +{toClaim} to claim</Waiting>}
      {own && me && toClaim > 0 && <p>{claimWindowText(me, points.resetAt)}</p>}
      {own && me?.claimOpen && toClaim > 0 && (
        <Buttons>
          {me.inOffice ? (
            <>
              <Button $small $primary type="button" disabled={claiming} onClick={() => void claim(false)}>
                Claim, still working
              </Button>
              <Button $small type="button" disabled={claiming} onClick={() => void claim(true)}>
                Claim and go Off
              </Button>
            </>
          ) : (
            <Button $small $primary type="button" disabled={claiming} onClick={() => void claim(false)}>
              Claim {pointsText(toClaim)}
            </Button>
          )}
        </Buttons>
      )}
      {message.text && (
        <Note $error={message.isError} role={message.isError ? 'alert' : 'status'}>
          {message.text}
        </Note>
      )}
      {own && (
        <p>
          <a href="/points">Reward points</a>
        </p>
      )}
    </Box>
  );
}
