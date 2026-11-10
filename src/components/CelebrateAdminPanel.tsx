// The admin's "Birthdays and anniversaries" panel: set or fix anyone's birthday and first day
// on the team, for people who haven't set their own.
import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import type { CelebrateDates } from '../../shared/celebrate.ts';
import type { TeamUser } from '../../shared/types.ts';
import { errorText } from '../lib/api.ts';
import { useMessage } from '../lib/hooks.ts';
import { Button, Input, PanelHint, StackPanel } from '../styles/ui.ts';
import { birthdayToSend, BirthdayInput, localToday } from './BirthdayInput.tsx';
import { Mochi } from './Mochi.tsx';
import { StatusLine } from './SheetNav.tsx';

type AdminCall = <T = unknown>(method: string, url: string, body?: unknown) => Promise<T>;
type ShowMessage = (text: string, isError?: boolean) => void;
type Runner = (action: () => Promise<unknown>, done: string, show: ShowMessage) => Promise<void>;
type People = { people: [string, CelebrateDates][] };

const List = styled.ul`
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const PersonRow = styled.li`
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  grid-template-areas: 'face name save' 'birthday birthday birthday' 'joined joined joined';
  align-items: center;
  gap: 6px 8px;

  strong { grid-area: name; overflow-wrap: anywhere; }
  button { grid-area: save; }
`;

const Avatar = styled.div`
  grid-area: face;
  width: 32px;
  height: 32px;
`;

const NO_DATES: CelebrateDates = { birthday: null, joined: null };

export function CelebrateAdminPanel({ users, call, run }: { users: TeamUser[]; call: AdminCall; run: Runner }) {
  const [saved, setSaved] = useState<Map<string, CelebrateDates>>(new Map());
  const [drafts, setDrafts] = useState<Map<string, { birthday: string; joined: string }>>(new Map());
  const [message, showMessage] = useMessage(2500);

  const show = useCallback((view: People) => {
    setSaved(new Map(view.people));
    setDrafts(new Map());
  }, []);

  useEffect(() => {
    void run(() => call<People>('GET', '/api/celebrate/admin').then(show), '', showMessage);
  }, [call, run, show, showMessage]);

  const sorted = useMemo(() => [...users].sort((a, b) => a.username.localeCompare(b.username)), [users]);

  function draftOf(username: string) {
    const dates = saved.get(username) ?? NO_DATES;
    return drafts.get(username) ?? { birthday: dates.birthday ?? '', joined: dates.joined ?? '' };
  }

  function edit(username: string, change: Partial<{ birthday: string; joined: string }>) {
    setDrafts((current) => new Map(current).set(username, { ...draftOf(username), ...change }));
  }

  function save(username: string) {
    const draft = draftOf(username);
    let birthday: string;
    try {
      birthday = birthdayToSend(draft.birthday);
    } catch (err) {
      showMessage(errorText(err), true);
      return;
    }
    void run(
      () =>
        call<People>('PATCH', '/api/celebrate/admin', { username, birthday, joined: draft.joined }).then((view) => {
          setSaved(new Map(view.people));
          setDrafts((current) => {
            const next = new Map(current);
            next.delete(username);
            return next;
          });
        }),
      `Dates saved for ${username}`,
      showMessage,
    );
  }

  return (
    <StackPanel>
      <h2>Birthdays and anniversaries</h2>
      <PanelHint style={{ margin: 0 }}>
        On someone’s birthday or work anniversary, their character wears a party hat and teammates can send wishes. People can set
        their own on Account settings; set them here for anyone who hasn’t.
      </PanelHint>
      <List>
        {sorted.map((user) => {
          const draft = draftOf(user.username);
          return (
            <PersonRow key={user.username}>
              <Avatar><Mochi user={user} /></Avatar>
              <strong>{user.username}</strong>
              <Button $small type="button" disabled={!drafts.has(user.username)} onClick={() => save(user.username)}>Save</Button>
              <div style={{ gridArea: 'birthday' }}>
                <BirthdayInput label={`Birthday for ${user.username}`} value={draft.birthday} onChange={(birthday) => edit(user.username, { birthday })} />
              </div>
              <Input
                style={{ gridArea: 'joined' }}
                type="date"
                min="1970-01-01"
                max={localToday()}
                aria-label={`First day on the team for ${user.username}`}
                value={draft.joined}
                onChange={(event) => edit(user.username, { joined: event.target.value })}
              />
            </PersonRow>
          );
        })}
      </List>
      <StatusLine message={message} />
    </StackPanel>
  );
}
