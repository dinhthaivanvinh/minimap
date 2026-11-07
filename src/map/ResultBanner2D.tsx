// The latest vote result on the 2D map: a cloth banner strung across the street between
// two poles, swaying gently. Its words never name a voter (resultText in shared/vote.ts).
import type { CSSProperties } from 'react';
import styled, { keyframes } from 'styled-components';
import { resultText, type LatestResult } from '../../shared/vote.ts';
import type { Zone } from '../lib/layout.ts';
import { voteLink } from '../lib/noticeBoard.ts';
import { media, theme } from '../styles/theme.ts';

const sway = keyframes`
  0%, 100% { transform: skewX(-2deg) rotate(-.6deg); }
  50% { transform: skewX(2deg) rotate(.6deg); }
`;

const Strung = styled.div`
  position: absolute;
  z-index: 2;
  container-type: inline-size;
  pointer-events: none;
`;

const Pole = styled.span`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1.2cqw;
  min-width: 3px;
  border-radius: 2px;
  background: ${theme.ink};

  &:first-child { left: 0; }
  &:nth-child(2) { right: 0; }
`;

const Cloth = styled.a`
  position: absolute;
  top: 0;
  left: 3%;
  right: 3%;
  display: block;
  padding: 1.2cqw 3cqw;
  border: max(2px, .7cqw) solid ${theme.ink};
  border-radius: 1cqw;
  background: ${theme.butter};
  box-shadow: 0 .8cqw 0 rgb(42 38 87 / .35);
  font: 800 3.4cqw/1.2 ${theme.displayFont};
  text-align: center;
  text-decoration: none;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  pointer-events: auto;
  transform-origin: 50% 0;
  animation: ${sway} 4s ease-in-out infinite;

  &:hover { background: #ffd34d; }

  ${media.reducedMotion} { animation: none; }
`;

export function ResultBanner2D({ result, street, width, height }: { result: LatestResult; street: Zone; width: number; height: number }) {
  // Strung over the middle of the street, from the pavement.
  const w = street.w * 0.5;
  const style: CSSProperties = {
    left: `${((street.x + (street.w - w) / 2) / width) * 100}%`,
    // The poles stand on the pavement, the top 28% of the street (Map2D.tsx).
    top: `${((street.y - 1.2) / height) * 100}%`,
    width: `${(w / width) * 100}%`,
    height: `${((street.h * 0.28 + 1.4) / height) * 100}%`,
  };
  const text = resultText(result);
  return (
    <Strung data-result-banner="2d" style={style}>
      <Pole />
      <Pole />
      <Cloth href={voteLink(result.vote.id)} title={text}>{text}</Cloth>
    </Strung>
  );
}
