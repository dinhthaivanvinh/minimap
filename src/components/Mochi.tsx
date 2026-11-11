import { useId, type ReactNode } from 'react';
import styled from 'styled-components';
import type { CelebrationKind } from '../../shared/celebrate.ts';
import type { Accessory } from '../../shared/look.ts';
import type { TeamUser } from '../../shared/types.ts';
import { BALLOON, PARTY_DOTS, PARTY_HAT } from '../lib/celebrateLook.ts';
import { strokePath } from '../lib/drawing.ts';
import { CLOUD, fundArt, GOLD, GOLD_DARK, RAIN, userFundTier } from '../lib/fundLook.ts';
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

// The fund's top hat: taller than the everyday hat, with a gold band.
const TOP_HAT = (
  <>
    <rect x="20" y="-5" width="24" height="18" rx="1.5" fill={INK} />
    <rect x="20" y="7" width="24" height="3.5" fill={GOLD} />
    <ellipse cx="32" cy="13.5" rx="19" ry="3" fill={INK} />
  </>
);

const CROWN = (
  <>
    <path d="M19 14 17 0l8 7 7-10 7 10 8-7-2 14Z" fill={GOLD} stroke={GOLD_DARK} strokeWidth="1.8" strokeLinejoin="round" />
    <circle cx="32" cy="9" r="2" fill="#e24b4a" />
    <circle cx="24" cy="10" r="1.4" fill="#5dcaa5" />
    <circle cx="40" cy="10" r="1.4" fill="#5dcaa5" />
  </>
);

// A rain cloud that follows people who are well behind on the fund.
const RAIN_CLOUD = (
  <>
    <path d="M20 -2a5.5 5.5 0 0 1 9-4.5 7 7 0 0 1 13 1.5 4.5 4.5 0 0 1 0 9H22a4.5 4.5 0 0 1-2-6Z" fill={CLOUD} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
    <path d="M25 7l-1.2 3.5M32 7l-1.2 3.5M39 7l-1.2 3.5" stroke={RAIN} strokeWidth="2" strokeLinecap="round" />
  </>
);

const FLY = (
  <>
    <ellipse cx="55" cy="16" rx="1.8" ry="2.4" fill="#dfe7f2" stroke={INK} strokeWidth="0.8" transform="rotate(-30 55 16)" />
    <ellipse cx="58" cy="16" rx="1.8" ry="2.4" fill="#dfe7f2" stroke={INK} strokeWidth="0.8" transform="rotate(30 58 16)" />
    <circle cx="56.5" cy="18" r="1.7" fill={INK} />
  </>
);

const SPARKLES = (
  <path d="M55 14l1.4 3 3 1.4-3 1.4-1.4 3-1.4-3-3-1.4 3-1.4ZM8 20l1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" fill={GOLD} stroke={GOLD_DARK} strokeWidth="0.6" />
);

// A birthday or anniversary: a striped party hat with a pompom, and a balloon on a string.
const PARTY_HAT_ART = (
  <>
    <path d="M22 16 32-4l10 20Z" fill={PARTY_HAT} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
    <circle cx="29" cy="9" r="1.6" fill={PARTY_DOTS} />
    <circle cx="35" cy="4" r="1.4" fill={PARTY_DOTS} />
    <circle cx="33" cy="12" r="1.4" fill="#ffe27a" />
    <circle cx="32" cy="-5" r="3" fill={PARTY_DOTS} stroke={INK} strokeWidth="1.5" />
  </>
);

function Balloon({ kind }: { kind: CelebrationKind }) {
  const { fill, shade } = BALLOON[kind];
  return (
    <>
      <path d="M53 42c4-8-3-14 2-22s3-6 3-8" fill="none" stroke={INK} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M58 12l-1.6 2.4h3.2Z" fill={shade} />
      <ellipse cx="58" cy="4" rx="6" ry="7.5" fill={fill} stroke={INK} strokeWidth="1.8" />
      <ellipse cx="55.8" cy="1" rx="1.4" ry="2.4" fill="#fff" opacity=".6" transform="rotate(-20 55.8 1)" />
    </>
  );
}

const MOUTHS = { smile: 'q4 4 8 0', frown: 'm0 4q4-4 8 0', flat: 'm1 2h6' } as const;

const BODY_PATH = 'M32 13c15 0 24 13 24 27 0 12-10 18-24 18S8 52 8 40c0-14 9-27 24-27Z';

/** The character's shapes, for placing inside an SVG. */
export function MochiArt({ look }: { look: Pick<Look, 'color' | 'accessory' | 'wearing' | 'strokes'> & Partial<Pick<Look, 'fund' | 'party'>> }) {
  const { color, accessory, wearing, strokes } = look;
  const fund = fundArt(look.fund ?? null);
  // A party hat wins on the day. Otherwise the fund's headwear wins over the person's hat, and
  // any of them takes the place of the automatic accessory.
  const party = look.party ?? null;
  const headwear = party ? null : fund.headwear;
  const hasHat = !party && !headwear && wearing.includes('hat');
  const art = party || hasHat || headwear ? null : ACCESSORY_ART[accessory];
  const onBody = [...strokes, ...fund.strokes];
  const behind = BEHIND_HEAD.has(accessory);
  const clipId = useId();
  return (
    <g style={{ color }}>
      {behind && art}
      <path d={BODY_PATH} fill={color} stroke={INK} strokeWidth="3" />
      <circle cx="23" cy="36" r="3.3" fill={INK} />
      <circle cx="41" cy="36" r="3.3" fill={INK} />
      <path
        d={`M28 ${wearing.includes('mustache') ? 41 + MUSTACHE_SMILE_DROP : 41}${MOUTHS[fund.mouth]}`}
        fill="none"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <ellipse cx="16.5" cy="43" rx="4" ry="2.6" fill="#ff7b9c" opacity=".55" />
      <ellipse cx="47.5" cy="43" rx="4" ry="2.6" fill="#ff7b9c" opacity=".55" />
      {onBody.length > 0 && (
        <>
          <clipPath id={clipId}>
            <path d={BODY_PATH} />
          </clipPath>
          <g clipPath={`url(#${clipId})`}>
            {onBody.map((stroke, i) => (
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
      {headwear === 'tophat' && TOP_HAT}
      {headwear === 'crown' && CROWN}
      {party && PARTY_HAT_ART}
      {fund.cloud && RAIN_CLOUD}
      {fund.fly && FLY}
      {fund.sparkles && SPARKLES}
      {party && <Balloon kind={party} />}
    </g>
  );
}

export function Mochi({ user }: { user: Pick<TeamUser, 'username' | 'look' | 'fund' | 'celebration'> }) {
  return (
    <MochiSvg viewBox="0 0 64 62" aria-hidden="true">
      <MochiArt look={lookFor(user.username, user.look, userFundTier(user), user.celebration ?? null)} />
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
