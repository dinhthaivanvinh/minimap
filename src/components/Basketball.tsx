import { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import {
  aimAt,
  EMPTY_RESULT,
  ROUND_MS,
  SHOT_GAP,
  shoot,
  targetWidth,
  targetCenter,
  type BasketballRecords,
  type Result,
  type Round,
} from '../../shared/basketball.ts';
import type { AuthResult, TeamUser } from '../../shared/types.ts';
import { api, errorText } from '../lib/api.ts';
import { useReducedMotion } from '../lib/hooks.ts';
import { BasketballCourt, type CourtProps } from './BasketballCourt.tsx';
import { basketballCast, pickCrowd, type CrowdSelection } from '../lib/basketballCast.ts';
import { supportsWebGL } from '../lib/webgl.ts';

const Modal = styled.dialog`
  width: min(1050px, calc(100% - 28px));
  max-height: calc(100dvh - 28px);
  overflow: auto;
  padding: 0;
  border: 2px solid #526173;
  border-radius: 24px;
  background: #111c2e;
  color: #faf0d7;
  box-shadow:
    0 0 0 6px #101726,
    0 24px 100px #0009;
  &::backdrop {
    background: #080f21bd;
    backdrop-filter: blur(8px);
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  button:disabled {
    cursor: default;
    opacity: 0.45;
  }
  button:focus-visible {
    outline: 3px solid #88f6df;
    outline-offset: 4px;
  }
  @media (max-width: 600px) {
    width: calc(100% - 16px);
    max-height: calc(100dvh - 16px);
    border-radius: 18px;
  }
`;
const Head = styled.header`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid #ffffff15;
  h2 {
    margin: 0;
    font-size: 27px;
    line-height: 1;
    letter-spacing: 1px;
    color: #ffb979;
  }
  small {
    display: block;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 4px;
    color: #8193ad;
    margin-bottom: 6px;
  }
  @media (max-width: 600px) {
    padding: 14px;
    gap: 10px;
    h2 {
      font-size: 23px;
    }
  }
`;
const ViewSwitch = styled.div`
  display: flex;
  padding: 4px;
  gap: 3px;
  margin-left: auto;
  background: #080f20;
  border: 1px solid #ffffff18;
  border-radius: 10px;
  button {
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #8e9fb7;
    font-size: 12px;
    font-weight: 900;
    min-height: 36px;
    min-width: 42px;
  }
  button[aria-pressed='true'] {
    color: #102e30;
    background: #8ee1d0;
    box-shadow: 0 2px 10px #7de5cc22;
  }
`;
const Close = styled.button`
  width: 40px;
  height: 44px;
  border: 1px solid #ffffff20;
  border-radius: 10px;
  color: #cad3df;
  background: transparent;
  font-size: 24px !important;
`;
const Body = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 250px;
  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
const Game = styled.div`
  min-width: 0;
  background: #17243b;
`;
const Scoreboard = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  text-align: center;
  padding: 15px 10px 12px;
  background: #0d1728;
  > div + div {
    border-left: 1px solid #ffffff15;
  }
  span {
    display: block;
    color: #90a2b9;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 3px;
  }
  strong {
    display: block;
    font:
      900 38px/1.2 ui-monospace,
      monospace;
    color: #ffe8ac;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 18px #ffc66733;
  }
  @media (max-width: 600px) {
    padding: 12px 8px;
    strong {
      font-size: 30px;
    }
  }
`;
const Arena = styled.div`
  position: relative;
  height: clamp(310px, 46vh, 440px);
  overflow: hidden;
  @media (max-width: 600px) {
    height: clamp(290px, 43dvh, 390px);
  }
`;
const Splash = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(transparent, #101c3288);
  pointer-events: none;
  h3 {
    margin: 0;
    font-size: clamp(40px, 7vw, 68px);
    font-style: italic;
    line-height: 1;
    letter-spacing: 2px;
    color: #fff1c5;
    text-shadow:
      0 4px 0 #513830,
      0 10px 30px #0008;
  }
  span {
    margin-top: 14px;
    color: #a1f2da;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 5px;
  }
  strong {
    font:
      900 76px/1.2 ui-monospace,
      monospace;
    color: #ffbf82;
  }
`;
const Feedback = styled.div<{ $hit: boolean }>`
  position: absolute;
  left: 0;
  right: 0;
  top: 46%;
  text-align: center;
  pointer-events: none;
  font-size: clamp(24px, 4vw, 36px);
  font-weight: 1000;
  font-style: italic;
  letter-spacing: 2px;
  color: ${({ $hit }) => ($hit ? '#b3ffe4' : '#ffcfab')};
  text-shadow:
    0 3px 0 #15213d,
    0 0 24px #111c2e;
`;
const Deck = styled.div`
  position: relative;
  padding: 16px 24px 20px;
  background: #142035;
  border-top: 2px solid #58667b;
  @media (max-width: 600px) {
    padding: 14px 18px 16px;
  }
`;
const Meter = styled.div`
  height: 18px;
  background: #080f20;
  border: 1px solid #617088;
  border-radius: 6px;
  position: relative;
  overflow: hidden;
  box-shadow: inset 0 2px 8px #0008;
`;
const Controls = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
`;
const Action = styled.button`
  min-height: 52px;
  min-width: 150px;
  padding: 10px 28px;
  border: 1px solid #ffd0a5;
  border-radius: 10px;
  background: linear-gradient(#ffca8d, #ff985e);
  color: #402530;
  box-shadow:
    0 4px 0 #a3533a,
    0 6px 20px #ff985e22;
  font-size: 18px !important;
  font-weight: 1000 !important;
  letter-spacing: 2px;
  text-transform: uppercase;
  touch-action: manipulation;
  &:active:not(:disabled) {
    transform: translateY(3px);
    box-shadow: 0 1px 0 #a3533a;
  }
`;
const Player = styled.div`
  flex: 1;
  min-width: 0;
  font-size: 11px;
  font-weight: 800;
  text-align: center;
  color: #b8c6d9;
  span {
    display: block;
    margin-top: 3px;
    font-size: 9px;
    letter-spacing: 2px;
    color: #7f92ab;
  }
`;
const Rankings = styled.aside`
  padding: 24px 20px;
  border-left: 1px solid #ffffff12;
  background: #111c2e;
  h3 {
    font-size: 15px;
    margin: 0 0 18px;
    letter-spacing: 2px;
    color: #f8dfaf;
  }
  ol {
    list-style: none;
    padding: 0;
    margin: 18px 0;
    max-height: 280px;
    overflow: auto;
  }
  li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 0;
    border-bottom: 1px solid #ffffff0b;
    font-size: 12px;
  }
  li > b {
    color: #8ce2ca;
    width: 15px;
    font:
      800 12px ui-monospace,
      monospace;
  }
  li > span {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  li > strong {
    font:
      800 16px ui-monospace,
      monospace;
    color: #ffe3ab;
  }
  p {
    font-size: 12px;
    color: #91a1b9;
  }
  @media (max-width: 760px) {
    border-left: 0;
    border-top: 1px solid #ffffff12;
    padding: 20px;
  }
`;
const Tabs = styled.div`
  display: flex;
  gap: 12px;
  border-bottom: 1px solid #ffffff20;
  button {
    flex: 1;
    min-height: 40px;
    padding: 8px 0;
    background: transparent;
    color: #8598b3;
    border: 0;
    border-bottom: 2px solid transparent;
    font-size: 11px;
    font-weight: 900;
  }
  button[aria-pressed='true'] {
    color: #96ead4;
    border-bottom-color: #96ead4;
  }
`;
const Best = styled.div`
  margin-top: 22px;
  padding: 15px;
  border: 1px solid #91dfc52a;
  border-radius: 10px;
  background: #82dec508;
  span {
    font-size: 9px;
    letter-spacing: 2px;
    color: #8dbaa9;
  }
  strong {
    display: block;
    font:
      900 32px ui-monospace,
      monospace;
    color: #c2f1d6;
  }
`;
const Notice = styled.div`
  padding: 10px 24px;
  font-size: 12px;
  color: #a3d7c3;
  background: #0d1728;
  &[role='alert'] {
    color: #ffc3a4;
  }
  button {
    color: inherit;
    background: transparent;
    border: 1px solid currentColor;
    border-radius: 5px;
    padding: 8px;
    margin: 6px 8px 0 0;
  }
`;
function readAuth(): AuthResult | null {
  try {
    const value = JSON.parse(localStorage.getItem('minimap.auth') ?? 'null');
    return typeof value?.token === 'string' && typeof value?.username === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function Basketball({
  initialView,
  users,
  request,
}: {
  initialView: '2d' | '3d';
  users: TeamUser[];
  request: { trigger: HTMLElement } | null;
}) {
  const has3D = useMemo(supportsWebGL, []);
  const [view, setView] = useState<'2d' | '3d'>(initialView);
  const [ranking, setRanking] = useState<'weekly' | 'allTime'>('weekly');
  const [visualShot, setVisualShot] = useState<CourtProps['shot']>(null);
  const [viewFailed, setViewFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const shootButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [auth, setAuth] = useState<AuthResult | null>(null);
  const [crowdSelection, setCrowdSelection] = useState<CrowdSelection>({ teammates: [], banners: {} });
  const cast = useMemo(
    () => basketballCast(users, auth?.username ?? null, crowdSelection.teammates, crowdSelection.banners),
    [users, auth?.username, crowdSelection],
  );
  const [round, setRound] = useState<Round | null>(null);
  const [phase, setPhase] = useState<'ready' | 'playing' | 'done'>('ready');
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result>(EMPTY_RESULT);
  const [feedback, setFeedback] = useState('READY');
  const [boards, setBoards] = useState<BasketballRecords | null>(null);
  const [boardError, setBoardError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const startAttempt = useRef(0);
  const origin = useRef(0);
  const shots = useRef<number[]>([]);
  const running = useRef(false);
  const current = useRef<Result>(EMPTY_RESULT);
  const reduced = useReducedMotion();
  const headers: Record<string, string> = auth ? { Authorization: `Bearer ${auth.token}` } : {};

  async function loadBoards() {
    setBoardError('');
    try {
      setBoards(await api<BasketballRecords>('GET', '/api/basketball'));
    } catch (err) {
      setBoardError(errorText(err));
    }
  }
  async function saveScore(active: Round) {
    setBusy(true);
    setSaveError('');
    setSaveMessage('Saving score…');
    try {
      const saved = await api<BasketballRecords & { score: number }>(
        'POST',
        '/api/basketball/score',
        { ticket: active.ticket, shots: shots.current },
        headers,
      );
      setBoards(saved);
      setSaveMessage(`Saved ${saved.score} points for ${auth?.username}.`);
    } catch (err) {
      setSaveMessage('');
      setSaveError(`Score not saved: ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  }
  // Keep the timer based on elapsed monotonic time, including background tabs.
  useEffect(() => {
    if (!open || phase !== 'playing' || !round) return;
    const timer = setInterval(() => {
      const ms = Math.floor(performance.now() - origin.current);
      setElapsed(Math.min(ms, ROUND_MS));
      if (ms >= ROUND_MS && running.current) {
        running.current = false;
        setPhase('done');
        setFeedback('GAME OVER');
        if (round.ticket) void saveScore(round);
        else setSaveMessage('Practice complete');
      }
    }, 16);
    return () => clearInterval(timer);
    // The round captures the identity used at its start.
  }, [open, phase, round]);

  useEffect(() => {
    if (!request) return;
    opener.current = request.trigger;
    const nextAuth = readAuth();
    setAuth(nextAuth);
    setCrowdSelection(pickCrowd(users, nextAuth?.username ?? null));
    setView(initialView === '3d' && has3D ? '3d' : '2d');
    setViewFailed(false);
    setOpen(true);
    // A map object click is the only trigger; team updates don't reopen the game.
  }, [request]);

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    void loadBoards();
    return () => {
      dialog.current?.close();
      if (opener.current?.isConnected) opener.current.focus();
      else document.querySelector<HTMLElement>('[data-arcade-play]')?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (phase === 'playing') shootButton.current?.focus();
  }, [phase]);

  async function start() {
    const attempt = ++startAttempt.current;
    setBusy(true);
    setSaveError('');
    setSaveMessage('');
    try {
      const next = auth
        ? await api<Round>('POST', '/api/basketball/round', {}, headers)
        : { seed: Math.floor(Math.random() * 0x100000000), ticket: '' };
      if (attempt !== startAttempt.current) return;
      setCrowdSelection(pickCrowd(users, auth?.username ?? null));
      shots.current = [];
      current.current = EMPTY_RESULT;
      setResult(EMPTY_RESULT);
      setVisualShot(null);
      origin.current = performance.now();
      running.current = true;
      setElapsed(0);
      setRound(next);
      setPhase('playing');
      setFeedback('');
    } catch (err) {
      if (attempt === startAttempt.current) setSaveError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  function shot() {
    if (!running.current || !round) return;
    const ms = Math.floor(performance.now() - origin.current);
    if (ms >= ROUND_MS || ms - (shots.current.at(-1) ?? -SHOT_GAP) < SHOT_GAP) return;
    shots.current.push(ms);
    const next = shoot(current.current, ms, round.seed);
    const gained = next.score - current.current.score;
    current.current = next;
    setResult(next);
    setVisualShot({ id: shots.current.length, at: ms, hit: next.hit });
    setFeedback(next.hit ? `SWISH! +${gained}` : 'SO CLOSE!');
  }
  function close() {
    startAttempt.current++;
    running.current = false;
    setOpen(false);
    if (phase === 'playing') setPhase('ready');
  }
  const center = targetCenter(round?.seed ?? 0, result.attempts) * 100;
  const width = targetWidth(result.streak) * 100;
  const aim = round ? aimAt(elapsed, round.seed) : 0.5;
  return (
    <>
      {open && (
        <Modal
          ref={dialog}
          aria-labelledby="basketball-title"
          onCancel={close}
          onClose={() => {
            if (open) close();
          }}
        >
          <Head>
            <div>
              <small>MINIMAP ARCADE</small>
              <h2 id="basketball-title">HOOP TIME</h2>
            </div>
            <ViewSwitch role="group" aria-label="Game view">
              <button
                aria-pressed={view === '2d'}
                onClick={() => {
                  setView('2d');
                  setViewFailed(false);
                }}
              >
                2D
              </button>
              <button
                aria-pressed={view === '3d'}
                disabled={!has3D || viewFailed}
                onClick={() => setView('3d')}
              >
                3D
              </button>
            </ViewSwitch>
            <Close aria-label="Close game" onClick={close}>
              ×
            </Close>
          </Head>
          <Body>
            <Game>
              <Scoreboard aria-label="Scoreboard">
                <div>
                  <span>SCORE</span>
                  <strong>{String(result.score).padStart(3, '0')}</strong>
                </div>
                <div>
                  <span>TIME</span>
                  <strong style={{ color: elapsed > 50000 ? '#ffa48b' : undefined }}>
                    {String(Math.ceil((ROUND_MS - elapsed) / 1000)).padStart(2, '0')}
                  </strong>
                </div>
                <div>
                  <span>STREAK</span>
                  <strong>{String(result.streak).padStart(2, '0')}</strong>
                </div>
              </Scoreboard>
              <Arena>
                <BasketballCourt
                  cast={cast}
                  mode={view}
                  shot={visualShot}
                  elapsed={elapsed}
                  reduced={reduced}
                  onFail={() => {
                    setView('2d');
                    setViewFailed(true);
                  }}
                />
                {phase !== 'playing' && (
                  <Splash>
                    <h3>{phase === 'done' ? 'GAME OVER' : 'HOOP TIME'}</h3>
                    {phase === 'done' ? (
                      <>
                        <strong>{result.score}</strong>
                        <span>POINTS</span>
                      </>
                    ) : (
                      <span>60 SECONDS. ALL YOU GOT.</span>
                    )}
                  </Splash>
                )}
                {phase === 'playing' && visualShot && elapsed - visualShot.at < 900 && (
                  <Feedback $hit={result.hit} aria-hidden="true">
                    {feedback}
                  </Feedback>
                )}
              </Arena>
              <Deck>
                <Meter
                  role="img"
                  aria-label={`Aim ${Math.round(aim * 100)} percent. Target centered at ${Math.round(center)} percent, width ${Math.round(width)} percent.`}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: `${center - width / 2}%`,
                      width: `${width}%`,
                      insetBlock: 2,
                      borderRadius: 3,
                      background: '#94e4c3',
                      boxShadow: '0 0 14px #94e4c366',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      left: `calc(${aim * 100}% - 2px)`,
                      width: 4,
                      insetBlock: 0,
                      background: '#fff6dc',
                      boxShadow: '0 0 8px #fff6dc',
                    }}
                  />
                </Meter>
                <Controls>
                  {phase === 'playing' ? (
                    <Action ref={shootButton} onClick={shot}>
                      SHOOT
                    </Action>
                  ) : (
                    <Action disabled={busy || (!!saveError && phase === 'done')} onClick={() => void start()}>
                      {busy ? '…' : phase === 'done' ? 'PLAY AGAIN' : 'PLAY'}
                    </Action>
                  )}
                  <Player>
                    {auth?.username ?? 'GUEST'}
                    <span>
                      {phase === 'playing' && result.streak >= 3
                        ? `COMBO ×${result.streak}`
                        : auth
                          ? 'RANKED RUN'
                          : 'PRACTICE'}
                    </span>
                  </Player>
                </Controls>
                <span
                  style={{
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    overflow: 'hidden',
                    clipPath: 'inset(50%)',
                  }}
                  role="status"
                  aria-live="polite"
                >
                  {feedback}
                </span>
              </Deck>
              {viewFailed && <Notice role="status">3D unavailable · playing in 2D</Notice>}
              {saveMessage && <Notice role="status">{saveMessage}</Notice>}
              {saveError && (
                <Notice role="alert">
                  {saveError}
                  <br />
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (phase === 'done' && round?.ticket) void saveScore(round);
                      else void start();
                    }}
                  >
                    Retry
                  </button>
                  {phase === 'done' && (
                    <button
                      onClick={() => {
                        setSaveError('');
                        setPhase('ready');
                      }}
                    >
                      Discard round
                    </button>
                  )}
                </Notice>
              )}
            </Game>
            <Rankings aria-label="Leaderboards">
              <h3>🏆 HIGH SCORES</h3>
              <Tabs role="group" aria-label="Rankings period">
                <button aria-pressed={ranking === 'weekly'} onClick={() => setRanking('weekly')}>
                  THIS WEEK
                </button>
                <button aria-pressed={ranking === 'allTime'} onClick={() => setRanking('allTime')}>
                  ALL TIME
                </button>
              </Tabs>
              {boardError && (
                <Notice role="alert">
                  Rankings unavailable<button onClick={() => void loadBoards()}>Retry rankings</button>
                </Notice>
              )}
              {!boards && !boardError && <p>Loading…</p>}
              {boards &&
                (boards[ranking].length ? (
                  <ol>
                    {boards[ranking].map((r, i) => (
                      <li key={r.username}>
                        <b>{String(i + 1).padStart(2, '0')}</b>
                        <span>{r.username}</span>
                        <strong>{r.score}</strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>No scores yet</p>
                ))}
              <Best>
                <span>PERSONAL BEST</span>
                <strong>
                  {auth ? (boards?.[ranking].find((r) => r.username === auth.username)?.score ?? '—') : '—'}
                </strong>
              </Best>
            </Rankings>
          </Body>
        </Modal>
      )}
    </>
  );
}
