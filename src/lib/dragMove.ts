// Moving yourself by dragging your own character to another room on the map.
// The same rules serve the 2D and 3D maps: which room is under a point, the place a
// drop asks the server for, and how the map shows the move until the server agrees.
import type { TeamState, TeamUser } from '../../shared/types.ts';
import type { MapLayout, Zone } from './layout.ts';

/** How far, in pixels, a pointer must move before a press becomes a drag, so a click still opens the card. */
export const DRAG_START_PX = 6;

/** What a press needs to know from a pointer event. */
export interface PressPoint {
  pointerId: number;
  clientX: number;
  clientY: number;
}

/**
 * Follows one press on a character, from pointer down until it is let go. The 2D map
 * feeds it every move of that pointer on the whole window, not only those over the
 * character: a quick flick leaves the character before its first move arrives.
 */
export function createPress(start: PressPoint) {
  const { pointerId, clientX, clientY } = start;
  let dragged = false;
  return {
    pointerId,
    /** Whether the press has moved far enough to be a drag. */
    dragged: () => dragged,
    /** How far the character has been dragged, or null while this is still a click, or for another pointer. */
    move(event: PressPoint): { x: number; y: number } | null {
      if (event.pointerId !== pointerId) return null;
      const x = event.clientX - clientX;
      const y = event.clientY - clientY;
      if (!dragged && Math.hypot(x, y) < DRAG_START_PX) return null;
      dragged = true;
      return { x, y };
    },
  };
}

/** A move the map shows straight away, while the server saves it. */
export interface PendingMove {
  username: string;
  place: string | null;
}

/** The room under a point, in layout units, or null over the park, a gap or outside the map. */
export function zoneAt(layout: Pick<MapLayout, 'zones'>, x: number, y: number): Zone | null {
  return layout.zones.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) ?? null;
}

/** The place for a room. The lobby is where people who haven't checked in wait, so it has none. */
export function placeOfZone(zone: Zone): string | null {
  return zone.kind === 'lobby' ? null : zone.id;
}

/**
 * The place to send when someone drops their character at a point, or undefined when
 * nothing changes: dropped outside every room, or back in the room they're in.
 */
export function dropPlace(layout: Pick<MapLayout, 'zones' | 'seats'>, username: string, x: number, y: number): string | null | undefined {
  const zone = zoneAt(layout, x, y);
  if (!zone) return undefined;
  const current = layout.seats.get(username)?.zone.id;
  return zone.id === current ? undefined : placeOfZone(zone);
}

/** Only someone logged in on this browser, who is on the team, may drag, and only themselves. */
export function moverFor(users: TeamUser[], loggedIn: string | null | undefined): string | null {
  return loggedIn && users.some((u) => u.username === loggedIn && u.claimed) ? loggedIn : null;
}

/**
 * The state with a pending move already made, as the server will make it: going to the
 * place of a scheduled change by hand means it has already happened.
 */
export function withMove(state: TeamState, move: PendingMove | null): TeamState {
  if (!move) return state;
  const user = state.users.find((u) => u.username === move.username);
  if (!user || user.place === move.place) return state;
  return {
    ...state,
    users: state.users.map((u) => {
      if (u !== user) return u;
      const scheduled = move.place && u.scheduled?.place === move.place ? null : u.scheduled;
      return { ...u, place: move.place, scheduled };
    }),
  };
}
