import { useId, type ReactNode } from 'react';
import styled from 'styled-components';
import type { Accessory } from '../../shared/look.ts';
import type { TeamUser } from '../../shared/types.ts';
import { strokePath } from '../lib/drawing.ts';
import { lookFor, type Look } from '../lib/look.ts';
import { MUSTACHE_SMILE_DROP, wornStrokes } from '../lib/wornItems.ts';
import { theme } from '../styles/theme.ts';

const INK = theme.ink;

export const MochiSvg = styled.svg`
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
`;

export const DeskSvg = styled.svg`
  position: absolute;
  left: 50%;
  bottom: -12px;
  width: 66px;
  height: 22px;
  transform: translateX(-50%);
`;

const ACCESSORY_ART: Record<Accessory, ReactNode> = {
  sprout: (
    <>
      <path d="M32 15V6" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d="M32 8c-2-5-8-6-12-4 1 5 7 8 12 4Zm0 0c2-5 8-6 12-4-1 5-7 8-12 4Z" fill="#7ad67f" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
    </>
  ),
  ears: <path d="M16 22 13 6l14 9ZM48 22l3-16-14 9Z" fill="currentColor" stroke={INK} strokeWidth="3" strokeLinejoin="round" />,
  antenna: (
    <>
      <path d="M32 14V6" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="5" r="4" fill="#ff7b9c" stroke={INK} strokeWidth="2.5" />
    </>
  ),
  bow: <path d="M42 15 32 9l1 9 9 2 9 3-1-11Z" transform="translate(4 -2)" fill="#ff6f9f" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />,
  party: (
    <>
      <path d="M23 15 32 0l9 15Z" fill="#ffe27a" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="32" cy="9" r="1.8" fill="#ff6f9f" />
    </>
  ),
  headphones: (
    <>
      <path d="M11 36C9 16 22 10 32 10s23 6 21 26" fill="none" stroke={INK} strokeWidth="4" />
      <rect x="5" y="30" width="9" height="15" rx="4" fill="#ff6f9f" stroke={INK} strokeWidth="2.5" />
      <rect x="50" y="30" width="9" height="15" rx="4" fill="#ff6f9f" stroke={INK} strokeWidth="2.5" />
    </>
  ),
};

// These sit behind the head; the others sit on top of it.
const BEHIND_HEAD = new Set<Accessory>(['ears', 'party']);

const HAT = (
  <>
    <rect x="18" y="1" width="28" height="13" rx="2" fill={INK} />
    <rect x="18" y="9" width="28" height="4" fill="#ff6f9f" />
    <ellipse cx="32" cy="14" rx="21" ry="3" fill={INK} />
  </>
);

const BODY_PATH = 'M32 13c15 0 24 13 24 27 0 12-10 18-24 18S8 52 8 40c0-14 9-27 24-27Z';

/** The character's shapes, for placing inside an SVG. */
export function MochiArt({ look }: { look: Pick<Look, 'color' | 'accessory' | 'wearing' | 'strokes'> }) {
  const { color, accessory, wearing, strokes } = look;
  const hasHat = wearing.includes('hat');
  const art = hasHat ? null : ACCESSORY_ART[accessory]; // A hat takes the place of the automatic accessory.
  const behind = BEHIND_HEAD.has(accessory);
  const clipId = useId();
  return (
    <g style={{ color }}>
      {behind && art}
      <path d={BODY_PATH} fill={color} stroke={INK} strokeWidth="3" />
      <circle cx="23" cy="36" r="3.3" fill={INK} />
      <circle cx="41" cy="36" r="3.3" fill={INK} />
      <path
        d={`M28 ${wearing.includes('mustache') ? 41 + MUSTACHE_SMILE_DROP : 41}q4 4 8 0`}
        fill="none"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <ellipse cx="16.5" cy="43" rx="4" ry="2.6" fill="#ff7b9c" opacity=".55" />
      <ellipse cx="47.5" cy="43" rx="4" ry="2.6" fill="#ff7b9c" opacity=".55" />
      {strokes.length > 0 && (
        <>
          <clipPath id={clipId}>
            <path d={BODY_PATH} />
          </clipPath>
          <g clipPath={`url(#${clipId})`}>
            {strokes.map((stroke, i) => (
              <path
                key={i}
                d={strokePath(stroke)}
                fill="none"
                stroke={stroke.color}
                strokeWidth={stroke.width}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>
        </>
      )}
      {wornStrokes(wearing).map((stroke, i) => (
        <path
          key={i}
          d={strokePath(stroke)}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {!behind && art}
      {hasHat && HAT}
    </g>
  );
}

export function Mochi({ user }: { user: Pick<TeamUser, 'username' | 'look'> }) {
  return (
    <MochiSvg viewBox="0 0 64 62" aria-hidden="true">
      <MochiArt look={lookFor(user.username, user.look)} />
    </MochiSvg>
  );
}

export function Desk() {
  return (
    <DeskSvg viewBox="0 0 66 22" aria-hidden="true">
      <rect x="2" y="9" width="62" height="11" rx="4" fill="#ffd9a0" stroke={INK} strokeWidth="2.5" />
      <rect x="46" y="1" width="15" height="10" rx="2" fill="#dfe3ff" stroke={INK} strokeWidth="2.5" />
    </DeskSvg>
  );
}
