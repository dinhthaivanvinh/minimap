// Shown for a moment after someone votes: a paper slip folds and drops into a small ballot
// box. Plain CSS and SVG, so it looks the same everywhere. With less motion asked for, it
// just shows the end: the box with the vote in it.
import styled, { keyframes } from 'styled-components';
import { media, theme } from '../styles/theme.ts';

export const BALLOT_DROP_MS = 1800;

const fold = keyframes`
  0% { transform: translateY(-14px) scaleY(1); }
  35% { transform: translateY(-14px) scaleY(.5); }
  45% { transform: translateY(-16px) scaleY(.5); opacity: 1; }
  80%, 100% { transform: translateY(22px) scaleY(.5); opacity: 0; }
`;

const settle = keyframes`
  0%, 70% { transform: translateY(0); }
  80% { transform: translateY(3px); }
  100% { transform: translateY(0); }
`;

const Wrap = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: ${theme.displayFont};
  font-size: 18px;
  font-weight: 800;

  svg { flex: none; width: 64px; height: 64px; overflow: visible; }

  .slip {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: ${fold} 1.2s ease-in forwards;
  }

  .box { animation: ${settle} 1.2s ease-out; }

  ${media.reducedMotion} {
    .slip { animation: none; opacity: 0; }
    .box { animation: none; }
  }
`;

export function BallotDrop() {
  return (
    <Wrap role="status">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <g className="slip">
          <rect x="20" y="2" width="24" height="28" rx="2" fill="#fff" stroke={theme.ink} strokeWidth="2.5" />
          <path d="M25 12l4 4 8-8" fill="none" stroke={theme.bubblegum} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M25 22h14" stroke={theme.inkSoft} strokeWidth="2" strokeLinecap="round" />
        </g>
        <g className="box">
          <path d="M8 30h48l-4 30H12z" fill={theme.butter} stroke={theme.ink} strokeWidth="3" strokeLinejoin="round" />
          <path d="M6 26h52v6H6z" fill="#ffd34d" stroke={theme.ink} strokeWidth="3" strokeLinejoin="round" />
          <path d="M22 29h20" stroke={theme.ink} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M26 44h12" stroke={theme.ink} strokeWidth="2.5" strokeLinecap="round" />
        </g>
      </svg>
      Your vote is in.
    </Wrap>
  );
}
