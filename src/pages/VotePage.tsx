// Team votes page (/vote): open votes and history, the form for a new vote, and each vote's ballot and results.
// `/vote?id=<id>` is a vote's shared link: it opens that vote, or says the vote is gone.
import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { closedNewestFirst, isOpen, mapSummary, type VoteView } from '../../shared/vote.ts';
import { SheetNav } from '../components/SheetNav.tsx';
import { VoteCard, type Viewer } from '../components/VoteCard.tsx';
import { VoteForm } from '../components/VoteForm.tsx';
import { api } from '../lib/api.ts';
import { useNow, useTeamState } from '../lib/hooks.ts';
import { savedAdminPassword, savedLogin } from '../lib/savedLogin.ts';
import { theme } from '../styles/theme.ts';
import { Button, Count, Panel, PanelHint, Segmented, Sheet } from '../styles/ui.ts';

type Tab = 'open' | 'history';

const Head = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;

  h1 { flex: 1 1 100%; font-size: 30px; }
`;

const Spacer = styled.div`
  flex: 1;
`;

const Empty = styled(Panel)`
  color: ${theme.inkSoft};
  text-align: center;
`;

export function VotePage() {
  const { state, votes: liveVotes } = useTeamState();
  const [auth] = useState(() => savedLogin());
  const [adminPassword] = useState(() => savedAdminPassword());
  const [votes, setVotes] = useState<VoteView[] | null>(null);
  // Read again when the votes change, so a vote closed early moves to History straight away.
  const now = useNow(15_000, votes);
  // The viewer's own picks, which the live updates never carry.
  const [mine, setMine] = useState<ReadonlyMap<string, string[]>>(new Map());
  const [tab, setTab] = useState<Tab>('open');
  const [creating, setCreating] = useState(false);
  const [linked] = useState(() => new URLSearchParams(location.search).get('id'));
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    document.title = 'Team votes';
  }, []);

  // The username is only trusted while it is still on the team.
  const username = auth && state?.users.some((u) => u.username === auth.username) ? auth.username : null;
  const viewer: Viewer = { username, token: username ? auth!.token : null, adminPassword };

  useEffect(() => {
    if (liveVotes) setVotes(liveVotes);
  }, [liveVotes]);

  // One request with the login, for this person's own picks.
  useEffect(() => {
    if (!auth) return;
    api<{ votes: VoteView[] }>('GET', '/api/vote', undefined, { Authorization: `Bearer ${auth.token}` })
      .then((reply) => {
        setMine(new Map(reply.votes.flatMap((v) => (v.mine ? [[v.id, v.mine] as const] : []))));
        setVotes((current) => current ?? reply.votes);
      })
      .catch(() => {}); // The live updates still show every vote.
  }, [auth]);

  const changed = useCallback((vote: VoteView) => {
    setVotes((current) => {
      const list = current ?? [];
      return list.some((v) => v.id === vote.id) ? list.map((v) => (v.id === vote.id ? vote : v)) : [...list, vote];
    });
    const picks = vote.mine;
    if (picks) setMine((current) => new Map(current).set(vote.id, picks));
  }, []);

  const deleted = useCallback((id: string) => setVotes((current) => current?.filter((v) => v.id !== id) ?? null), []);

  const openVotes = useMemo(() => mapSummary(votes ?? [], now), [votes, now]);
  const history = useMemo(() => closedNewestFirst(votes ?? [], now), [votes, now]);

  // A link to one vote opens the right tab, then scrolls to it and highlights it for a moment.
  useEffect(() => {
    if (!linked || !votes) return;
    const vote = votes.find((v) => v.id === linked);
    if (!vote) {
      setMissing(true);
      return;
    }
    setTab(isOpen(vote, new Date()) ? 'open' : 'history');
    setHighlighted(linked);
    requestAnimationFrame(() => document.getElementById(`vote-${linked}`)?.scrollIntoView({ block: 'start' }));
    const timer = setTimeout(() => setHighlighted(null), 4000);
    return () => clearTimeout(timer);
    // Only once, when the votes first arrive.
  }, [linked, votes === null]);

  const nameOf = useCallback(
    (name: string) => state?.users.find((u) => u.username === name)?.nickname ?? 'a former member',
    [state],
  );

  const shown = tab === 'open' ? openVotes : history;

  return (
    <Sheet>
      <SheetNav links={[{ href: '/', label: 'Map' }, { href: '/me', label: 'My status' }]} />
      <Head>
        <h1>Team votes</h1>
        <Segmented role="group" aria-label="Show votes">
          <button type="button" aria-pressed={tab === 'open'} onClick={() => setTab('open')}>
            Open<Count>{openVotes.length}</Count>
          </button>
          <button type="button" aria-pressed={tab === 'history'} onClick={() => setTab('history')}>
            History<Count>{history.length}</Count>
          </button>
        </Segmented>
        <Spacer />
        {username && !creating && (
          <Button type="button" $primary onClick={() => setCreating(true)}>New vote</Button>
        )}
      </Head>
      {!username && state && (
        <PanelHint style={{ marginTop: 12 }}>
          Log in on <a href="/me">My status</a> to vote or start a vote.
        </PanelHint>
      )}

      {missing && (
        <PanelHint role="status" style={{ marginTop: 12 }}>
          The vote in this link isn't here anymore. It may have been deleted, or dropped from History as an old vote.
        </PanelHint>
      )}

      {creating && state && username && viewer.token && (
        <VoteForm
          users={state.users}
          me={username}
          token={viewer.token}
          onCancel={() => setCreating(false)}
          onCreated={(vote) => {
            changed(vote);
            setCreating(false);
            setTab('open');
          }}
        />
      )}

      {votes && !shown.length && (
        <Empty>{tab === 'open' ? 'No open votes right now.' : 'Closed votes appear here.'}</Empty>
      )}
      {shown.map((vote) => (
        <VoteCard
          key={vote.id}
          vote={vote}
          mine={mine.get(vote.id)}
          viewer={viewer}
          now={now}
          highlighted={highlighted === vote.id}
          publicUrl={state?.settings.publicUrl ?? ''}
          nameOf={nameOf}
          onChanged={changed}
          onDeleted={deleted}
        />
      ))}
    </Sheet>
  );
}
