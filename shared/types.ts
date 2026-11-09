// What the server sends to browsers. Used by both the server and the frontend.
import type { FundPerson } from './fund.ts';
import type { CharacterDesign } from './look.ts';

export interface Place {
  id: string;
  name: string;
  kind: 'office';
}

/** A change that happens by itself at a chosen time. */
export interface ScheduledChange {
  /** An exact instant, in ISO format. */
  at: string;
  place: string;
  /** Replaces the status when it fires. Empty clears the old status. */
  status: string;
}

/** What someone sends to schedule a change. The server picks the place. */
export type ScheduledChangeRequest = Pick<ScheduledChange, 'at' | 'status'>;

export interface TeamUser {
  username: string;
  nickname: string;
  place: string | null;
  status: string;
  updatedAt: string | null;
  claimed: boolean;
  /** Null means the default character chosen from the username. */
  look: CharacterDesign | null;
  scheduled?: ScheduledChange | null;
  /**
   * Their standing on the team fund. The server never sends it here: the browser adds it
   * from the fund's own `fund` event (see withFund in src/lib/fundLook.ts).
   */
  fund?: Omit<FundPerson, 'username'>;
}

export interface Clock {
  label: string;
  timeZone: string;
}

export interface PublicSettings {
  publicUrl: string;
  clocks: Clock[];
  officeName: string;
  /** Whether the map shows the office's daylight and weather. */
  mapWeather: boolean;
}

/** When the sun rises and sets at the office on one day, as ISO instants. */
export interface SunTimes {
  rise: string;
  set: string;
}

export interface Weather {
  temperature: number;
  code: number;
  isDay: boolean;
  updatedAt: string;
  /** Yesterday, today and tomorrow at the office, so the map can light the town. Missing in polar day or night. */
  sun?: SunTimes[];
  /** Share of the sky covered by cloud, 0 to 100. */
  cloudCover?: number;
  /** Rain and snow in the last hour, in mm. */
  precipitation?: number;
  /** Wind at 10 m, in km/h. */
  windSpeed?: number;
}

export interface TeamState {
  places: Place[];
  settings: PublicSettings;
  weather: Weather | null;
  users: TeamUser[];
}

export interface OfficeLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export interface AuthResult {
  token: string;
  username: string;
}
