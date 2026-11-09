// The admin's team fund panel: paste the fund's Google Sheet link, see when it was last read,
// and link each username to their name on the sheet.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import styled from 'styled-components';
import { MAX_SHEET_LINK, suggestLinks, type FundAdminView } from '../../shared/fund.ts';
import type { TeamUser } from '../../shared/types.ts';
import { useMessage } from '../lib/hooks.ts';
import { theme } from '../styles/theme.ts';
import { Button, Input, PanelHint, Row, StackPanel } from '../styles/ui.ts';
import { Mochi } from './Mochi.tsx';
import { StatusLine } from './SheetNav.tsx';

type AdminCall = <T = unknown>(method: string, url: string, body?: unknown) => Promise<T>;
type ShowMessage = (text: string, isError?: boolean) => void;
type Runner = (action: () => Promise<unknown>, done: string, show: ShowMessage) => Promise<void>;

const LinkList = styled.ul`
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const LinkRow = styled.li`
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) minmax(0, 1.4fr);
  align-items: center;
  gap: 8px;

  strong { overflow-wrap: anywhere; }
  select { width: 100%; min-width: 0; }
`;

const Avatar = styled.div`
  width: 32px;
  height: 32px;
`;

const Problem = styled.p`
  margin: 0;
  color: ${theme.error};
  font-weight: 800;
`;

function readAt(iso: string | null): string {
  if (!iso) return 'The sheet hasn’t been read yet.';
  return `Last read ${new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.`;
}

export function FundAdminPanel({ users, call, run }: { users: TeamUser[]; call: AdminCall; run: Runner }) {
  const [view, setView] = useState<FundAdminView | null>(null);
  const [sheet, setSheet] = useState('');
  const [links, setLinks] = useState<Map<string, string>>(new Map());
  const [message, showMessage] = useMessage();

  const show = useCallback((next: FundAdminView) => {
    setView(next);
    setSheet(next.sheet);
    setLinks(new Map(next.links));
  }, []);

  useEffect(() => {
    void run(() => call<FundAdminView>('GET', '/api/fund/admin').then(show), '', showMessage);
  }, [call, run, show, showMessage]);

  const usernames = useMemo(() => users.map((u) => u.username).sort((a, b) => a.localeCompare(b)), [users]);
  const names = useMemo(() => view?.rows.map((r) => r.name) ?? [], [view]);
  const titles = useMemo(() => new Map(view?.rows.map((r) => [r.name, r.title])), [view]);
  const linked = new Set(links.values());
  const unlinked = names.filter((name) => !linked.has(name));

  function saveSheet(event: FormEvent) {
    event.preventDefault();
    const link = sheet.trim();
    void run(() => call<FundAdminView>('PATCH', '/api/fund/admin', { sheet: link }).then(show), link ? 'Sheet saved' : 'Sheet removed', showMessage);
  }

  function readNow() {
    void run(() => call<FundAdminView>('POST', '/api/fund/admin/refresh').then(show), 'Sheet read again', showMessage);
  }

  function pick(username: string, name: string) {
    setLinks((current) => {
      const next = new Map(current);
      if (name) next.set(username, name);
      else next.delete(username);
      return next;
    });
  }

  // Fills in only the people who aren't linked yet, with names nobody else has.
  function suggest() {
    const open = usernames.filter((u) => !links.has(u));
    const found = suggestLinks(open, unlinked);
    if (!found.size) {
      showMessage('No obvious matches. Pick the names by hand.');
      return;
    }
    setLinks((current) => new Map([...current, ...found]));
    showMessage(`Matched ${found.size}. Check them, then save.`);
  }

  function saveLinks() {
    const pairs = usernames.filter((u) => links.has(u)).map((u) => [u, links.get(u)!]);
    void run(() => call<FundAdminView>('PATCH', '/api/fund/admin', { links: pairs }).then(show), 'Links saved', showMessage);
  }

  return (
    <StackPanel>
      <h2>Team fund</h2>
      <PanelHint>
        Reads the tab named {view?.year ?? new Date().getFullYear()} of the fund’s Google Sheet every hour. Share the sheet with
        “Anyone with the link” can view. People behind on the fund wear a poor look they can’t hide; people who paid ahead dress up
        and can hide it.
      </PanelHint>
      <Row as="form" onSubmit={saveSheet}>
        <Input
          maxLength={MAX_SHEET_LINK}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          aria-label="Fund sheet link"
          autoComplete="off"
          value={sheet}
          onChange={(event) => setSheet(event.target.value)}
        />
        <Button type="submit">Save link</Button>
      </Row>
      {view?.sheet && (
        <Row>
          <PanelHint as="span" style={{ flex: 1, margin: 0 }}>{readAt(view.fetchedAt)}</PanelHint>
          <Button $small type="button" onClick={readNow}>Read now</Button>
        </Row>
      )}
      {view?.error && <Problem role="alert">{view.error}</Problem>}

      {names.length > 0 && (
        <>
          <h3>Who is who on the sheet</h3>
          <LinkList>
            {usernames.map((username) => {
              const user = users.find((u) => u.username === username)!;
              const current = links.get(username) ?? '';
              const gone = current && !titles.has(current);
              return (
                <LinkRow key={username}>
                  <Avatar><Mochi user={user} /></Avatar>
                  <strong>{username}</strong>
                  <Input as="select" aria-label={`Name on the sheet for ${username}`} value={current} onChange={(event) => pick(username, event.target.value)}>
                    <option value="">Not linked</option>
                    {gone && <option value={current}>{current} (not on the sheet)</option>}
                    {names.map((name) => (
                      <option key={name} value={name} disabled={linked.has(name) && name !== current}>
                        {name} · {titles.get(name)}
                      </option>
                    ))}
                  </Input>
                </LinkRow>
              );
            })}
          </LinkList>
          {unlinked.length > 0 && <PanelHint style={{ margin: 0 }}>Not linked yet: {unlinked.join(', ')}.</PanelHint>}
          <Row>
            <Button type="button" onClick={suggest}>Suggest matches</Button>
            <Button $primary type="button" onClick={saveLinks}>Save links</Button>
          </Row>
        </>
      )}
      <StatusLine message={message} />
    </StackPanel>
  );
}
