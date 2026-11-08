// The small ballot over someone on the 2D map who hasn't voted on a vote shown on the map.
// When they vote it pops (grows and fades) before it goes, unless motion is turned down.
import { useEffect, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { useReducedMotion } from '../lib/hooks.ts';
import { theme } from '../styles/theme.ts';

const POP_MS = 450;

const pop = keyframes`
  to { transform: scale(1.9); opacity: 0; }
`;

const bob = keyframes`
  50% { transform: translateY(-3px); }
`;

const Mark = styled.span<{ $popping: boolean }>`
  position: absolute;
  top: -4px;
  left: 50%;
  z-index: 4;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  margin-left: -38px;
  border: ${theme.thinLine};
  border-radius: 6px;
  background: ${theme.white};
  font-size: 13px;
  line-height: 1;
  animation: ${bob} 2.2s ease-in-out infinite;
  pointer-events: none;

  ${({ $popping }) => $popping && css`
    animation: ${pop} ${POP_MS}ms ease-out forwards;
  `}
`;

export function BallotMark({ on }: { on: boolean }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(on);
  const [popping, setPopping] = useState(false);

  useEffect(() => {
    if (on) {
      setShown(true);
      setPopping(false);
      return;
    }
    if (!shown) return;
    if (reduced) return setShown(false);
    setPopping(true);
    const timer = setTimeout(() => {
      setShown(false);
      setPopping(false);
    }, POP_MS);
    return () => clearTimeout(timer);
    // `shown` is left out, so ending the pop doesn't start another.
  }, [on, reduced]);

  if (!shown) return null;
  return (
    <Mark $popping={popping} title={on ? "Hasn't voted yet" : undefined} aria-hidden="true" style={reduced ? { animation: 'none' } : undefined}>
      🗳️
    </Mark>
  );
}
