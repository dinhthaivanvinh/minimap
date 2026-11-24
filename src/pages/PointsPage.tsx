// Reward points page (/points): the whole team's board, your own points and today's earnings with
// the Claim button (which asks whether you're done for the day), the rules, and the last few days
// and hand changes.
import { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { pointsText, windowsText, workdaysText, type PointsMe, type PointsView } from '../../shared/points.ts';
import { SheetNav, StatusLine } from '../components/SheetNav.tsx';
import { api, errorText } from '../lib/api.ts';
import { useMessage, useTeamState } from '../lib/hooks.ts';
import { placeName } from '../lib/layout.ts';
import { savedLogin } from '../lib/savedLogin.ts';
import { theme } from '../styles/theme.ts';
import { Button, Panel, PanelHint } from '../styles/ui.ts';

const Page = styled.div`
  width: min(640px, 100%);
  margin: 0 auto;
  padding: 0 16px 40px;

  h1 { font-size: 30px; }
`;

const Big = styled.p`
  margin: 0;
  font: 800 40px/1.1 ${theme.displayFont};

  small { margin-left: 8px; color: ${theme.inkSoft}; font-size: 18px; }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  th, td { padding: 6px 4px; border-bottom: ${theme.dashedLine}; text-align: left; }
  th { color: ${theme.inkSoft}; font-size: 14px; }
  td:last-child, th:last-child, td.num { text-align: right; white-space: nowrap; }
  tr[data-me='true'] td { background: ${theme.hover}; font-weight: 800; }
`;

const Plus = styled.span`
  color: ${theme.inkSoft};
  font-size: 14px;
`;

const ClaimBox = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: 10px;
  padding: 10px 12px;
  border: ${theme.dashedLine};
  border-radius: 12px;
`;

const Dialog = styled.dialog`
  width: min(420px, calc(100% - 32px));
  padding: 18px;
  border: ${theme.line};
  border-radius: 22px;
  background: ${theme.paper};
  color: ${theme.ink};
  box-shadow: 0 12px 50px #2a265744;

  h2 { margin: 0 0 8px; font-size: 22px; }
  p { margin: 0 0 14px; }
  &::backdrop { background: #2a265777; }
`;

const Choices = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

/** Asks whether someone is done for the day before claiming: going Off stops their time counting. */
function ClaimDialog({ amount, more, onChoose, onCancel }: { amount: number; more: string; onChoose: (goOff: boolean) => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <Dialog ref={ref} aria-labelledby="claim-title" onCancel={(e) => (e.preventDefault(), onCancel())}>
      <h2 id="claim-title">Claim {pointsText(amount)}?</h2>
      <p>Are you done for today? Going Off stops your time counting. If you’re still working, you keep earning and can claim the rest {more}.</p>
      <Choices>
        <Button type="button" $primary onClick={() => onChoose(false)}>
          Claim, still working
        </Button>
        <Button type="button" onClick={() => onChoose(true)}>
          Claim and go Off
        </Button>
        <Button type="button" onClick={onCancel}>
          Cancel
        </Button>
      </Choices>
    </Dialog>
  );
}

const List = styled.ul`
  margin: 0;
  padding-left: 18px;

  li { margin: 2px 0; }
`;

/** When the rest can be claimed after this claim: later in this window, or in the next one. */
function laterText(view: PointsView, me: PointsMe): string {
  const next = view.settings.claimWindows.find((w) => me.window && w.from > me.window.from);
  return next ? `from ${next.from} to ${next.to}` : `until ${me.window?.to ?? 'the end of the day'}`;
}

const dayText = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export function PointsPage() {
  const { state, points: live } = useTeamState();
  const [auth] = useState(() => savedLogin());
  const [view, setView] = useState<PointsView | null>(null);
  const [me, setMe] = useState<PointsMe | null>(null);
  const [message, showMessage] = useMessage();
  const [claiming, setClaiming] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    document.title = 'Reward points';
  }, []);

  useEffect(() => {
    if (live) setView(live);
  }, [live]);

  // The username is only trusted while it is still on the team.
  const username = auth && state?.users.some((u) => u.username === auth.username) ? auth.username : null;
  const headers = auth ? { Authorization: `Bearer ${auth.token}` } : undefined;

  const loadMe = useCallback(() => {
    if (!auth) return;
    api<PointsMe>('GET', '/api/points/me', undefined, { Authorization: `Bearer ${auth.token}` })
      .then(setMe)
      .catch(() => {}); // The board still shows without it.
  }, [auth]);

  // Read again when the board changes, which is also when someone moves, and each minute.
  useEffect(() => {
    loadMe();
    const timer = setInterval(loadMe, 60_000);
    return () => clearInterval(timer);
  }, [loadMe, live, state]);

  async function claim(goOff: boolean) {
    setAsking(false);
    setClaiming(true);
    try {
      const amount = me?.toClaim ?? 0;
      setMe(await api<PointsMe>('POST', '/api/points/claim', {}, headers));
      if (goOff) {
        try {
          await api('PATCH', '/api/me', { place: 'off' }, headers);
        } catch (err) {
          showMessage(`Claimed ${pointsText(amount)}, but you’re still checked in: ${errorText(err)}`, true);
          return;
        }
        loadMe();
      }
      showMessage(goOff ? `Claimed ${pointsText(amount)}. You’re Off now. See you tomorrow!` : `Claimed ${pointsText(amount)}. Keep it up!`);
    } catch (err) {
      showMessage(errorText(err), true);
    } finally {
      setClaiming(false);
    }
  }

  // Only someone still earning has a choice to make; anyone else just claims.
  const startClaim = () => (me?.inOffice ? setAsking(true) : void claim(false));

  const nameOf = (name: string) => state?.users.find((u) => u.username === name)?.nickname ?? 'a former member';
  const offices = view && state ? view.settings.offices.map((id) => placeName(state.places, id)) : [];
  const officeText = offices.length ? offices.join(' or ') : 'the office';
  const mine = view?.board.find((line) => line.username === username);
  const myDays = view?.history.flatMap((d) => d.lines.filter((l) => l.username === username).map((l) => ({ day: d.day, ...l }))) ?? [];

  return (
    <Page>
      <SheetNav links={[{ href: '/', label: 'Map' }, { href: '/me', label: 'My status' }, { href: '/vote', label: 'Votes' }]} />
      <h1>Reward points</h1>

      {view && (
        <Panel aria-labelledby="mine">
          <h2 id="mine">Your points</h2>
          {!username && (
            <PanelHint style={{ margin: 0 }}>
              Log in on <a href="/me">My status</a> to see your points.
            </PanelHint>
          )}
          {username && mine && (
            <>
              <Big>
                {mine.balance}
                <small>{mine.balance === 1 ? 'point' : 'points'}</small>
              </Big>
              {me && me.toClaim > 0 && (
                <ClaimBox>
                  <PanelHint style={{ margin: 0 }}>
                    {pointsText(me.toClaim)} earned today, waiting to be claimed.{' '}
                    {me.claimOpen && me.window && `You can claim until ${me.window.to}.`}
                    {!me.claimOpen && me.window && `Claiming opens at ${me.window.from}.`}
                    {!me.window && `Claiming is closed for today, so these are lost at ${view.resetAt}.`}
                  </PanelHint>
                  {me.claimOpen && (
                    <Button type="button" $primary onClick={startClaim} disabled={claiming}>
                      Claim {pointsText(me.toClaim)}
                    </Button>
                  )}
                  {asking && (
                    <ClaimDialog
                      amount={me.toClaim}
                      more={laterText(view, me)}
                      onChoose={(goOff) => void claim(goOff)}
                      onCancel={() => setAsking(false)}
                    />
                  )}
                </ClaimBox>
              )}
              {me && !me.inOffice && (
                <PanelHint style={{ margin: '8px 0 0' }}>
                  {me.checkedIn ? `You’re checked in. Move to ${officeText} to earn points.` : `Check in on My status. ${officeText} earns points.`}
                </PanelHint>
              )}
              {me?.inOffice && (
                <PanelHint style={{ margin: '8px 0 0' }}>You’re earning in {officeText} ({me.minutesToday} {me.minutesToday === 1 ? 'minute' : 'minutes'} counted today).</PanelHint>
              )}
              <StatusLine message={message} />
            </>
          )}
        </Panel>
      )}

      <Panel aria-labelledby="board">
        <h2 id="board">Team board</h2>
        {!view && <PanelHint style={{ margin: 0 }}>Loading…</PanelHint>}
        {view && !view.board.length && <PanelHint style={{ margin: 0 }}>Nobody is on the team yet.</PanelHint>}
        {view && view.board.length > 0 && (
          <Table>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Name</th>
                <th scope="col">Points</th>
              </tr>
            </thead>
            <tbody>
              {view.board.map((line, i) => (
                <tr key={line.username} data-me={line.username === username}>
                  <td>{i + 1}</td>
                  <td>{nameOf(line.username)}</td>
                  <td>
                    {line.balance}
                    {line.toClaim > 0 && <Plus> (+{line.toClaim} to claim)</Plus>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      {view && (
        <Panel aria-labelledby="rules">
          <h2 id="rules">How it works</h2>
          <List>
            <li>
              {pointsText(view.settings.perHour)} for each hour in {officeText}, {view.settings.start} to {view.settings.end},{' '}
              {workdaysText(view.settings.workdays)}, up to {view.settings.dailyCapHours} hours a day.
            </li>
            {view.settings.missPenalty > 0 && (
              <li>
                Not checking in at all on a workday costs {pointsText(view.settings.missPenalty)}. Work from home, Out of Office and Off all
                count as checking in. A day when nobody checks in costs nobody anything.
              </li>
            )}
            <li>
              Earned points wait for you to claim them on this page, from {windowsText(view.settings.claimWindows)}. Claim as often as you
              like: each claim takes everything earned so far, and you keep earning after it. Points not claimed by {view.resetAt} the next
              morning are lost.
            </li>
            <li>Points never go below zero.</li>
          </List>
        </Panel>
      )}

      {view && username && myDays.length > 0 && (
        <Panel aria-labelledby="days">
          <h2 id="days">Your last days</h2>
          <Table>
            <tbody>
              {myDays.map((d) => (
                <tr key={d.day}>
                  <td>{dayText(d.day)}</td>
                  <td className="num">
                    {[d.earned > 0 && `+${d.earned}`, d.lost > 0 && `${d.lost} not claimed`, d.penalty > 0 && `−${d.penalty} (no check-in)`]
                      .filter(Boolean)
                      .join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}

      {view && view.adjustments.length > 0 && (
        <Panel aria-labelledby="changes">
          <h2 id="changes">Changes by the admin</h2>
          <Table>
            <tbody>
              {view.adjustments.map((a) => (
                <tr key={`${a.at}-${a.username}`}>
                  <td>{nameOf(a.username)}</td>
                  <td>{a.reason}</td>
                  <td>{a.amount > 0 ? `+${a.amount}` : `−${-a.amount}`}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      )}
    </Page>
  );
}
