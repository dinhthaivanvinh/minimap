// Reward points page (/points): the whole team's board, your own points and stay in the office (with
// a button to check the office network again), the rules, and the last few days and hand changes.
import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { pointsText, workdaysText, type PointsMe, type PointsView } from '../../shared/points.ts';
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

const List = styled.ul`
  margin: 0;
  padding-left: 18px;

  li { margin: 2px 0; }
`;

const dayText = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export function PointsPage() {
  const { state, points: live } = useTeamState();
  const [auth] = useState(() => savedLogin());
  const [view, setView] = useState<PointsView | null>(null);
  const [me, setMe] = useState<PointsMe | null>(null);
  const [message, showMessage] = useMessage();
  const [checking, setChecking] = useState(false);

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

  async function checkAgain() {
    setChecking(true);
    try {
      setMe(await api<PointsMe>('POST', '/api/points/here', {}, headers));
      showMessage('You’re on the office network. Your time counts from now.');
    } catch (err) {
      showMessage(errorText(err), true);
    } finally {
      setChecking(false);
    }
  }

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
                {mine.balance + mine.today}
                <small>{mine.today > 0 ? `+${mine.today} today so far` : 'points'}</small>
              </Big>
              {me && !me.inOffice && (
                <PanelHint style={{ margin: '8px 0 0' }}>
                  {me.checkedIn ? `You’re checked in. Move to ${officeText} to earn points.` : `Check in on My status. ${officeText} earns points.`}
                </PanelHint>
              )}
              {me?.inOffice && me.verified && (
                <PanelHint style={{ margin: '8px 0 0' }}>You’re earning in {officeText} ({me.minutesToday} {me.minutesToday === 1 ? 'minute' : 'minutes'} counted today).</PanelHint>
              )}
              {me?.inOffice && !me.verified && (
                <>
                  <PanelHint style={{ margin: '8px 0 8px' }}>
                    You’re checked in to {officeText}, but your device isn’t on the office network, so this time doesn’t earn points yet. Join
                    the office Wi-Fi and turn off any VPN, then check again.
                  </PanelHint>
                  <Button type="button" onClick={() => void checkAgain()} disabled={checking}>
                    Check again
                  </Button>
                </>
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
                    {line.balance + line.today}
                    {line.today > 0 && <Plus> (+{line.today} today)</Plus>}
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
            <li>Points never go below zero. Today’s points move into your balance when the day ends.</li>
            {view.settings.ipCheck && <li>Time only counts while you’re on the office network, so a VPN can stop you earning.</li>}
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
                    {d.earned > 0 && `+${d.earned}`}
                    {d.earned > 0 && d.penalty > 0 && ' '}
                    {d.penalty > 0 && `−${d.penalty} (no check-in)`}
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
