// User page: claim a username, then set nickname, place and status.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import styled from 'styled-components';
import type { AuthResult, ScheduledChangeRequest, TeamState, TeamUser } from '../../shared/types.ts';
import { CharacterEditor } from '../components/CharacterEditor.tsx';
import { FundPanel } from '../components/FundPanel.tsx';
import { Mochi } from '../components/Mochi.tsx';
import { SheetNav, StatusLine } from '../components/SheetNav.tsx';
import { api, ApiFailure, errorText } from '../lib/api.ts';
import { useMessage, useTeamState, type Message } from '../lib/hooks.ts';
import { clockTime, nextInstant, timeInputValue } from '../lib/status.ts';
import { theme } from '../styles/theme.ts';
import { Button, Chip, Chips, Field, FieldLabel, Input, Panel, PanelHint, Row, Sheet, StackPanel } from '../styles/ui.ts';

const AUTH_KEY = 'minimap.auth';
const OFFICE_ICONS = ['🏢', '🏬'];

const Hero = styled(Panel)`
  display: flex;
  align-items: center;
  gap: 14px;

  h1 { font-size: 30px; overflow-wrap: anywhere; }
  p { margin: 0; color: ${theme.inkSoft}; font-weight: 700; }
`;

const HeroAvatar = styled.div`
  flex: none;
  width: 76px;
  height: 76px;
`;

const LogOutButton = styled(Button)`
  margin-left: auto;
`;

const ChoiceGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
`;

const Choice = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 64px;
  padding: 8px 12px;
  border: ${theme.line};
  border-radius: 16px;
  background: ${theme.white};
  box-shadow: 0 4px 0 ${theme.ink};
  font-family: ${theme.displayFont};
  font-size: 18px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;

  &:hover { background: ${theme.hover}; }
  &:active { transform: translateY(4px); box-shadow: none; }
  &[aria-pressed='true'] { background: ${theme.butter}; }
`;

const GroupLabel = styled(FieldLabel)`
  display: block;
  margin: 12px 0 6px;

  &:first-of-type { margin-top: 0; }
`;

const ChoiceIcon = styled.span`
  font-size: 26px;
  line-height: 1;
`;

const PendingTime = styled.p`
  margin: 0;
  font-family: ${theme.displayFont};
  font-size: 18px;
  font-weight: 700;
`;

const PendingMessage = styled.p`
  margin: 0;
  overflow-wrap: anywhere;
`;

function loadAuth(): AuthResult | null {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null') as AuthResult | null;
  } catch {
    return null;
  }
}

function storeAuth(value: AuthResult | null): void {
  try {
    if (value) localStorage.setItem(AUTH_KEY, JSON.stringify(value));
    else localStorage.removeItem(AUTH_KEY);
  } catch {}
}

// ---- Choosing a username ------------------------------------------------

function PickPanel({ users, note, onPick }: { users: TeamUser[]; note: string; onPick: (username: string) => void }) {
  const sorted = [...users].sort((a, b) => a.username.localeCompare(b.username));
  return (
    <Panel>
      <h2>Who are you?</h2>
      <PanelHint>{note || (users.length ? 'Pick your username.' : 'There are no usernames yet. Ask your admin to add yours.')}</PanelHint>
      <Chips>
        {sorted.map((user) => (
          <Chip key={user.username} type="button" onClick={() => onPick(user.username)}>
            {user.username} <small>{user.claimed ? 'claimed' : 'available'}</small>
          </Chip>
        ))}
      </Chips>
    </Panel>
  );
}

function PinPanel({ user, onDone, onBack }: { user: TeamUser; onDone: (auth: AuthResult) => void; onBack: () => void }) {
  const [pin, setPin] = useState('');
  const [message, showMessage] = useMessage();

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      onDone(await api<AuthResult>('POST', user.claimed ? '/api/login' : '/api/claim', { username: user.username, pin }));
    } catch (err) {
      showMessage(errorText(err), true);
    }
  }

  return (
    <StackPanel as="form" onSubmit={submit}>
      <h2>{user.claimed ? `Log in as ${user.username}` : `Claim ${user.username}`}</h2>
      <PanelHint>
        {user.claimed
          ? 'Enter the PIN you chose. If you forgot it, ask your admin to release this username.'
          : 'Choose a PIN. You will use it to log in on other devices.'}
      </PanelHint>
      <Field>
        <FieldLabel>4-digit PIN</FieldLabel>
        <Input
          type="password"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          autoComplete="off"
          required
          autoFocus
          value={pin}
          onChange={(event) => setPin(event.target.value)}
        />
      </Field>
      <Row>
        <Button $primary type="submit">{user.claimed ? 'Log in' : 'Claim username'}</Button>
        <Button type="button" onClick={onBack}>Back</Button>
      </Row>
      <StatusLine message={message} />
    </StackPanel>
  );
}

// ---- Scheduling ---------------------------------------------------------

interface SchedulePanelProps {
  user: TeamUser;
  message: Message;
  onSave: (scheduled: ScheduledChangeRequest | null, done: string) => Promise<boolean>;
}

function SchedulePanel({ user, message, onSave }: SchedulePanelProps) {
  const pending = user.scheduled ?? null;
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');

  // It fired or was cancelled, perhaps on another device, so what's in the form is out of date.
  const hasPending = Boolean(pending);
  useEffect(() => {
    if (hasPending) return;
    setEditing(false);
    setTime('');
    setNote('');
  }, [hasPending]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const at = nextInstant(time);
    if (await onSave({ at, status: note }, `Out of Office scheduled for ${clockTime(at)}`)) setEditing(false);
  }

  if (pending && !editing) {
    return (
      <StackPanel>
        <h2>Schedule a change</h2>
        <PendingTime>Out of Office at {clockTime(pending.at)}</PendingTime>
        {pending.status && <PendingMessage>{pending.status}</PendingMessage>}
        <Row>
          <Button
            type="button"
            onClick={() => {
              setTime(timeInputValue(pending.at));
              setNote(pending.status);
              setEditing(true);
            }}
          >
            Edit
          </Button>
          <Button type="button" onClick={() => void onSave(null, 'Scheduled change cancelled')}>Cancel</Button>
        </Row>
        <StatusLine message={message} />
      </StackPanel>
    );
  }

  return (
    <StackPanel as="form" onSubmit={(event) => void submit(event)}>
      <h2>Schedule a change</h2>
      <PanelHint>Move to Out of Office later on, even with this page closed.</PanelHint>
      <Field>
        <FieldLabel>Out of Office at</FieldLabel>
        <Input type="time" required value={time} onChange={(event) => setTime(event.target.value)} />
      </Field>
      <Field>
        <FieldLabel>Status message (optional)</FieldLabel>
        <Input maxLength={140} placeholder="Dentist appointment" value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <Row>
        <Button $primary type="submit">{editing ? 'Save' : 'Schedule'}</Button>
        {editing && <Button type="button" onClick={() => setEditing(false)}>Back</Button>}
      </Row>
      <StatusLine message={message} />
    </StackPanel>
  );
}

// ---- Editing ------------------------------------------------------------

type MeChange = Partial<Pick<TeamUser, 'nickname' | 'place' | 'status' | 'look'>> & {
  scheduled?: ScheduledChangeRequest | null;
};

interface EditorProps {
  user: TeamUser;
  state: TeamState;
  token: string;
  onLogOut: (note?: string) => void;
}

function Editor({ user, state, token, onLogOut }: EditorProps) {
  const [message, showMessage] = useMessage(2500);
  const [scheduleMessage, showScheduleMessage] = useMessage(2500);
  const [nickname, setNickname] = useState(user.nickname);
  const [status, setStatus] = useState(user.status);
  const nicknameRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLInputElement>(null);

  // Live updates must not overwrite what someone is typing.
  useEffect(() => {
    if (document.activeElement !== nicknameRef.current) setNickname(user.nickname);
  }, [user.nickname]);
  useEffect(() => {
    if (document.activeElement !== statusRef.current) setStatus(user.status);
  }, [user.status]);

  async function patchMe(body: MeChange, done: string, show = showMessage): Promise<boolean> {
    try {
      await api('PATCH', '/api/me', body, { Authorization: `Bearer ${token}` });
      show(done);
      return true;
    } catch (err) {
      if (err instanceof ApiFailure && err.status === 401) {
        onLogOut('You were logged out because your username was released. Pick it again to continue.');
        return false;
      }
      show(errorText(err), true);
      return false;
    }
  }

  const workingPlaces = [
    ...state.places.map((p, i) => ({ id: p.id, name: p.name, icon: OFFICE_ICONS[i] ?? '🏬' })),
    { id: 'wfh', name: 'Work from home', icon: '🏡' },
  ];
  const awayPlaces = [
    { id: 'out', name: 'Out of Office', icon: '🚶' },
    { id: 'off', name: 'Off today', icon: '🏖️' },
  ];

  function placeButton(option: { id: string; name: string; icon: string }) {
    return (
      <Choice
        key={option.id}
        type="button"
        aria-pressed={user.place === option.id}
        onClick={() => void patchMe({ place: option.id }, `Place set to ${option.name}`)}
      >
        <ChoiceIcon aria-hidden="true">{option.icon}</ChoiceIcon>
        {option.name}
      </Choice>
    );
  }

  return (
    <div>
      <Hero>
        <HeroAvatar><Mochi user={user} /></HeroAvatar>
        <div>
          <h1>{user.nickname}</h1>
          <p>@{user.username}</p>
        </div>
        <LogOutButton $small type="button" onClick={() => onLogOut()}>Log out</LogOutButton>
      </Hero>

      <Panel>
        <h2>Where are you today?</h2>
        <GroupLabel>Working</GroupLabel>
        <ChoiceGrid>{workingPlaces.map(placeButton)}</ChoiceGrid>
        <GroupLabel>Not working</GroupLabel>
        <ChoiceGrid>{awayPlaces.map(placeButton)}</ChoiceGrid>
      </Panel>

      <SchedulePanel
        user={user}
        message={scheduleMessage}
        onSave={(scheduled, done) => patchMe({ scheduled }, done, showScheduleMessage)}
      />

      <StackPanel>
        <h2>Status</h2>
        <Row
          as="form"
          onSubmit={(event) => {
            event.preventDefault();
            void patchMe({ status }, status.trim() ? 'Status set' : 'Status cleared').then(() => statusRef.current?.blur());
          }}
        >
          <Input
            ref={statusRef}
            maxLength={140}
            placeholder="What's your status?"
            aria-label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          />
          <Button type="submit">Set status</Button>
          <Button
            type="button"
            onClick={() => {
              setStatus('');
              void patchMe({ status: '' }, 'Status cleared');
            }}
          >
            Clear
          </Button>
        </Row>
      </StackPanel>

      <StackPanel
        as="form"
        onSubmit={(event) => {
          event.preventDefault();
          void patchMe({ nickname }, 'Nickname saved').then(() => nicknameRef.current?.blur());
        }}
      >
        <h2>Nickname</h2>
        <Row>
          <Input
            ref={nicknameRef}
            maxLength={24}
            required
            aria-label="Nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
          <Button type="submit">Save nickname</Button>
        </Row>
      </StackPanel>

      <CharacterEditor user={user} onSave={(look) => void patchMe({ look }, 'Character saved')} />

      <FundPanel user={user} token={token} />

      <StatusLine message={message} />
    </div>
  );
}

// ---- Page ---------------------------------------------------------------

export function MePage() {
  const { state } = useTeamState();
  const [auth, setAuth] = useState(loadAuth);
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    document.title = 'My Status';
  }, []);

  function changeAuth(value: AuthResult | null) {
    storeAuth(value);
    setAuth(value);
    setPicked(null);
  }

  const me = auth ? state?.users.find((u) => u.username === auth.username) : undefined;
  const pickedUser = !auth && picked ? state?.users.find((u) => u.username === picked) : undefined;

  // The admin deleted this username.
  useEffect(() => {
    if (state && auth && !me) changeAuth(null);
  }, [state, auth, me]);

  return (
    <Sheet>
      <SheetNav links={[{ href: '/', label: 'Map' }, { href: '/admin', label: 'Admin' }]} />
      {state && me && auth && (
        <Editor
          user={me}
          state={state}
          token={auth.token}
          onLogOut={(reason = '') => {
            setNote(reason);
            changeAuth(null);
          }}
        />
      )}
      {state && pickedUser && (
        <PinPanel
          key={pickedUser.username}
          user={pickedUser}
          onDone={(result) => {
            setNote('');
            changeAuth(result);
          }}
          onBack={() => setPicked(null)}
        />
      )}
      {state && !me && !pickedUser && <PickPanel users={state.users} note={note} onPick={setPicked} />}
    </Sheet>
  );
}
