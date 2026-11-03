import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import type { Place, TeamUser } from '../../shared/types.ts';
import { placeName } from '../lib/layout.ts';
import { theme } from '../styles/theme.ts';
import { Mochi } from './Mochi.tsx';

const GAP = 10;
const EDGE = 8;

const Card = styled.div`
  position: fixed;
  z-index: 50;
  width: 260px;
  padding: 14px 16px;
  border: ${theme.line};
  border-radius: 18px;
  background: ${theme.paper};
  box-shadow: 0 5px 0 ${theme.ink};
`;

const CardHead = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const CardAvatar = styled.div`
  flex: none;
  width: 52px;
  height: 52px;
`;

const CardName = styled.h3`
  font-size: 21px;
  overflow-wrap: anywhere;
`;

const CardUsername = styled.div`
  color: ${theme.inkSoft};
  font-weight: 700;
  overflow-wrap: anywhere;
`;

const CardRow = styled.p`
  margin: 9px 0 0;
`;

const CardStatus = styled(CardRow)`
  padding: 6px 10px;
  border-radius: 10px;
  background: ${theme.butter};
  overflow-wrap: anywhere;
`;

const CardTime = styled(CardRow)`
  color: ${theme.inkSoft};
  font-size: 13px;
`;

function formatUpdated(iso: string | null): string {
  if (!iso) return 'Not updated yet';
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = d.toDateString() === new Date().toDateString();
  return `Updated ${today ? 'today' : d.toLocaleDateString()} at ${time}`;
}

function place(card: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const { offsetWidth: w, offsetHeight: h } = card;
  let left = rect.right + GAP;
  if (left + w > innerWidth - EDGE) left = rect.left - w - GAP;
  left = Math.max(EDGE, Math.min(left, innerWidth - w - EDGE));
  const top = Math.max(EDGE, Math.min(rect.top + rect.height / 2 - h / 2, innerHeight - h - EDGE));
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

interface DetailCardProps {
  user: TeamUser;
  places: Place[];
  anchor: HTMLElement;
  onClose: () => void;
}

export function DetailCard({ user, places, anchor, onClose }: DetailCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (cardRef.current) place(cardRef.current, anchor);
  });

  // Follows the person while they glide or the 3D camera moves.
  useEffect(() => {
    let frame = requestAnimationFrame(function follow() {
      if (cardRef.current) place(cardRef.current, anchor);
      frame = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(frame);
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element;
      if (cardRef.current?.contains(target)) return;
      if (target.closest?.('[data-badge], [data-person-row]')) return; // These open a card themselves.
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [onClose]);

  return createPortal(
    <Card role="dialog" aria-label={user.nickname} ref={cardRef}>
      <CardHead>
        <CardAvatar>
          <Mochi user={user} />
        </CardAvatar>
        <div>
          <CardName>{user.nickname}</CardName>
          <CardUsername>@{user.username}</CardUsername>
        </div>
      </CardHead>
      <CardRow>{placeName(places, user.place)}</CardRow>
      {user.status && <CardStatus>{user.status}</CardStatus>}
      <CardTime>{user.claimed ? formatUpdated(user.updatedAt) : 'Nobody has claimed this username yet'}</CardTime>
    </Card>,
    document.body,
  );
}
