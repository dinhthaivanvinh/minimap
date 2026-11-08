// Monitor page: filters, the people list, and switching between 2D and 3D.
import { TeamAssemble, type AssemblyCast } from '../components/TeamAssemble.tsx';
import { officeAssembly } from '../lib/assembly.ts';
import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import styled, { css } from 'styled-components';
import type { TeamState, TeamUser } from '../../shared/types.ts';
import { latestResult, waitingVoters, type VoteView } from '../../shared/vote.ts';
import { DetailCard } from '../components/DetailCard.tsx';
import { InfoPanel } from '../components/InfoPanel.tsx';
import { Mochi } from '../components/Mochi.tsx';
import { RandomPicker } from '../components/RandomPicker.tsx';
import { useAmbience, useNow, useReducedMotion, useTeamState } from '../lib/hooks.ts';
import { reactions as planReactions, type VoteSnapshot } from '../lib/voteReactions.ts';
import { shownStatus } from '../lib/status.ts';
import { supportsWebGL } from '../lib/webgl.ts';
import { isNotWorking, placeGroup, placeName, type PlaceGroup } from '../lib/layout.ts';
import Map2D from '../map/Map2D.tsx';
import type { FocusRequest, ReactionPlay, VoteMarks } from '../map/types.ts';
import { media, theme } from '../styles/theme.ts';
import { Button, Count, Segmented, Wordmark } from '../styles/ui.ts';

// three.js is large, so it only loads when someone opens the 3D map.
const Map3D = lazy(() => import('../map/Map3D.tsx'));
// The arcade is a whole game, so it only loads when someone presses Play.
const Basketball = lazy(() => import('../components/Basketball.tsx').then((m) => ({ default: m.Basketball })));

const MODE_KEY = 'minimap.mode';
const NO_VOTES: VoteView[] = [];
const WEATHER_KEY = 'minimap.weather';
const VOTE_MARKS_KEY = 'minimap.voteMarks';

type Filter = 'all' | 'office' | 'wfh' | 'notWorking';
type Mode = '2d' | '3d';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'office', label: 'In office' },
  { id: 'wfh', label: 'From home' },
  { id: 'notWorking', label: 'Not working' },
];

const GROUPS: { id: PlaceGroup; name: string }[] = [
  { id: 'working', name: 'Working' },
  { id: 'notWorking', name: 'Not working' },
  { id: 'notCheckedIn', name: 'Not checked in' },
];

const EMPTY_FILTER_TEXT: Record<Filter, string> = {
  all: 'Team members appear here once they are added.',
  office: 'Nobody is in an office right now.',
  wfh: 'Nobody is working from home right now.',
  notWorking: 'Everyone is working or not checked in yet.',
};

const Page = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 100dvh;

  ${media.phone} { height: auto; }
`;

const TopBar = styled.header`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  padding: 12px 18px;

  ${media.phone} { padding: 12px 16px; }
`;

const TopBarSpacer = styled.div`
  flex: 1;

  ${media.phone} { display: none; }
`;

const Stage = styled.main`
  flex: 1;
  display: flex;
  min-height: 0;
  gap: 14px;
  padding: 0 18px 16px;

  ${media.phone} {
    flex-direction: column;
    padding: 0 16px 16px;
  }
`;

const MapArea = styled.div<{ $is3d: boolean }>`
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;

  ${media.phone} {
    flex: none;
    height: 150vw;
    min-height: 520px;

    ${({ $is3d }) => $is3d && css`
      height: 96vw;
      min-height: 380px;
    `}
  }
`;

const MapHost = styled.div`
  position: absolute;
  inset: 0;
`;

const OfflineNote = styled.p`
  position: absolute;
  top: 8px;
  left: 50%;
  z-index: 30;
  transform: translateX(-50%);
  padding: 2px 14px;
  border: ${theme.thinLine};
  border-radius: 12px;
  background: ${theme.bubblegum};
  font-weight: 800;
`;

const EmptyNote = styled.p`
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 20;
  width: min(340px, 90%);
  transform: translate(-50%, -50%);
  padding: 14px 18px;
  border: ${theme.line};
  border-radius: 16px;
  background: ${theme.paper};
  text-align: center;
`;

const Side = styled.div`
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 290px;
  min-height: 0;

  ${media.phone} { width: 100%; }
`;

const People = styled.aside`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: ${theme.line};
  border-radius: 18px;
  background: ${theme.paper};
  box-shadow: 0 5px 0 ${theme.ink};
  overflow: hidden;

  ${media.phone} { flex: none; }
`;

// One line per person, so a whole team fits on a wall TV, which can't scroll.
const PeopleUl = styled.ul`
  flex: 1;
  margin: 0;
  padding: 3px 6px;
  list-style: none;
  overflow-y: auto;

  ${media.phone} { padding: 6px; max-height: none; }
`;

const FilterGroup = styled(Segmented)`
  ${media.phone} {
    display: grid;
    grid-template-columns: 1fr 1fr;

    button:nth-child(3) { border-left: 0; }
    button:nth-child(n + 3) { border-top: ${theme.line}; }
  }
`;

const PeopleHeading = styled.li`
  display: flex;
  justify-content: space-between;
  padding: 3px 6px 0;
  color: ${theme.inkSoft};
  font-family: ${theme.displayFont};
  font-size: 13px;
  font-weight: 800;
  line-height: 1.35;
`;

const PeopleEmpty = styled.li`
  padding: 14px;
  color: ${theme.inkSoft};
  text-align: center;
`;

const PersonRow = styled.button<{ $selected: boolean }>`
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 1px 6px;
  border: 0;
  border-radius: 8px;
  background: none;
  text-align: left;
  cursor: pointer;

  &:hover { background: #eef8ff; }

  ${({ $selected }) => $selected && css`
    &, &:hover { background: ${theme.butter}; }
  `}

  /* Phones scroll, and their rows need to be big enough to tap. */
  ${media.phone} {
    grid-template-columns: 32px minmax(0, 1fr);
    padding: 5px 8px;
  }
`;

const RowAvatar = styled.span`
  width: 22px;
  height: 22px;

  ${media.phone} { width: 32px; height: 32px; }
`;

const RowText = styled.span`
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
`;

const RowName = styled.span`
  flex: 0 1 auto;
  max-width: 62%;
  overflow: hidden;
  font-family: ${theme.displayFont};
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const RowWhere = styled.span`
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  color: ${theme.inkSoft};
  font-size: 12px;
  line-height: 1.3;
  text-align: right;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

function readSaved(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

// Falls back to the 2D map if the 3D map can't load or crashes.
// Keeps the map running when a part fails or can't be downloaded: that part just isn't shown.
class Guard extends Component<{ what: string; onFail?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`Could not show ${this.props.what}`, error);
    this.props.onFail?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function PeopleList({ state, people, filter, selected, onPick }: {
  state: TeamState;
  people: TeamUser[];
  filter: Filter;
  selected: string | null;
  onPick: (username: string, row: HTMLElement) => void;
}) {
  function fullWhere(user: TeamUser): string {
    const place = placeName(state.places, user.place);
    const status = shownStatus(user);
    return status ? `${place}: ${status}` : place;
  }

  if (!people.length) {
    const text = state.users.length ? EMPTY_FILTER_TEXT[filter] : EMPTY_FILTER_TEXT.all;
    return (
      <PeopleUl>
        <PeopleEmpty>{text}</PeopleEmpty>
      </PeopleUl>
    );
  }

  return (
    <PeopleUl>
      {GROUPS.flatMap((group) => {
        const members = people.filter((user) => placeGroup(user.place, state.places) === group.id);
        if (!members.length) return [];
        return [
          <PeopleHeading key={group.id}>
            <span>{group.name}</span>
            <span>{members.length}</span>
          </PeopleHeading>,
          ...members.map((user) => (
            <li key={user.username}>
              <PersonRow
                type="button"
                data-person-row
                title={fullWhere(user)}
                $selected={selected === user.username}
                onClick={(event) => onPick(user.username, event.currentTarget)}
              >
                <RowAvatar><Mochi user={user} /></RowAvatar>
                <RowText>
                  <RowName>{user.nickname}</RowName>
                  <RowWhere>{shownStatus(user) || placeName(state.places, user.place)}</RowWhere>
                </RowText>
              </PersonRow>
            </li>
          )),
        ];
      })}
    </PeopleUl>
  );
}

export function MonitorPage() {
  const { state, online, votes } = useTeamState();
  const has3D = useMemo(supportsWebGL, []);
  const [filter, setFilter] = useState<Filter>('all');
  const [mode, setMode] = useState<Mode>(() => {
    const requested = new URLSearchParams(location.search).get('mode') || readSaved(MODE_KEY);
    return requested === '3d' && has3D ? '3d' : '2d';
  });
  const [selection, setSelection] = useState<{ username: string; anchor: HTMLElement } | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [arcadeRequest, setArcadeRequest] = useState<{trigger: HTMLElement} | null>(null);
  const openArcade = useCallback((trigger: HTMLElement) => setArcadeRequest({trigger}), []);
  const [assemblyCast, setAssemblyCast] = useState<AssemblyCast | null>(null);
  const closeAssembly = useCallback(() => setAssemblyCast(null), []);
  function openAssembly(trigger: HTMLElement) {
    if (!state) return;
    const attendance = officeAssembly(state);
    if (attendance.unlocked) {
      closeCard();
      setAssemblyCast({members:structuredClone(attendance.members),total:attendance.total,trigger});
    }
  }
  const [pickerOpen, setPickerOpen] = useState(false);
  // Each screen can turn the town's daylight and weather off, if the admin has them on.
  const [weatherOn, setWeatherOn] = useState(() => readSaved(WEATHER_KEY) !== 'off');
  const weatherAllowed = Boolean(state?.settings.officeName) && state?.settings.mapWeather !== false;
  const look = useAmbience(state?.weather ?? null, weatherAllowed && weatherOn);
  // A wall TV can hide the "hasn't voted" markers and the results banner.
  const [voteMarksOn, setVoteMarksOn] = useState(() => readSaved(VOTE_MARKS_KEY) !== 'off');
  // Votes open and close by the clock, with no message from the server.
  const now = useNow(15_000);
  const allVotes = votes ?? NO_VOTES;
  const voteMarks = useMemo<VoteMarks | null>(
    () => (voteMarksOn ? { waiting: waitingVoters(allVotes, now), result: latestResult(allVotes, now) } : null),
    [voteMarksOn, allVotes, now],
  );
  // Characters react to votes coming in and closing, unless motion is turned down.
  const reduced = useReducedMotion();
  const lastLook = useRef<VoteSnapshot | null>(null);
  const [reactions, setReactions] = useState<ReactionPlay | null>(null);
  useEffect(() => {
    if (!votes) return;
    const look = { votes, at: new Date() };
    const list = planReactions(lastLook.current, look);
    lastLook.current = look;
    if (list.length && !reduced) setReactions({ id: look.at.getTime(), list });
  }, [votes, now, reduced]);

  useEffect(() => {
    document.title = 'Team Minimap';
  }, []);

  const places = state?.places;
  const officeIds = useMemo(() => new Set(places?.map((p) => p.id)), [places]);

  const matches = useCallback(
    (user: TeamUser) => {
      if (filter === 'office') return user.place !== null && officeIds.has(user.place);
      if (filter === 'wfh') return user.place === 'wfh';
      if (filter === 'notWorking') return isNotWorking(user.place);
      return true;
    },
    [filter, officeIds],
  );
  const isDimmed = useCallback((user: TeamUser) => !matches(user), [matches]);

  const closeCard = useCallback(() => setSelection(null), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const select = useCallback((username: string, anchor: HTMLElement) => setSelection({ username, anchor }), []);

  // A list click points at the person on the map; the row is the fallback.
  function pickFromList(username: string, row: HTMLElement) {
    setFocus({ username, at: Date.now() });
    const badge = document.querySelector<HTMLElement>(`[data-map-root] [data-badge][data-username="${CSS.escape(username)}"]`);
    select(username, badge ?? row);
  }

  function chooseMode(next: Mode) {
    save(MODE_KEY, next);
    closeCard();
    setMode(next);
  }

  // Not saved, so the next visit tries 3D again.
  function fallBackTo2D() {
    closeCard();
    setMode('2d');
  }

  function chooseFilter(next: Filter) {
    closeCard();
    setFilter(next);
  }

  const users = state?.users ?? [];
  const counts: Record<Filter, number> = {
    all: users.length,
    office: users.filter((u) => u.place !== null && officeIds.has(u.place)).length,
    wfh: users.filter((u) => u.place === 'wfh').length,
    notWorking: users.filter((u) => isNotWorking(u.place)).length,
  };

  const people = useMemo(() => {
    const order: (string | null)[] = [...(places ?? []).map((p) => p.id), 'wfh', 'out', 'off', null];
    return (state?.users ?? [])
      .filter(matches)
      .sort((a, b) => order.indexOf(a.place) - order.indexOf(b.place) || a.nickname.localeCompare(b.nickname));
  }, [state, places, matches]);

  const selectedUser = selection ? users.find((u) => u.username === selection.username) : undefined;

  // The selected person was deleted.
  useEffect(() => {
    if (state && selection && !selectedUser) closeCard();
  }, [state, selection, selectedUser, closeCard]);

  const mapProps = state && { state, isDimmed, selected: selection?.username ?? null, focus, onSelect: select, onArcade: openArcade, onAssemble: openAssembly, look, votes: allVotes, voteMarks, reactions };

  return (
    <Page>
      <TopBar>
        <Wordmark href="/">Team Minimap</Wordmark>
        <FilterGroup role="group" aria-label="Show people">
          {FILTERS.map(({ id, label }) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => chooseFilter(id)}>
              {label}<Count>{counts[id]}</Count>
            </button>
          ))}
        </FilterGroup>
        <Segmented role="group" aria-label="Map style">
          <button type="button" aria-pressed={mode === '2d'} onClick={() => chooseMode('2d')}>2D</button>
          <button
            type="button"
            aria-pressed={mode === '3d'}
            disabled={!has3D}
            title={has3D ? undefined : 'This browser cannot show 3D graphics'}
            onClick={() => chooseMode('3d')}
          >
            3D
          </button>
        </Segmented>
        {weatherAllowed && (
          <Segmented role="group" aria-label="Town">
            <button
              type="button"
              aria-pressed={weatherOn}
              title="Show the office's daylight and weather on the map"
              onClick={() => {
                save(WEATHER_KEY, weatherOn ? 'off' : 'on');
                setWeatherOn(!weatherOn);
              }}
            >
              Weather
            </button>
          </Segmented>
        )}
        <Segmented role="group" aria-label="Votes on the map">
          <button
            type="button"
            aria-pressed={voteMarksOn}
            title="Show who hasn't voted yet, and the latest result"
            onClick={() => {
              save(VOTE_MARKS_KEY, voteMarksOn ? 'off' : 'on');
              setVoteMarksOn(!voteMarksOn);
            }}
          >
            Votes
          </button>
        </Segmented>
        <TopBarSpacer />
        <Button type="button" disabled={!state?.users.length} onClick={() => { closeCard(); setPickerOpen(true); }}>
          Random picker
        </Button>
        <Button as="a" $primary href="/me">Update my status</Button>
      </TopBar>

      <Stage>
        <MapArea $is3d={mode === '3d'}>
          <MapHost>
            {mapProps && mode === '2d' && <Map2D {...mapProps} />}
            {mapProps && mode === '3d' && (
              <Guard what="the 3D map" onFail={fallBackTo2D}>
                <Suspense fallback={null}>
                  <Map3D {...mapProps} onFail={fallBackTo2D} />
                </Suspense>
              </Guard>
            )}
          </MapHost>
          {/* Loaded on the first Play, then kept, so a finished round that wasn't saved stays available. */}
          {arcadeRequest && (
            <Guard what="the basketball arcade">
              <Suspense fallback={null}>
                <Basketball initialView={mode} users={users} request={arcadeRequest} />
              </Suspense>
            </Guard>
          )}
          {!online && <OfflineNote role="status">Reconnecting to the server</OfflineNote>}
          {state && !state.users.length && (
            <EmptyNote>No team members yet. Add usernames on the <a href="/admin">Admin page</a>.</EmptyNote>
          )}
        </MapArea>

        <Side>
          {state && <InfoPanel state={state} votes={allVotes} />}
          <People aria-label="Team members">
            {state && <PeopleList state={state} people={people} filter={filter} selected={selection?.username ?? null} onPick={pickFromList} />}
          </People>
        </Side>
      </Stage>

      {assemblyCast && <TeamAssemble cast={assemblyCast} initialView={mode} onClose={closeAssembly}/>}

      {state && pickerOpen && <RandomPicker users={users} initialView={mode} onClose={closePicker} />}

      {state && selection && selectedUser && (
        <DetailCard user={selectedUser} places={state.places} votes={allVotes} anchor={selection.anchor} onClose={closeCard} />
      )}
    </Page>
  );
}
