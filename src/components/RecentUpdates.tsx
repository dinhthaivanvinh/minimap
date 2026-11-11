// The home page's "Recent updates" card: the latest place and status changes, newest
// first. MonitorPage decides which rows it gets and where it sits over the map; the rules
// are in lib/recentUpdates.ts.
import styled, { css, keyframes } from 'styled-components';
import type { Place, TeamUser } from '../../shared/types.ts';
import { agoText, updateText, type RecentUpdate } from '../lib/recentUpdates.ts';
import { media, theme } from '../styles/theme.ts';
import { Button, Count } from '../styles/ui.ts';
import { Mochi } from './Mochi.tsx';

const slideIn = keyframes`
  from { opacity: 0; translate: -16px 0; }
`;

// Looks like the side panels, so it reads as one of them that has floated onto the map.
// With no rows it stays in the page, without a box and taking no room (see the live region below).
const Card = styled.section<{ $empty: boolean }>`
  ${({ $empty }) => !$empty && css`
    border: ${theme.line};
    border-radius: 18px;
    background: ${theme.paper};
    box-shadow: 0 5px 0 ${theme.ink};
    overflow: hidden;
    animation: ${slideIn} .25s ease-out;

    /* With reduced motion it just appears. */
    ${media.reducedMotion} { animation: none; }
  `}
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 8px 6px 12px;
  border-bottom: ${theme.dashedLine};

  h2 { font-size: 15px; }
`;

const List = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;

  li + li { border-top: ${theme.dashedLine}; }
  /* The newest row stands out. */
  li:first-child { background: ${theme.hover}; }
`;

// One line for each person, like the people list.
const UpdateRow = styled.button`
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 4px 12px 4px 10px;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;

  &:hover { background: #eef8ff; }
  /* The card clips what sticks out of it, so the focus ring goes inside the row. */
  &:focus-visible { outline-offset: -3px; }

  /* Big enough to tap. */
  ${media.phone} {
    grid-template-columns: 28px minmax(0, 1fr) auto;
    padding: 6px 12px 6px 10px;
  }
`;

const Avatar = styled.span`
  width: 22px;
  height: 22px;

  ${media.phone} { width: 28px; height: 28px; }
`;

const What = styled.span`
  display: flex;
  align-items: baseline;
  min-width: 0;
  font-size: 13px;
  line-height: 1.3;
  white-space: nowrap;
`;

// A long name is cut first, so what changed always keeps half of the line.
const Who = styled.span`
  flex: 0 1 auto;
  max-width: 50%;
  overflow: hidden;
  font-family: ${theme.displayFont};
  font-size: 14px;
  font-weight: 700;
  text-overflow: ellipsis;
`;

const Change = styled.span`
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Ago = styled.span`
  color: ${theme.inkSoft};
  font-size: 12px;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

interface RecentUpdatesProps {
  /** The rows to show, newest first. With none, the card doesn't show. */
  rows: RecentUpdate[];
  users: TeamUser[];
  places: Place[];
  now: Date;
  onClose: () => void;
  /** A row was clicked. The page shows that person, as it does for a row of the people list. */
  onPick: (username: string, row: HTMLElement) => void;
  /** Where the page puts the card. */
  className?: string;
}

export function RecentUpdates({ rows, users, places, now, onClose, onPick, className }: RecentUpdatesProps) {
  // A Map, because a username such as __proto__ breaks a plain object.
  const people = new Map(users.map((user) => [user.username, user]));
  // Someone deleted in the last few minutes no longer has a row.
  const shown = rows.flatMap((row) => {
    const user = people.get(row.username);
    return user ? [{ row, user }] : [];
  });
  const empty = shown.length === 0;

  return (
    <Card className={className} $empty={empty} aria-label={empty ? undefined : 'Recent updates'}>
      {!empty && (
        <Head>
          <h2>Recent updates <Count>{shown.length}</Count></h2>
          <Button $small type="button" aria-label="Close recent updates" onClick={onClose}>✕</Button>
        </Head>
      )}
      {/* A screen reader reads out what is added to a live region that is already in the page.
          So this one stays while the card is hidden, and the first row of a new card is heard too. */}
      <div aria-live="polite">
        {!empty && (
          <List>
            {shown.map(({ row, user }) => {
              const text = updateText(row, places);
              return (
                // Keyed by the change, so a new one is a new row and a screen reader reads out that row alone.
                <li key={`${row.username}:${row.at}`}>
                  <UpdateRow
                    type="button"
                    data-person-row
                    title={`${user.nickname}${text}`}
                    onClick={(event) => onPick(row.username, event.currentTarget)}
                  >
                    <Avatar><Mochi user={user} /></Avatar>
                    <What>
                      <Who>{user.nickname}</Who>
                      {/* A space at the start of its own box would be dropped, so the joining space becomes one that stays. */}
                      <Change>{text.replace(/^ /, ' ')}</Change>
                    </What>
                    {/* Hidden from screen readers: it changes every minute, and the live region would read each change out. */}
                    <Ago aria-hidden="true">{agoText(row, now)}</Ago>
                  </UpdateRow>
                </li>
              );
            })}
          </List>
        )}
      </div>
    </Card>
  );
}
