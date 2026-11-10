import type { CSSProperties } from 'react';
import styled from 'styled-components';

export const ArcadePlay = styled.button`
  display: block;
  min-width: 40px;
  min-height: 28px;
  padding: 3px 8px;
  border: 2px solid #2a2657;
  border-radius: 6px;
  background: #a5ebce;
  color: #2a2657;
  font: 900 10px/1.2 sans-serif;
  text-transform: uppercase;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 2px 0 #2a2657;
  &:hover {
    background: #ffe39b;
  }
  &:focus-visible {
    outline: 3px solid #ff6f9f;
    outline-offset: 3px;
  }
`;
export const Cabinet = styled.button`
  position: absolute;
  z-index: 2;
  padding: 0;
  border: 0;
  background: transparent;
  transform: translate(-50%, -100%);
  cursor: pointer;
  width: clamp(44px, var(--cabinet-width), 64px);
  aspect-ratio: 100 / 160;
  &::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: max(100%, 44px);
    height: max(100%, 44px);
    transform: translate(-50%, -50%);
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  &:hover {
    filter: brightness(1.06);
  }
  &:focus-visible {
    outline: 3px solid #2a2657;
    outline-offset: 4px;
    border-radius: 8px;
  }
`;
export function ArcadeCabinet2D({
  x,
  y,
  width,
  onPlay,
}: {
  x: string;
  y: string;
  width: number;
  onPlay: (trigger: HTMLElement) => void;
}) {
  return (
    <Cabinet
      data-arcade-cabinet="2d"
      data-arcade-play
      aria-label="Open basketball arcade"
      aria-haspopup="dialog"
      style={{ left: x, top: y, '--cabinet-width': `${width}px` } as CSSProperties}
      onClick={(event) => onPlay(event.currentTarget)}
    >
      <svg viewBox="0 0 100 160" aria-hidden="true">
        <ellipse cx="52" cy="153" rx="47" ry="7" fill="#2a2657" opacity=".22" />
        <path d="m9 139 65-5 20 12-66 10-19-10z" fill="#a4b4bf" stroke="#2a2657" strokeWidth="2" />
        <path
          d="M23 8 77 4l15 12v127l-16 9-53-8z"
          fill="#7c70ae"
          stroke="#2a2657"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="m77 4 15 12v127l-16 9-5-53 10-20-4-11z" fill="#645991" stroke="#2a2657" strokeWidth="3" />
        <path
          d="M12 18h63v20l-7 39 14 12-6 63-64-8V91l9-13-9-41z"
          fill="#ff9cc2"
          stroke="#2a2657"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <rect x="17" y="20" width="53" height="15" rx="3" fill="#a5ebce" stroke="#2a2657" strokeWidth="2" />
        <path
          d="m27 24 2 4-2 4m31-8-2 4 2 4M37 28h12"
          fill="none"
          stroke="#fff4d0"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="m19 42 51-1-5 35H24z" fill="#293355" stroke="#2a2657" strokeWidth="3" />
        <path d="m25 47 39-1-4 25H29z" fill="#193f50" />
        <path d="M36 49h18v13H36z" fill="#ddf8e9" />
        <path d="M42 56h7v6h-7z" fill="none" stroke="#f58a55" strokeWidth="1.4" />
        <ellipse cx="45" cy="63" rx="10" ry="2" fill="none" stroke="#ff9b62" strokeWidth="2" />
        <path d="m36 65 3 6h12l3-6" fill="none" stroke="#fff4d0" />
        <path d="m21 78 47-1 14 12-70 2z" fill="#b4a5d9" stroke="#2a2657" strokeWidth="2.5" />
        <path d="M28 84v-9" stroke="#2a2657" strokeWidth="3" />
        <circle cx="28" cy="74" r="4.5" fill="#ff6f9f" stroke="#2a2657" strokeWidth="2" />
        <ellipse cx="57" cy="83" rx="4" ry="2.5" fill="#ffe39b" stroke="#2a2657" strokeWidth="1.5" />
        <ellipse cx="68" cy="85" rx="4" ry="2.5" fill="#a5ebce" stroke="#2a2657" strokeWidth="1.5" />
        <rect x="20" y="97" width="47" height="19" rx="5" fill="#a5ebce" stroke="#2a2657" strokeWidth="2" />
        <text
          x="43.5"
          y="110"
          textAnchor="middle"
          fontFamily="sans-serif"
          fontSize="11"
          fontWeight="900"
          fill="#2a2657"
        >
          PLAY
        </text>
        <rect x="35" y="124" width="16" height="10" rx="2" fill="#51486f" />
        <path d="M40 126v5m6-5v5" stroke="#b4a5d9" strokeWidth="2" />
        <path d="M17 138h48" stroke="#cc6b9b" strokeWidth="3" />
      </svg>
    </Cabinet>
  );
}
