// One vote on the /vote page: its details, the ballot for invited people while it is open,
// the results, and the creator's and admin's controls (extend, close early, delete).
import { useEffect, useState, type FormEvent } from 'react';
import styled, { css } from 'styled-components';
import { canVote, isOpen, MAX_OPTION, type VoteView } from '../../shared/vote.ts';
import { api, errorText } from '../lib/api.ts';
import { useMessage } from '../lib/hooks.ts';
import { endsText, fromLocalInput, localInputValue } from '../lib/voteTime.ts';
import { theme } from '../styles/theme.ts';
import { Button, Input, Panel, Row } from '../styles/ui.ts';
import { BALLOT_DROP_MS, BallotDrop } from './BallotDrop.tsx';
import { StatusLine } from './SheetNav.tsx';
import { VoteResults } from './VoteResults.tsx';

const Card = styled(Panel)<{ $highlighted: boolean }>`
  display: grid;
  gap: 10px;
  scroll-margin-top: 16px;

  h2 { margin: 0; overflow-wrap: anywhere; }

  ${({ $highlighted }) => $highlighted && css`
    outline: 4px solid ${theme.focus};
    outline-offset: 3px;
  `}
`;

const Meta = styled.p`
  margin: -6px 0 0;
  color: ${theme.inkSoft};
  font-weight: 700;
`;

const Tags = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    padding: 0 9px;
    border: ${theme.thinLine};
    border-radius: 10px;
    background: ${theme.white};
    font-size: 13px;
    font-weight: 800;
  }
`;

const Choices = styled.fieldset`
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;
`;

const Choice = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  border: ${theme.thinLine};
  border-radius: 12px;
  background: ${theme.white};
  font-weight: 800;
  cursor: pointer;
  overflow-wrap: anywhere;

  &:has(input:checked) { background: ${theme.butter}; }
  input { flex: none; width: 18px; height: 18px; accent-color: ${theme.ink}; }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const Note = styled.p`
  margin: 0;
  font-weight: 700;
`;

export interface Viewer {
  /** Who is logged in on this browser, if anyone. */
  username: string | null;
  token: string | null;
  /** The admin password saved in this browser, if any. */
  adminPassword: string;
}

export function VoteCard({ vote, mine, viewer, now, highlighted, nameOf, onChanged, onDeleted }: {
  vote: VoteView;
  mine: string[] | undefined;
  viewer: Viewer;
  now: Date;
  highlighted: boolean;
  nameOf: (username: string) => string;
  onChanged: (vote: VoteView) => void;
  onDeleted: (id: string) => void;
}) {
  const open = isOpen(vote, now);
  const me = viewer.username;
  const invited = me !== null && vote.voters.includes(me);
  const hasVoted = me !== null && vote.voted.includes(me);
  const [changing, setChanging] = useState(false);
  const [picks, setPicks] = useState<string[]>([]);
  const [newOption, setNewOption] = useState('');
  const [extending, setExtending] = useState(false);
  const [newEnd, setNewEnd] = useState(vote.endsAt);
  const [busy, setBusy] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [message, show] = useMessage(4000);
  const auth: Record<string, string> = viewer.token ? { Authorization: `Bearer ${viewer.token}` } : {};
  const voting = me !== null && canVote(vote, me, now) && (!hasVoted || changing);
  const isOwner = me !== null && vote.owner === me;

  async function send<T>(method: string, path: string, body: unknown, headers: Record<string, string> = auth): Promise<T | null> {
    setBusy(true);
    try {
      return await api<T>(method, path, body, headers);
    } catch (err) {
      show(errorText(err), true);
      return null;
    } finally {
      setBusy(false);
    }
  }

  function startChanging() {
    setPicks(mine ?? []);
    setChanging(true);
  }

  function pick(id: string, on: boolean) {
    if (!vote.multi) setPicks([id]);
    else setPicks(on ? [...picks, id] : picks.filter((p) => p !== id));
  }

  async function castBallot(event: FormEvent) {
    event.preventDefault();
    if (!picks.length) return show(vote.multi ? 'Pick at least one option.' : 'Pick one option.', true);
    const reply = await send<VoteView>('POST', `/api/vote/${encodeURIComponent(vote.id)}/ballot`, { choices: picks });
    if (!reply) return;
    setChanging(false);
    onChanged(reply);
    setDropping(true);
  }

  useEffect(() => {
    if (!dropping) return;
    const timer = setTimeout(() => setDropping(false), BALLOT_DROP_MS);
    return () => clearTimeout(timer);
  }, [dropping]);

  async function addOption() {
    const reply = await send<VoteView>('POST', `/api/vote/${encodeURIComponent(vote.id)}/options`, { text: newOption });
    if (!reply) return;
    setNewOption('');
    onChanged(reply);
    // Pick the new option straight away, which is usually why it was added.
    const added = reply.options.find((o) => o.text.toLowerCase() === newOption.trim().replace(/\s+/g, ' ').toLowerCase());
    if (added) pick(added.id, true);
  }

  async function extend() {
    const reply = await send<VoteView>('PATCH', `/api/vote/${encodeURIComponent(vote.id)}`, { endsAt: newEnd });
    if (!reply) return;
    setExtending(false);
    onChanged(reply);
    show('End time changed.');
  }

  // The creator closes with their login. Anyone else uses the saved admin password.
  const ownerOrAdmin = (): Record<string, string> => (isOwner ? auth : { 'x-admin-password': viewer.adminPassword });

  async function close() {
    if (!confirm('Close this vote now? No one will be able to vote after this.')) return;
    const reply = await send<VoteView>('POST', `/api/vote/${encodeURIComponent(vote.id)}/close`, undefined, ownerOrAdmin());
    if (!reply) return;
    setExtending(false);
    setChanging(false);
    onChanged(reply);
  }

  async function remove() {
    if (!confirm("Delete this vote? This can't be undone.")) return;
    const headers = ownerOrAdmin();
    if (await send('DELETE', `/api/vote/${encodeURIComponent(vote.id)}`, undefined, headers)) onDeleted(vote.id);
  }

  const owner = vote.owner === null ? 'a former member' : nameOf(vote.owner);

  return (
    <Card id={`vote-${vote.id}`} $highlighted={highlighted} aria-label={vote.title}>
      <h2>{vote.title}</h2>
      <Meta>
        By {owner} · {endsText(vote.endsAt, now)} · {vote.voted.length} of {vote.voters.length} voted
      </Meta>
      <Tags aria-label="Settings">
        <li>{vote.multi ? 'Multiple choice' : 'Single choice'}</li>
        <li>{vote.anonymous ? 'Anonymous' : 'Named'}</li>
        {vote.allowCustom && <li>Custom options</li>}
      </Tags>

      {voting ? (
        <form onSubmit={castBallot}>
          <Choices aria-label={vote.multi ? 'Pick one or more' : 'Pick one'}>
            {vote.options.map((option) => (
              <Choice key={option.id}>
                <input
                  type={vote.multi ? 'checkbox' : 'radio'}
                  name={`vote-${vote.id}`}
                  checked={picks.includes(option.id)}
                  onChange={(e) => pick(option.id, e.target.checked)}
                />
                {option.text}
              </Choice>
            ))}
          </Choices>
          {vote.allowCustom && (
            <Row style={{ marginTop: 8 }}>
              <Input
                value={newOption}
                maxLength={MAX_OPTION}
                aria-label="Add an option"
                placeholder="Add an option"
                onChange={(e) => setNewOption(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (newOption.trim()) void addOption();
                }}
              />
              <Button type="button" disabled={busy || !newOption.trim()} onClick={() => void addOption()}>Add</Button>
            </Row>
          )}
          <Actions style={{ marginTop: 10 }}>
            <Button type="submit" $primary disabled={busy}>Vote</Button>
            {changing && <Button type="button" onClick={() => setChanging(false)}>Cancel</Button>}
          </Actions>
        </form>
      ) : (
        <>
          {dropping && <BallotDrop />}
          <VoteResults vote={vote} mine={mine} closed={!open} nameOf={nameOf} />
          {open && hasVoted && invited && (
            <Actions><Button type="button" onClick={startChanging}>Change vote</Button></Actions>
          )}
          {open && !me && (
            <Note>Log in on <a href="/me">My status</a> to vote.</Note>
          )}
          {open && me && !invited && <Note>You weren't invited to this vote.</Note>}
        </>
      )}

      {open && isOwner && extending && (
        <Row>
          <Input
            type="datetime-local"
            aria-label="New end time"
            value={localInputValue(newEnd)}
            onChange={(e) => setNewEnd(fromLocalInput(e.target.value))}
          />
          <Button type="button" disabled={busy} onClick={() => void extend()}>Save</Button>
        </Row>
      )}
      {(isOwner || viewer.adminPassword) && (
        <Actions>
          {open && isOwner && !extending && (
            <Button type="button" $small onClick={() => { setNewEnd(vote.endsAt); setExtending(true); }}>Change end time</Button>
          )}
          {open && <Button type="button" $small disabled={busy} onClick={() => void close()}>Close now</Button>}
          <Button type="button" $small disabled={busy} onClick={() => void remove()}>Delete</Button>
        </Actions>
      )}
      <StatusLine message={message} />
    </Card>
  );
}
