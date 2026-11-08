import type { TeamUser } from '../../shared/types.ts';
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { ARRIVAL_MS, assemblyMs, heroGrid, heroPose, heroFormation } from '../lib/assembly.ts';
import { useReducedMotion } from '../lib/hooks.ts';
import { supportsWebGL } from '../lib/webgl.ts';
import { Mochi } from './Mochi.tsx';
import { AssemblyProp } from './AssemblyProp.tsx';
import { assemblyProp } from '../lib/assemblyProps.ts';
export interface AssemblyCast {
  members: TeamUser[];
  total: number;
  trigger: HTMLElement;
}
const Assemble3D = lazy(() => import('./TeamAssemble3D.tsx'));
const Dialog = styled.dialog`
  width: min(1220px, calc(100% - 24px));
  max-height: calc(100dvh - 24px);
  padding: 0;
  overflow: auto;
  background: #080b11;
  color: #fff3d6;
  border: 1px solid #76624b;
  border-radius: 8px;
  box-shadow: 0 20px 100px #0008;
  &::backdrop {
    background: #080f23cc;
    backdrop-filter: blur(7px);
  }
  button {
    cursor: pointer;
    min-height: 44px;
    padding: 8px 15px;
    border: 1px solid #8f916e;
    border-radius: 9px;
    background: #1c3046;
    color: #fbe4af;
    font: 800 12px sans-serif;
  }
  button[aria-pressed='true'],
  button[data-primary] {
    background: #ffe4a1;
    color: #243446;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  button:focus-visible {
    outline: 3px solid #8ce9cf;
    outline-offset: 3px;
  }
`;
const Head = styled.header`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 16px 22px;
  h2 {
    margin: 0;
    flex: 1;
    font-size: 21px;
    color: #ffe1a0;
  }
  small {
    display: block;
    font: 800 9px sans-serif;
    letter-spacing: 4px;
    color: #8bb7b8;
    margin-bottom: 5px;
  }
  @media (max-width: 600px) {
    padding: 12px;
    h2 {
      font-size: 17px;
    }
    button {
      padding: 8px 10px;
    }
  }
`;
const Stage = styled.div`
  position: relative;
  overflow: hidden;
  container-type: size;
  height: clamp(430px, 72vh, 690px);
  isolation: isolate;
  background:
    radial-gradient(ellipse at 62% 65%, #74351c66, transparent 55%),
    radial-gradient(ellipse at 25% 40%, #07536a66, #060a12 75%);
  &::before {
    content: '';
    position: absolute;
    inset: 55% -10% -10%;
    background: linear-gradient(#111b23, #080b12);
    transform: perspective(600px) rotateX(30deg);
    border-top: 1px solid #d77f3b44;
  }
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    box-shadow:
      inset 0 24px 0 #030609,
      inset 0 -24px 0 #030609,
      inset 0 0 130px 30px #0009;
    pointer-events: none;
    z-index: 4;
  }
  @media (max-width: 600px) {
    height: 510px;
  }
`;
const Sky = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    112deg,
    transparent 12%,
    #4ccee511 13% 23%,
    transparent 24% 65%,
    #f8a25c0c 66% 78%,
    transparent 79%
  );
`;
const Skyline = styled.svg`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.8;
`;
const Signal = styled.div`
  position: absolute;
  left: 50%;
  top: 16%;
  transform: translateX(-50%);
  display: grid;
  place-items: center;
  width: 78px;
  height: 78px;
  border: 2px solid #eac980;
  border-radius: 50%;
  color: #ffe7ab;
  font-size: 48px;
  background: #ffe1a00b;
  box-shadow:
    0 0 50px #e7c48133,
    inset 0 0 30px #edc26c22;
`;
const Lineup = styled.div<{ $columns: number; $rows: number }>`
  position: absolute;
  inset: 0;
  overflow: hidden;
  --hero-size: clamp(80px, 22cqw, 190px);
`;
const rimSpin = keyframes`
  to { transform: rotate(360deg); }
`;
const emberDrift = keyframes`
  from { transform: scale(0.5); opacity: 0; }
  20% { opacity: 1; }
  to { transform: translate(var(--drift-x), var(--drift-y)) scale(0); opacity: 0; }
`;
const titlePop = keyframes`
  0% { opacity: 0; transform: scale(0.4); }
  55% { opacity: 1; transform: scale(1.12); }
  75% { transform: scale(0.96); }
  100% { transform: scale(1); }
`;
const finaleFlash = keyframes`
  0% { opacity: 0; }
  14% { opacity: 1; }
  100% { opacity: 0; }
`;
const Hero = styled.div`
  position: absolute;
  width: var(--hero-size);
  text-align: center;
  transform-origin: 50% 100%;
  .body {
    position: relative;
    aspect-ratio: 1;
    transform-origin: 50% 100%;
  }
  .figure {
    margin: auto;
    width: min(100%, var(--hero-size));
    aspect-ratio: 1;
    filter: contrast(1.2) saturate(0.85) drop-shadow(-4px 0 5px #38d4ef55) drop-shadow(5px 1px 5px #ff6c2744)
      drop-shadow(0 18px 8px #000b);
  }
  .signature-prop {
    position: absolute;
    filter: drop-shadow(0 4px 3px #0008);
    overflow: visible;
  }
  .prop-keyboard-blade {
    width: 32%;
    height: 104%;
    left: -16%;
    bottom: 10%;
    transform: rotate(-12deg);
  }
  .prop-staple-cannon {
    width: 64%;
    height: 34%;
    right: -38%;
    bottom: 26%;
  }
  .prop-monitor-shield {
    width: 54%;
    height: 50%;
    left: -22%;
    bottom: 0;
  }
  .prop-deadline-scythe {
    width: 62%;
    height: 112%;
    right: -30%;
    bottom: 0;
  }
  .prop-mouse-flail {
    width: 52%;
    height: 72%;
    right: -30%;
    bottom: 12%;
  }
  .prop-rubber-duck {
    width: 58%;
    height: 52%;
    right: -36%;
    bottom: 44%;
  }
  .prop-toilet-plunger {
    width: 30%;
    height: 100%;
    left: -14%;
    bottom: 6%;
    transform: rotate(-8deg);
  }
  .prop-coffee-bazooka {
    width: 72%;
    height: 34%;
    right: -42%;
    bottom: 54%;
  }
  .prop-sticky-shuriken {
    width: 40%;
    height: 40%;
    right: -24%;
    bottom: 30%;
    animation: ${rimSpin} 0.9s linear infinite;
    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
  }
  .impact {
    position: absolute;
    bottom: 16px;
    left: -15%;
    width: 130%;
    height: 24px;
    border: 2px solid #ffd09a;
    border-radius: 50%;
    box-shadow: 0 0 18px #e98a38;
  }
  .flash {
    position: absolute;
    inset: -25%;
    border-radius: 50%;
    background: radial-gradient(circle, #fffdf3ee, #ffdb9bb3 38%, transparent 70%);
    mix-blend-mode: screen;
    pointer-events: none;
  }
  .portal {
    position: absolute;
    width: 115%;
    aspect-ratio: 1;
    left: -7.5%;
    top: -7.5%;
    border: 2px solid #ffb36b;
    border-radius: 50%;
    background: radial-gradient(circle, #72ecd033, #184e6977 55%, #ffb36b44 68%, transparent 70%);
    box-shadow:
      0 0 25px #ffb85c,
      inset 0 0 18px #72ecd0;
    pointer-events: none;
    .sigil-ring {
      position: absolute;
      inset: -5px;
      border: 3px dashed #ffe1aa;
      border-radius: 50%;
      box-shadow: 0 0 9px #ffad68;
      animation: ${rimSpin} 2.4s linear infinite;
      animation-play-state: inherit;
    }
    .ring-inner {
      inset: 9%;
      border: 2px dotted #80e4f1;
      animation-duration: 3.3s;
      animation-direction: reverse;
    }
    .ring-marks {
      inset: 2%;
      border: 9px solid transparent;
      background: repeating-conic-gradient(#ffd48b 0deg 3deg, transparent 3deg 20deg) border-box;
      mask: radial-gradient(circle, transparent 63%, #000 64% 69%, transparent 70%);
      animation-duration: 4.7s;
    }
    .ember {
      position: absolute;
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: #ffce85;
      box-shadow: 0 0 6px #ff9b3d;
      animation: ${emberDrift} 0.8s linear infinite;
      animation-play-state: inherit;
    }
    @media (prefers-reduced-motion: reduce) {
      .sigil-ring,
      .ember {
        animation: none;
      }
    }
  }

  span {
    display: block;
    position: relative;
    margin: 4px auto 0;
    width: fit-content;
    max-width: 100%;
    padding: 3px 7px;
    border-radius: 6px;
    background: #0d1b2ce8;
    color: #d5f4e5;
    font: 800 11px/1.3 sans-serif;
    overflow-wrap: anywhere;
  }
`;
const Title = styled.div`
  position: absolute;
  top: 9%;
  left: 6%;
  right: 6%;
  text-align: left;
  pointer-events: none;
  z-index: 2;
  p {
    margin: 0 0 10px;
    color: #a3e9d3;
    font: 800 10px sans-serif;
    letter-spacing: 5px;
  }
`;
const Headline = styled.strong<{ $pop: boolean }>`
  display: block;
  font:
    900 clamp(44px, 8vw, 106px)/0.95 Impact,
    'Arial Narrow',
    sans-serif;
  text-transform: uppercase;
  letter-spacing: -2px;
  color: #f5eee2;
  text-shadow:
    2px 3px 0 #71462f,
    0 0 40px #ffd89133;
  ${({ $pop }) =>
    $pop &&
    css`
      animation: ${titlePop} 0.5s cubic-bezier(0.17, 0.89, 0.32, 1.49) both;
    `}
`;
const FinaleFlash = styled.div`
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  background: radial-gradient(circle at 50% 45%, #fff8e6ee, #ffcf8f66 42%, transparent 72%);
  animation: ${finaleFlash} 0.65s ease-out both;
`;
const Footer = styled.footer`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 15px 22px;
  p {
    flex: 1;
    min-width: 160px;
    color: #a4b9c7;
    margin: 0;
    font-size: 12px;
  }
`;
class SceneGuard extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export function TeamAssemble({
  cast,
  initialView,
  onClose,
}: {
  cast: AssemblyCast;
  initialView: '2d' | '3d';
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const reduced = useReducedMotion();
  const [has3D] = useState(supportsWebGL);
  const skipped = useRef(false);
  const [view, setView] = useState(initialView);
  const [failed, setFailed] = useState(false);
  const totalMs = assemblyMs(cast.members.length);
  const [elapsed, setElapsed] = useState(reduced ? totalMs : 0);
  const [take, setTake] = useState(0);
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      const trigger = cast.trigger.isConnected
        ? cast.trigger
        : document.querySelector<HTMLElement>('[data-assemble-play],header a');
      trigger?.focus();
    };
  }, [cast]);
  useEffect(() => {
    if (reduced) {
      setElapsed(totalMs);
      return;
    }
    skipped.current = false;
    const origin = performance.now();
    let frame = 0;
    const tick = () => {
      if (skipped.current) return;
      const now = Math.min(totalMs, performance.now() - origin);
      setElapsed(now);
      if (now < totalMs) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [take, reduced, totalMs]);
  const grid = heroGrid(cast.members.length);
  // Heroes are already settled by ARRIVAL_MS; hold a beat of stillness before the title slams in.
  const finale = elapsed >= ARRIVAL_MS + 260;
  const fail = () => {
    setFailed(true);
    setView('2d');
  };
  return (
    <Dialog
      ref={dialog}
      aria-labelledby="assembly-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <Head>
        <h2 id="assembly-title">
          <small>OFFICE / ASSEMBLY PROTOCOL</small>Team, assemble!
        </h2>
        <div role="group" aria-label="Celebration view">
          <button aria-pressed={view === '2d'} onClick={() => setView('2d')}>
            2D
          </button>{' '}
          <button aria-pressed={view === '3d'} disabled={failed || !has3D} onClick={() => setView('3d')}>
            3D
          </button>
        </div>
        <button aria-label="Close celebration" onClick={onClose}>
          ×
        </button>
      </Head>
      <Stage data-assembly-stage data-phase={finale ? 'assembled' : elapsed < 1200 ? 'signal' : 'arrivals'}>
        <Sky />
        <Skyline viewBox="0 0 1400 700" preserveAspectRatio="none" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => {
            const h = 130 + ((i * 73) % 180);
            return (
              <g key={i}>
                <path
                  d={`M${i * 82} 440V${440 - h}l22 7 9-20 15 18h24v${h - 5}z`}
                  fill={i % 2 ? '#101b26' : '#121821'}
                />
                <path
                  d={`M${i * 82 + 12} ${460 - h}v${h - 25}`}
                  stroke={i % 3 ? '#4292aa' : '#bd7045'}
                  opacity=".35"
                  strokeWidth="4"
                  strokeDasharray="8 18"
                />
              </g>
            );
          })}
          <path d="M0 505l120-30 140 16 100-36 160 24 170-10 150 34 180-30 280 36v191H0z" fill="#080d14" />
        </Skyline>
        <Signal aria-hidden="true" style={{ opacity: finale ? 0.2 : 1 }}>
          ✦
        </Signal>
        {finale && !reduced && <FinaleFlash aria-hidden="true" />}
        {view === '2d' && (
          <Lineup $columns={grid.columns} $rows={grid.rows} aria-label="Office heroes">
            {cast.members.map((user, index) => {
              const pose = heroPose(index, cast.members.length, elapsed, reduced);
              const formation = heroFormation(index, cast.members.length);
              // Impact^2 sharpens the shake/flash to a snappy burst right at the landing peak.
              const punch = reduced ? 0 : pose.impact * pose.impact;
              const shakeX = punch ? Math.sin(pose.progress * 180 + index * 11) * punch * 4 : 0;
              const shakeY = punch ? Math.cos(pose.progress * 150 + index * 5) * punch * 3 : 0;
              return (
                <Hero
                  key={user.username}
                  data-assembly-member={user.username}
                  style={{
                    left: `${formation.x * 100}%`,
                    top: `${formation.y * 100}%`,
                    zIndex: Math.round(formation.y * 100),
                    transform: `translate(calc(-50% + ${shakeX}px),calc(-100% + ${shakeY}px)) scale(${formation.scale})`,
                  }}
                >
                  <div
                    className="flash"
                    aria-hidden="true"
                    style={{ opacity: pose.impact ** 3 }}
                  />
                  <div
                    className="portal"
                    aria-hidden="true"
                    style={{
                      opacity: pose.portal,
                      transform: `scale(${pose.portalScale})`,
                      animationPlayState: pose.portal > 0 && !reduced ? 'running' : 'paused',
                    }}
                  >
                    <i className="sigil-ring" />
                    <i className="sigil-ring ring-inner" />
                    <i className="sigil-ring ring-marks" />
                    {Array.from({ length: 12 }, (_, spark) => {
                      const angle = (spark / 12) * Math.PI * 2;
                      return (
                        <i
                          key={spark}
                          className="ember"
                          style={
                            {
                              left: `${50 + Math.cos(angle) * 50}%`,
                              top: `${50 + Math.sin(angle) * 50}%`,
                              animationDelay: `${-spark * 0.067}s`,
                              '--drift-x': `${Math.cos(angle) * 28}px`,
                              '--drift-y': `${Math.sin(angle) * 28 - 8}px`,
                            } as import('react').CSSProperties
                          }
                        />
                      );
                    })}
                  </div>
                  <div
                    className="impact"
                    aria-hidden="true"
                    style={{ opacity: pose.impact, transform: `scale(${1 + (1 - pose.impact) * 2})` }}
                  />
                  <div
                    className="body"
                    style={{
                      opacity: pose.opacity,
                      clipPath: pose.emerge === 1 ? 'none' : `circle(${pose.emerge * 85}% at 50% 55%)`,
                      transform: `translateY(${pose.y}px) scale(${pose.scale}) rotate(${pose.lean}deg)`,
                    }}
                  >
                    <div className="figure">
                      <Mochi user={user} />
                    </div>
                    <AssemblyProp item={assemblyProp(index)} index={index} />
                  </div>
                  <span style={{ fontSize: 11 / formation.scale, opacity: pose.opacity }}>
                    {user.nickname || user.username}
                  </span>
                </Hero>
              );
            })}
          </Lineup>
        )}
        {view === '3d' && (
          <SceneGuard onFail={fail}>
            <Suspense fallback={<p style={{ textAlign: 'center', paddingTop: 160 }}>Opening the portals…</p>}>
              <Assemble3D members={cast.members} elapsed={elapsed} reduced={reduced} onFail={fail} />
            </Suspense>
          </SceneGuard>
        )}
        <Title>
          <p>
            {finale
              ? 'ONE TEAM. ZERO HESITATION.'
              : elapsed < 1200
                ? '01 / THE SIGNAL'
                : '02 / REINFORCEMENTS'}
          </p>
          <Headline key={finale ? 'finale' : 'progress'} $pop={finale && !reduced}>
            {finale
              ? 'TEAM, ASSEMBLE.'
              : elapsed < 1200
                ? `${Math.round((cast.members.length / cast.total) * 100)}% TOGETHER.`
                : 'ON YOUR LEFT.'}
          </Headline>
        </Title>
      </Stage>
      <Footer>
        <p role="status">
          {finale
            ? `${cast.members.length} office heroes. The team is assembled.`
            : `Assembling ${cast.members.length} office heroes…`}
          {failed ? ' · Showing 2D' : ''}
        </p>
        {elapsed < totalMs && (
          <button
            onClick={() => {
              skipped.current = true;
              setElapsed(totalMs);
            }}
          >
            Skip
          </button>
        )}
        <button
          data-primary
          onClick={() => {
            setElapsed(reduced ? totalMs : 0);
            setTake((t) => t + 1);
          }}
        >
          Replay
        </button>
        <button onClick={onClose}>Back to map</button>
      </Footer>
      <div style={{ padding: '0 22px 18px', color: '#8da9bb', fontSize: 11 }} aria-label="Assembled team">
        {cast.members.map((user) => user.nickname || user.username).join(' · ')}
      </div>
    </Dialog>
  );
}
