// What the server sends to browsers. Used by both the server and the frontend.
import type { CharacterDesign } from './look.ts';

export interface Place {
  id: string;
  name: string;
  kind: 'office';
}

export interface TeamUser {
  username: string;
  nickname: string;
  place: string | null;
  status: string;
  updatedAt: string | null;
  claimed: boolean;
  /** Null means the default character chosen from the username. */
  look: CharacterDesign | null;
}

export interface Clock {
  label: string;
  timeZone: string;
}

export interface PublicSettings {
  publicUrl: string;
  clocks: Clock[];
  officeName: string;
}

export interface Weather {
  temperature: number;
  code: number;
  isDay: boolean;
  updatedAt: string;
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
