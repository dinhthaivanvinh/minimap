// The lobby's notice board on the 2D map: a cork board with a paper note for each open
// vote (lib/noticeBoard.ts). A note opens its vote, and the board opens the /vote page.
import type { CSSProperties } from 'react';
import styled, { css, keyframes } from 'styled-components';
import type { VoteView } from '../../shared/vote.ts';
import { useNow } from '../lib/hooks.ts';
import type { Rect } from '../lib/layout.ts';
import { boardNotes, voteLink } from '../lib/noticeBoard.ts';
import { media, theme } from '../styles/theme.ts';

const NOTE_COLOURS = ['#fff4b8', '#c9f2dc', '#ffd6e6', '#ffffff'];

/** The 3D board's link for keyboards and screen readers: a little pinned note under the board. */
export const NoticeBoardLink = styled.a`
  position: relative;
  display: block;
  min-width: 44px;
  min-height: 28px;
  padding: 5px 10px 3px;
  border: 2px solid ${theme.ink};
  border-radius: 4px;
  background: ${NOTE_COLOURS[0]};
  box-shadow: 0 2px 0 rgb(42 38 87 / .35);
  font: 800 12px/1.2 ${theme.displayFont};
  text-align: center;
  text-decoration: none;
  transform: rotate(-2deg);
  pointer-events: auto;

  /* The pin. */
  &::before {
    content: '';
    position: absolute;
    top: -4px;
    left: 50%;
    width: 8px;
    height: 8px;
    margin-left: -4px;
    border: 1.5px solid ${theme.ink};
    border-radius: 50%;
    background: ${theme.bubblegum};
  }

  &:hover { background: ${theme.butter}; }
  &:focus-visible { outline: 3px solid ${theme.focus}; outline-offset: 3px; }
`;

const pulse = keyframes`
  0%, 100% { transform: rotate(var(--tilt)) scale(1); }
  50% { transform: rotate(var(--tilt)) scale(1.07); }
`;

const Box = styled.div`
  position: absolute;
  z-index: 1;
  /* Note sizes follow the board's width, so they scale with the map. */
  container-type: size;
`;

const Frame = styled.svg`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
`;

const BoardLink = styled.a`
  position: absolute;
  inset: 0;
  border-radius: 6%;

  &:hover { background: rgb(255 255 255 / .15); }
`;

const Notes = styled.ul`
  position: absolute;
  inset: 11% 9% 15%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: minmax(0, 1fr);
  gap: 5cqw;
  margin: 0;
  padding: 0;
  list-style: none;
  pointer-events: none;
`;

const Note = styled.a<{ $urgent: boolean }>`
  --tilt: 0deg;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  padding: 3cqw 3.5cqw 2.5cqw;
  border: max(1px, 1.2cqw) solid ${theme.ink};
  border-radius: 2cqw;
  font-family: ${theme.displayFont};
  font-size: 7.4cqw;
  font-weight: 800;
  line-height: 1.05;
  text-decoration: none;
  overflow: hidden;
  pointer-events: auto;
  transform: rotate(var(--tilt));
  box-shadow: 0 1cqw 0 rgb(42 38 87 / .35);

  &:hover { filter: brightness(1.05); z-index: 1; }

  /* The pin. */
  &::before {
    content: '';
    position: absolute;
    top: 1.5cqw;
    left: 50%;
    width: 4cqw;
    height: 4cqw;
    margin-left: -2cqw;
    border-radius: 50%;
    background: ${theme.bubblegum};
  }

  ${({ $urgent }) => $urgent && css`
    background: #ff8a8a !important;
    animation: ${pulse} 1.8s ease-in-out infinite;

    ${media.reducedMotion} { animation: none; }
  `}
`;

const NoteTitle = styled.span`
  display: -webkit-box;
  margin-top: 2cqw;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
`;

const NoteTime = styled.span`
  font-size: 6.4cqw;
  font-weight: 700;
`;

const More = styled.span`
  position: absolute;
  right: 4%;
  bottom: 4%;
  padding: 0 3cqw;
  border: max(1px, 1cqw) solid ${theme.ink};
  border-radius: 4cqw;
  background: ${theme.butter};
  font: 800 7cqw/1.3 ${theme.displayFont};
  pointer-events: none;
`;

export function NoticeBoard2D({ spot, width, height, votes }: { spot: Rect; width: number; height: number; votes: VoteView[] }) {
  const now = useNow(30_000);
  const { notes, more } = boardNotes(votes, now);
  const style: CSSProperties = {
    left: `${(spot.x / width) * 100}%`,
    top: `${(spot.y / height) * 100}%`,
    width: `${(spot.w / width) * 100}%`,
    height: `${(spot.h / height) * 100}%`,
  };
  const label = notes.length ? `Notice board: ${notes.length + more} open votes` : 'Notice board: no open votes';
  return (
    <Box data-notice-board="2d" style={style}>
      <Frame viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <rect x="10" y="88" width="5" height="12" fill="#a8774f" stroke={theme.ink} strokeWidth="1.5" />
        <rect x="85" y="88" width="5" height="12" fill="#a8774f" stroke={theme.ink} strokeWidth="1.5" />
        <rect x="2" y="2" width="96" height="88" rx="6" fill="#c99467" stroke={theme.ink} strokeWidth="2.5" />
        <rect x="8" y="8" width="84" height="76" rx="3" fill="#e9b97f" stroke={theme.ink} strokeWidth="1.2" />
        <path d="M20 20h.1M45 35h.1M70 18h.1M30 60h.1M62 70h.1M82 50h.1M15 78h.1" stroke="#c48e55" strokeWidth="2.4" strokeLinecap="round" />
      </Frame>
      <BoardLink href="/vote" aria-label={`${label}. Open team votes`} />
      <Notes>
        {notes.map((note, i) => (
          <li key={note.id}>
            <Note
              href={voteLink(note.id)}
              $urgent={note.urgent}
              aria-label={`${note.title}, ${note.left} left`}
              style={{ background: NOTE_COLOURS[i % NOTE_COLOURS.length], '--tilt': `${(i % 2 ? 2.5 : -2) * (i > 1 ? -1 : 1)}deg` } as CSSProperties}
            >
              <NoteTitle>{note.title}</NoteTitle>
              <NoteTime>{note.left}</NoteTime>
            </Note>
          </li>
        ))}
        {!notes.length && (
          <li style={{ gridColumn: '1 / -1' }}>
            <Note href="/vote" $urgent={false} style={{ background: NOTE_COLOURS[3] }}>
              <NoteTitle>No open votes.</NoteTitle>
              <NoteTime>Start one</NoteTime>
            </Note>
          </li>
        )}
      </Notes>
      {more > 0 && <More aria-hidden="true">+{more}</More>}
    </Box>
  );
}
