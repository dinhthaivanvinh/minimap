// The form for a new vote: name, end time, options, voters and the settings that are
// fixed once it is made. It checks the same rules as the server (shared/vote.ts) first.
import { useState, type FormEvent } from 'react';
import styled from 'styled-components';
import type { TeamUser } from '../../shared/types.ts';
import { cleanNewVote, MAX_OPTION, MAX_OPTIONS, MAX_TITLE, MIN_OPTIONS, VoteRuleError, type VoteView } from '../../shared/vote.ts';
import { api, errorText } from '../lib/api.ts';
import { useMessage } from '../lib/hooks.ts';
import { fromLocalInput, localInputValue, quickEnds } from '../lib/voteTime.ts';
import { theme } from '../styles/theme.ts';
import { Button, Chip, Chips, Field, FieldLabel, Input, PanelHint, Row, Segmented, StackPanel } from '../styles/ui.ts';
import { StatusLine } from './SheetNav.tsx';

const Group = styled.fieldset`
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;

  legend { padding: 0; margin-bottom: 4px; }
`;

const Check = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-weight: 700;

  input { width: 18px; height: 18px; margin-top: 3px; accent-color: ${theme.ink}; }
  small { display: block; color: ${theme.inkSoft}; font-weight: 600; }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

export function VoteForm({ users, me, token, onCreated, onCancel }: {
  users: TeamUser[];
  me: string;
  token: string;
  onCreated: (vote: VoteView) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [endsAt, setEndsAt] = useState(() => quickEnds(new Date())[0]?.at ?? '');
  const [options, setOptions] = useState(['', '']);
  const [voters, setVoters] = useState(() => new Set(users.map((u) => u.username)));
  const [multi, setMulti] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [allowCustom, setAllowCustom] = useState(false);
  const [showOnMap, setShowOnMap] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, show] = useMessage();
  const members = users.map((u) => u.username);

  function toggle(username: string) {
    const next = new Set(voters);
    if (next.has(username)) next.delete(username);
    else next.add(username);
    setVoters(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = {
      title,
      endsAt,
      // Empty rows are just unused, so they don't count as options.
      options: options.filter((o) => o.trim()),
      voters: members.filter((name) => voters.has(name)),
      multi,
      allowCustom,
      anonymous,
      showOnMap,
    };
    try {
      cleanNewVote(body, { now: new Date(), members, owner: me });
    } catch (err) {
      if (err instanceof VoteRuleError) return show(err.message, true);
      throw err;
    }
    setSending(true);
    try {
      onCreated(await api<VoteView>('POST', '/api/vote', body, { Authorization: `Bearer ${token}` }));
    } catch (err) {
      show(errorText(err), true);
      setSending(false);
    }
  }

  return (
    <StackPanel as="form" onSubmit={submit} aria-label="New vote">
      <h2>New vote</h2>
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input value={title} maxLength={MAX_TITLE} placeholder="Team lunch" onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <Field>
        <FieldLabel>Ends</FieldLabel>
        <Input type="datetime-local" value={localInputValue(endsAt)} onChange={(e) => setEndsAt(fromLocalInput(e.target.value))} />
      </Field>
      <Chips role="group" aria-label="Quick end times">
        {quickEnds(new Date()).map((pick) => (
          <Chip key={pick.label} type="button" aria-pressed={pick.at === endsAt} onClick={() => setEndsAt(pick.at)}>
            {pick.label}
          </Chip>
        ))}
      </Chips>

      <Group>
        <legend><FieldLabel>Options</FieldLabel></legend>
        {options.map((option, i) => (
          <Row key={i}>
            <Input
              value={option}
              maxLength={MAX_OPTION}
              aria-label={`Option ${i + 1}`}
              placeholder={`Option ${i + 1}`}
              onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
            />
            <Button
              type="button"
              $small
              aria-label={`Remove option ${i + 1}`}
              disabled={options.length <= MIN_OPTIONS}
              onClick={() => setOptions(options.filter((_, j) => j !== i))}
            >
              ✕
            </Button>
          </Row>
        ))}
        <div>
          <Button type="button" $small disabled={options.length >= MAX_OPTIONS} onClick={() => setOptions([...options, ''])}>
            Add an option
          </Button>
        </div>
      </Group>

      <Group>
        <legend><FieldLabel>Who can vote</FieldLabel></legend>
        <Actions>
          <Button type="button" $small onClick={() => setVoters(new Set(members))}>Everyone</Button>
          <Button type="button" $small onClick={() => setVoters(new Set([me]))}>Clear</Button>
        </Actions>
        <Chips>
          {users.map((user) => (
            <Chip
              key={user.username}
              type="button"
              aria-pressed={user.username === me || voters.has(user.username)}
              disabled={user.username === me}
              title={user.username === me ? 'You are always invited to your own vote' : undefined}
              onClick={() => toggle(user.username)}
            >
              {user.nickname}
            </Chip>
          ))}
        </Chips>
      </Group>

      <PanelHint style={{ margin: 0 }}>Choice, custom options and privacy can't be changed once the vote is made.</PanelHint>
      <Actions>
        <Segmented role="group" aria-label="Choice">
          <button type="button" aria-pressed={!multi} onClick={() => setMulti(false)}>Single choice</button>
          <button type="button" aria-pressed={multi} onClick={() => setMulti(true)}>Multiple</button>
        </Segmented>
        <Segmented role="group" aria-label="Privacy">
          <button type="button" aria-pressed={!anonymous} onClick={() => setAnonymous(false)}>Named</button>
          <button type="button" aria-pressed={anonymous} onClick={() => setAnonymous(true)}>Anonymous</button>
        </Segmented>
      </Actions>
      <Check>
        <input type="checkbox" checked={allowCustom} onChange={(e) => setAllowCustom(e.target.checked)} />
        <span>Custom options<small>Voters can add options while the vote is open, up to {MAX_OPTIONS}.</small></span>
      </Check>
      <Check>
        <input type="checkbox" checked={showOnMap} onChange={(e) => setShowOnMap(e.target.checked)} />
        <span>Show on the map<small>People who haven't voted get a small marker on the map.</small></span>
      </Check>
      <PanelHint style={{ margin: 0 }}>
        {anonymous ? 'Anonymous: only counts are shown, to everyone.' : 'Named: everyone can see who picked each option.'}
      </PanelHint>

      <Actions>
        <Button type="submit" $primary disabled={sending}>Start the vote</Button>
        <Button type="button" onClick={onCancel}>Cancel</Button>
      </Actions>
      <StatusLine message={message} />
    </StackPanel>
  );
}
