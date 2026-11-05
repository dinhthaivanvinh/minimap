// The random member picker: choose who's in the draw, then watch a claw machine
// collect the winner. The winner is chosen before the claw moves (see lib/picker.ts),
// and this file only plays the planned steps back with CSS transitions.
import { Component, lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styled, { css, keyframes } from 'styled-components';
import type { TeamUser } from '../../shared/types.ts';
import { useReducedMotion } from '../lib/hooks.ts';
import {
  CHARACTER_ASPECT,
  CHUTE,
  CLAW_GRIP,
  clawWidth,
  confetti,
  createDraw,
  FLOOR_Y,
  MACHINE_HEIGHT,
  previewPool,
  prizeFoot,
  RAIL_Y,
  restingStep,
  TRAY,
  trayLayout,
  type Draw,
  type DrawStep,
} from '../lib/picker.ts';
import { media, theme } from '../styles/theme.ts';
import { supportsWebGL } from '../lib/webgl.ts';
import { Button, FieldLabel, Input, Segmented } from '../styles/ui.ts';
import { Mochi } from './Mochi.tsx';

// three.js is large, so the 3D machine only loads when someone switches to it.
const ClawMachine3D = lazy(() => import('./ClawMachine3D.tsx'));

export type PickerView = '2d' | '3d';

const DEFAULT_TITLE = 'Random pick';
const EASE = { move: 'cubic-bezier(.45, 0, .3, 1)', drop: 'cubic-bezier(.5, 0, .9, .5)' } as const;

/** A length in machine units, which are hundredths of the glass's width. */
const u = (value: number) => `${value}cqw`;

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(42, 38, 87, .45);
  overflow-y: auto;

  ${media.phone} { place-items: start center; }
`;

const Dialog = styled.div`
  width: min(980px, 100%);
  padding: 16px 20px 20px;
  border: ${theme.line};
  border-radius: 22px;
  background: ${theme.paper};
  box-shadow: 0 6px 0 ${theme.ink};

  &:focus { outline: none; }

  ${media.phone} { padding: 14px 14px 18px; }
`;

const Head = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  margin-bottom: 12px;

  h2 { flex: 1; font-size: 24px; }
`;

const Body = styled.div`
  display: grid;
  grid-template-columns: 290px minmax(0, 1fr);
  gap: 18px;
  align-items: start;

  ${media.phone} { grid-template-columns: minmax(0, 1fr); }
`;

const Setup = styled.fieldset`
  display: grid;
  gap: 12px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;

  ${media.phone} { order: 2; }
`;

const TitleField = styled.label`
  display: grid;
  gap: 4px;
`;

const MembersHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;

  ${FieldLabel} { flex: 1; }
`;

const Members = styled.ul`
  max-height: 360px;
  margin: 0;
  padding: 4px;
  border: ${theme.line};
  border-radius: 14px;
  background: ${theme.white};
  list-style: none;
  overflow-y: auto;

  ${media.phone} { max-height: 300px; }
`;

const Member = styled.label`
  display: grid;
  grid-template-columns: 18px 26px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 3px 8px;
  border-radius: 9px;
  cursor: pointer;

  &:hover { background: ${theme.hover}; }
  fieldset:disabled & { cursor: default; opacity: .6; }

  input { width: 16px; height: 16px; margin: 0; accent-color: ${theme.ink}; }
  span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  small { color: ${theme.inkSoft}; font-weight: 600; }
`;

const MemberAvatar = styled.span`
  width: 26px;
  height: 26px;
`;

const Hint = styled.p`
  margin: 0;
  color: ${theme.inkSoft};
  font-size: 14px;
`;

const Stage = styled.div`
  display: grid;
  gap: 12px;
  min-width: 0;
`;

const Cabinet = styled.div`
  width: min(100%, 620px);
  margin: 0 auto;
  padding: 10px 12px 14px;
  border: ${theme.line};
  border-radius: 26px 26px 18px 18px;
  background: ${theme.bubblegum};
  box-shadow: 0 6px 0 ${theme.ink};
`;

const Marquee = styled.div`
  margin: 0 18px 10px;
  padding: 4px 14px;
  border: ${theme.line};
  border-radius: 14px;
  background: ${theme.butter};
  font: 800 20px/1.25 ${theme.displayFont};
  text-align: center;
  overflow-wrap: anywhere;
`;

const Glass = styled.div<{ $instant: boolean }>`
  position: relative;
  container-type: inline-size;
  aspect-ratio: 100 / ${MACHINE_HEIGHT};
  border: ${theme.line};
  border-radius: 16px;
  background: linear-gradient(170deg, #f4fbff 0%, ${theme.sky} 100%);
  overflow: hidden;

  ${({ $instant }) => $instant && css`* { transition: none !important; }`}
  ${media.reducedMotion} { * { transition: none !important; } }
`;

const Rail = styled.div`
  position: absolute;
  top: ${u(RAIL_Y - 1.2)};
  left: ${u(2)};
  right: ${u(2)};
  height: ${u(2.4)};
  border: ${theme.thinLine};
  border-radius: 99px;
  background: #dfe3ff;
`;

const Floor = styled.div`
  position: absolute;
  top: ${u(FLOOR_Y)};
  left: 0;
  right: 0;
  bottom: 0;
  border-top: ${theme.thinLine};
  background: ${theme.sand};
`;

const ChuteBox = styled.div`
  position: absolute;
  top: ${u(CHUTE.top)};
  left: ${u(CHUTE.left)};
  width: ${u(CHUTE.right - CHUTE.left)};
  bottom: -3px;
  border: ${theme.line};
  border-bottom: 0;
  border-radius: 10px 10px 0 0;
  background: ${theme.mint};

  span {
    position: absolute;
    top: ${u(1)};
    left: 0;
    right: 0;
    font: 800 ${u(2.6)}/1 ${theme.displayFont};
    letter-spacing: .08em;
    text-align: center;
  }
`;

/** The see-through front of the chute, in front of a dropped character. */
const ChuteFront = styled.div`
  position: absolute;
  z-index: 20;
  top: ${u(CHUTE.top + 5)};
  left: ${u(CHUTE.left + 1)};
  width: ${u(CHUTE.right - CHUTE.left - 2)};
  bottom: 0;
  border-radius: 6px 6px 0 0;
  background: linear-gradient(115deg, rgba(255, 255, 255, .45) 0 18%, transparent 18% 30%, rgba(255, 255, 255, .3) 30% 36%, transparent 36%);
  pointer-events: none;
`;

const popIn = keyframes`
  0% { transform: translateY(-40%) scale(.6); opacity: 0; }
  60% { transform: translateY(6%) scale(1.06, .94); opacity: 1; }
  100% { transform: none; }
`;

const wiggle = keyframes`
  from { transform: rotate(-6deg); }
  to { transform: rotate(6deg); }
`;

const Character = styled.div`
  position: absolute;

  > div {
    animation: ${popIn} .5s cubic-bezier(.3, 1.4, .6, 1) both;
    transform-origin: 50% 100%;
  }

  &[data-held='true'] > div {
    animation: ${wiggle} .35s ease-in-out infinite alternate;
    transform-origin: 50% 20%;
  }

  ${media.reducedMotion} { > div, &[data-held='true'] > div { animation: none; } }
`;

const NameTag = styled.span`
  position: absolute;
  top: 100%;
  left: 50%;
  width: calc(var(--spacing) * 1cqw - 2px);
  transform: translateX(-50%);
  overflow: hidden;
  font: 800 max(10px, calc(var(--size) * .2cqw))/1.15 ${theme.displayFont};
  text-align: center;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const ClawHost = styled.div`
  position: absolute;
  z-index: 10;
  top: ${u(RAIL_Y)};
  pointer-events: none;

  > i {
    position: absolute;
    top: 0;
    left: calc(50% - 1.5px);
    width: 3px;
    background: ${theme.ink};
  }

  svg {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    overflow: visible;
  }

  g[data-arm] {
    transform-box: view-box;
    transition: transform .25s ease-out;
  }
`;

const MoreChip = styled.span`
  position: absolute;
  z-index: 5;
  top: ${u(RAIL_Y + 3)};
  right: ${u(2)};
  padding: 1px 10px;
  border: ${theme.thinLine};
  border-radius: 99px;
  background: ${theme.paper};
  font-size: max(11px, 2.4cqw);
  font-weight: 800;
`;

const EmptyMachine = styled.p`
  position: absolute;
  top: 45%;
  left: ${u((TRAY.left + TRAY.right) / 2)};
  width: ${u(60)};
  margin: 0;
  transform: translate(-50%, -50%);
  color: ${theme.inkSoft};
  font-weight: 800;
  text-align: center;
`;

const cardIn = keyframes`
  from { transform: translate(-50%, -50%) scale(.6); opacity: 0; }
  to { transform: translate(-50%, -50%); opacity: 1; }
`;

const fall = keyframes`
  from { transform: translate(0, 0) rotate(0); opacity: 1; }
  80% { opacity: 1; }
  to { transform: translate(var(--drift), 80cqw) rotate(var(--spin)); opacity: 0; }
`;

const Reveal = styled.div`
  position: absolute;
  inset: 0;
  z-index: 30;
  background: rgba(255, 254, 250, .55);
  overflow: hidden;
`;

const WinnerCard = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(78%, 360px);
  padding: 12px 16px 14px;
  border: ${theme.line};
  border-radius: 20px;
  background: ${theme.paper};
  box-shadow: 0 5px 0 ${theme.ink};
  transform: translate(-50%, -50%);
  animation: ${cardIn} .45s cubic-bezier(.3, 1.5, .6, 1) both;
  text-align: center;

  ${media.reducedMotion} { animation: none; }
`;

const WinnerTitle = styled.p`
  margin: 0;
  color: ${theme.inkSoft};
  font-weight: 800;
  overflow-wrap: anywhere;
`;

const WinnerAvatar = styled.div`
  width: min(120px, 22cqw);
  height: min(116px, 21cqw);
  margin: 6px auto 4px;
`;

const WinnerName = styled.h3`
  font-size: clamp(22px, 5cqw, 32px);
  overflow-wrap: anywhere;
`;

const WinnerUsername = styled.p`
  margin: 0;
  color: ${theme.inkSoft};
  font-weight: 700;
  overflow-wrap: anywhere;
`;

const Confetti = styled.i`
  position: absolute;
  top: -4%;
  width: 1.6cqw;
  height: 2.6cqw;
  border-radius: 2px;
  animation: ${fall} var(--duration) var(--delay) ease-in both;

  ${media.reducedMotion} { display: none; }
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
`;

const LiveRegion = styled.p`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`;

/** The claw, drawn 60 by 60 with its grip point at (30, 36). */
function ClawArt({ open }: { open: boolean }) {
  const arm = (side: 1 | -1, d: string) => (
    <g data-arm style={{ transformOrigin: `${30 - side * 6}px 15px`, transform: `rotate(${open ? side * 20 : 0}deg)` }}>
      <path d={d} fill="none" stroke={theme.ink} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#dfe3ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
  return (
    <svg viewBox="0 0 60 60" aria-hidden="true">
      {arm(1, 'M24 15C10 19 4 31 9 42l7 5')}
      {arm(-1, 'M36 15c14 4 20 16 15 27l-7 5')}
      <rect x="20" y="7" width="20" height="12" rx="4" fill="#b7a6ff" stroke={theme.ink} strokeWidth="3" />
      <rect x="17" y="0" width="26" height="10" rx="4" fill={theme.butter} stroke={theme.ink} strokeWidth="3" />
      <circle cx="24" cy="15" r="2.5" fill={theme.ink} />
      <circle cx="36" cy="15" r="2.5" fill={theme.ink} />
    </svg>
  );
}

function transition(step: DrawStep, properties: string[]): string {
  return properties.map((p) => `${p} ${step.duration}ms ${EASE[step.ease]}`).join(', ');
}

function byName(a: TeamUser, b: TeamUser): number {
  return a.nickname.localeCompare(b.nickname) || a.username.localeCompare(b.username);
}

/** Keeps Tab inside the dialog. */
function trapFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Tab') return;
  const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button, input, [href], [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.matches(':disabled'));
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

// Falls back to the 2D machine if the 3D one can't load or crashes.
class View3DGuard extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Could not show the 3D claw machine', error);
    this.props.onFail();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface RandomPickerProps {
  users: TeamUser[];
  /** Starts in the same style as the map behind it. */
  initialView?: PickerView;
  onClose: () => void;
}

export function RandomPicker({ users, initialView = '2d', onClose }: RandomPickerProps) {
  const reduced = useReducedMotion();
  const has3D = useMemo(supportsWebGL, []);
  const [view, setView] = useState<PickerView>(() => (initialView === '3d' && has3D ? '3d' : '2d'));
  const headingId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('');
  // Usernames left out of the draw, so new members join the pool by default.
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const [draw, setDraw] = useState<Draw<TeamUser> | null>(null);
  const [drawCount, setDrawCount] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [instant, setInstant] = useState(false);

  const members = useMemo(() => [...users].sort(byName), [users]);
  const pool = useMemo(() => members.filter((user) => !excluded.has(user.username)), [members, excluded]);

  const lastStep = draw ? draw.steps.length - 1 : 0;
  const running = draw !== null && stepIndex < lastStep;
  const shown = draw ? draw.shown : previewPool(pool);
  const layout = draw ? draw.layout : trayLayout(shown.length);
  const step = draw?.steps[stepIndex] ?? restingStep(layout.size);
  const revealed = draw !== null && (step.phase === 'revealing' || step.phase === 'completed');
  const hidden = (draw ? draw.pool.length : pool.length) - shown.length;
  const pieces = useMemo(() => (draw ? confetti(36) : []), [draw]);

  // Plays the steps one after another. Closing the picker clears the pending one.
  useEffect(() => {
    if (!draw || stepIndex >= lastStep) return;
    const timer = setTimeout(() => setStepIndex((i) => i + 1), draw.steps[stepIndex]?.duration ?? 0);
    return () => clearTimeout(timer);
  }, [draw, stepIndex, lastStep]);

  // Focus moves into the dialog, and back to whatever opened it afterwards.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function start() {
    if (running || !pool.length) return;
    const next = createDraw(pool);
    setDraw(next);
    setDrawCount((n) => n + 1);
    // With reduced motion, the result shows straight away.
    setInstant(reduced);
    setStepIndex(reduced ? next.steps.length - 1 : 0);
  }

  function skip() {
    if (!draw) return;
    setInstant(true);
    setStepIndex(lastStep);
  }

  // Changing who's in the draw clears the last result, so the tray shows the new pool.
  function choose(update: (current: ReadonlySet<string>) => ReadonlySet<string>) {
    if (running) return;
    setDraw(null);
    setExcluded(update);
  }

  const toggle = (username: string) =>
    choose((current) => {
      const next = new Set(current);
      if (!next.delete(username)) next.add(username);
      return next;
    });

  const shownTitle = title.trim() || DEFAULT_TITLE;
  const announcement = !draw ? '' : revealed ? `${shownTitle}: ${draw.winner.nickname} was picked.` : 'Drawing a member.';
  const cw = clawWidth(layout.size);
  const height = layout.size * CHARACTER_ASPECT;

  return createPortal(
    <Backdrop onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <Dialog role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1} ref={dialog} onKeyDown={trapFocus}>
        <Head>
          <h2 id={headingId}>Random picker</h2>
          <Segmented role="group" aria-label="Claw machine style">
            <button type="button" aria-pressed={view === '2d'} onClick={() => setView('2d')}>2D</button>
            <button
              type="button"
              aria-pressed={view === '3d'}
              disabled={!has3D}
              title={has3D ? undefined : 'This browser cannot show 3D graphics'}
              onClick={() => setView('3d')}
            >
              3D
            </button>
          </Segmented>
          <Button type="button" $small onClick={onClose}>Close</Button>
        </Head>

        <Body>
          <Setup disabled={running}>
            <TitleField>
              <FieldLabel>Draw title</FieldLabel>
              <Input value={title} maxLength={60} placeholder="Who's buying coffee?" onChange={(event) => setTitle(event.target.value)} />
            </TitleField>
            <div>
              <MembersHead>
                <FieldLabel>In the draw: {pool.length} of {members.length}</FieldLabel>
                <Button type="button" $small disabled={pool.length === members.length} onClick={() => choose(() => new Set())}>
                  Select all
                </Button>
                <Button type="button" $small disabled={!pool.length} onClick={() => choose(() => new Set(members.map((m) => m.username)))}>
                  Deselect all
                </Button>
              </MembersHead>
            </div>
            <Members aria-label="Members in the draw">
              {members.map((user) => (
                <li key={user.username}>
                  <Member>
                    <input type="checkbox" checked={!excluded.has(user.username)} onChange={() => toggle(user.username)} />
                    <MemberAvatar><Mochi user={user} /></MemberAvatar>
                    <span>{user.nickname} <small>@{user.username}</small></span>
                  </Member>
                </li>
              ))}
            </Members>
          </Setup>

          <Stage>
            <Cabinet>
              <Marquee>{shownTitle}</Marquee>
              <Glass $instant={instant}>
                {view === '3d' ? (
                  <View3DGuard onFail={() => setView('2d')}>
                    <Suspense fallback={null}>
                      <ClawMachine3D
                        shown={shown}
                        layout={layout}
                        step={step}
                        stepKey={`${drawCount}:${draw ? stepIndex : 'rest'}`}
                        trayKey={`${drawCount}:${draw ? 'draw' : 'preview'}:${shown.map((user) => user.username).join(',')}`}
                        winnerSlot={draw ? draw.winnerSlot : null}
                        instant={instant}
                        reduced={reduced}
                        onFail={() => setView('2d')}
                      />
                    </Suspense>
                  </View3DGuard>
                ) : (
                  <>
                    <Rail />
                    <ChuteBox><span>PRIZE</span></ChuteBox>
                    <Floor />

                    {shown.map((user, i) => {
                      const slot = layout.slots[i];
                      if (!slot) return null;
                      const isWinner = draw !== null && i === draw.winnerSlot;
                      const at = isWinner ? prizeFoot(step, slot, layout.size) : slot;
                      const style: CSSProperties & Record<'--size' | '--spacing', number> = {
                        '--size': layout.size,
                        '--spacing': layout.spacing,
                        left: u(at.x - layout.size / 2),
                        top: u(at.foot - height),
                        width: u(layout.size),
                        height: u(height),
                        zIndex: isWinner && step.prize !== 'tray' ? 9 : 4 - slot.row,
                        transition: isWinner ? transition(step, ['left', 'top']) : undefined,
                      };
                      return (
                        <Character key={`${drawCount}-${user.username}`} title={user.nickname} style={style} data-held={isWinner && step.prize === 'claw'}>
                          <div style={{ animationDelay: `${i * 35}ms` }}><Mochi user={user} /></div>
                          <NameTag>{user.nickname}</NameTag>
                        </Character>
                      );
                    })}

                    <ChuteFront />

                    <ClawHost
                      style={{
                        left: u(step.x - cw / 2),
                        width: u(cw),
                        height: u(step.y - RAIL_Y + cw * (1 - CLAW_GRIP)),
                        transition: transition(step, ['left', 'height']),
                      }}
                    >
                      <i style={{ bottom: u(cw * 0.85) }} />
                      <ClawArt open={step.open} />
                    </ClawHost>
                  </>
                )}

                {hidden > 0 && <MoreChip>+{hidden} more in the draw</MoreChip>}
                {!shown.length && <EmptyMachine>Nobody is in the draw yet.</EmptyMachine>}

                {draw && revealed && (
                  <Reveal>
                    {pieces.map((piece, i) => (
                      <Confetti
                        key={i}
                        style={{
                          left: `${piece.left}%`,
                          background: piece.color,
                          '--drift': `${piece.drift}px`,
                          '--spin': `${piece.spin}deg`,
                          '--delay': `${piece.delay}ms`,
                          '--duration': `${piece.duration}ms`,
                        } as CSSProperties}
                      />
                    ))}
                    <WinnerCard>
                      <WinnerTitle>{shownTitle}</WinnerTitle>
                      <WinnerAvatar><Mochi user={draw.winner} /></WinnerAvatar>
                      <WinnerName>{draw.winner.nickname}</WinnerName>
                      <WinnerUsername>@{draw.winner.username}</WinnerUsername>
                    </WinnerCard>
                  </Reveal>
                )}
              </Glass>
            </Cabinet>

            <Controls>
              {running ? (
                <Button type="button" onClick={skip}>Skip animation</Button>
              ) : (
                <Button type="button" $primary disabled={!pool.length} onClick={start}>
                  {draw ? 'Pick again' : 'Start draw'}
                </Button>
              )}
            </Controls>
            {!pool.length && <Hint style={{ textAlign: 'center' }}>Select at least one member to start a draw.</Hint>}
            <LiveRegion role="status" aria-live="polite">{announcement}</LiveRegion>
          </Stage>
        </Body>
      </Dialog>
    </Backdrop>,
    document.body,
  );
}
