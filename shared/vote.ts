// Team voting rules shared by the server and the browser: limits, checks for new votes,
// ballots and options, the view that is safe to send to anyone, and the summaries the
// map shows. Nothing here touches React, the DOM or storage, so it is all unit-tested.

export const MAX_TITLE = 80;
export const MAX_OPTION = 60;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 20;
export const MAX_DAYS = 90;
export const MAX_AHEAD_MS = MAX_DAYS * 24 * 60 * 60 * 1000;
export const MAX_OPEN = 30;
export const MAX_CLOSED = 100;
/** How long the map shows a result after a vote closes. */
export const RESULT_MS = 3 * 60 * 60 * 1000;
/** Notes on the board turn red in a vote's last hour, and the wall TV counts it down. */
export const LAST_HOUR_MS = 60 * 60 * 1000;

export interface VoteOption {
  id: string;
  text: string;
  /** Who added it while the vote was open, or null for the creator's own options and former members. */
  addedBy: string | null;
}

export interface VoteSettings {
  title: string;
  endsAt: string;
  voters: string[];
  multi: boolean;
  allowCustom: boolean;
  anonymous: boolean;
  showOnMap: boolean;
}

export interface Vote extends VoteSettings {
  id: string;
  /** Null after the creator is deleted. */
  owner: string | null;
  createdAt: string;
  options: VoteOption[];
  /** Each voter's last ballot. A Map, because a username such as "__proto__" breaks a plain object. */
  ballots: Map<string, string[]>;
}

/** A vote as it is stored and backed up: the ballots become a list of pairs. */
export type StoredVote = Omit<Vote, 'ballots'> & { ballots: [username: string, optionIds: string[]][] };

export interface VoteData {
  votes: StoredVote[];
}

export interface OptionView {
  id: string;
  text: string;
  count: number;
  /** Who picked it. Only on named votes. */
  pickedBy?: string[];
}

/** What the browser gets. It never says who picked what on an anonymous vote. */
export interface VoteView extends VoteSettings {
  id: string;
  owner: string | null;
  createdAt: string;
  options: OptionView[];
  /** Who has voted, never what they picked. */
  voted: string[];
  /** The caller's own picks, only in replies to that logged-in caller. */
  mine?: string[];
}

/** A new vote as the creator fills it in. */
export interface NewVote extends VoteSettings {
  options: string[];
}

/** A rule was broken. The message says what to fix. The server turns it into a 400. */
export class VoteRuleError extends Error {}

function fail(message: string): never {
  throw new VoteRuleError(message);
}

const length = (text: string) => [...text].length;

/** Two options are the same when they only differ in case or spaces. */
export function optionKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isOpen(vote: Pick<VoteSettings, 'endsAt'>, now: Date): boolean {
  return now.getTime() < Date.parse(vote.endsAt);
}

export function canVote(vote: Pick<VoteSettings, 'endsAt' | 'voters'>, username: string, now: Date): boolean {
  return isOpen(vote, now) && vote.voters.includes(username);
}

export function cleanTitle(value: unknown): string {
  const title = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!title || length(title) > MAX_TITLE) fail(`Give the vote a name of 1 to ${MAX_TITLE} characters.`);
  return title;
}

/** An end time in the future and at most 90 days away, as an ISO time. */
export function cleanEndsAt(value: unknown, now: Date): string {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) fail('That end time is not valid. Pick another time.');
  if (time <= now.getTime()) fail('That end time has already passed. Pick a later time.');
  if (time - now.getTime() > MAX_AHEAD_MS) fail(`A vote can run for at most ${MAX_DAYS} days. Pick an earlier time.`);
  return new Date(time).toISOString();
}

export function cleanOption(value: unknown): string {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!text || length(text) > MAX_OPTION) fail(`Each option must be 1 to ${MAX_OPTION} characters.`);
  return text;
}

function cleanSwitch(value: unknown, name: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') fail(`${name} must be on or off.`);
  return value;
}

/** Checks a new vote. The creator is always invited, and voters keep the team's order. */
export function cleanNewVote(value: unknown, { now, members, owner }: { now: Date; members: string[]; owner: string }): NewVote {
  const body = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const title = cleanTitle(body.title);
  const endsAt = cleanEndsAt(body.endsAt, now);

  if (!Array.isArray(body.options)) fail(`Add ${MIN_OPTIONS} to ${MAX_OPTIONS} options.`);
  const options = body.options.map(cleanOption);
  if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) fail(`Add ${MIN_OPTIONS} to ${MAX_OPTIONS} options.`);
  if (new Set(options.map(optionKey)).size !== options.length) fail('Two options are the same. Change or remove one.');

  if (!Array.isArray(body.voters) || !body.voters.every((v) => typeof v === 'string')) fail('Pick who can vote.');
  const invited = new Set<string>(body.voters as string[]);
  const unknown = [...invited].find((name) => !members.includes(name));
  if (unknown !== undefined) fail(`${unknown} is not on the team. Pick voters from the list.`);
  invited.add(owner);
  const voters = members.filter((name) => invited.has(name));

  return {
    title,
    endsAt,
    voters,
    options,
    multi: cleanSwitch(body.multi, 'Multiple choice'),
    allowCustom: cleanSwitch(body.allowCustom, 'Custom options'),
    anonymous: cleanSwitch(body.anonymous, 'Anonymous'),
    showOnMap: cleanSwitch(body.showOnMap, 'Show on the map'),
  };
}

/** Checks someone's picks, and returns them in the order the options were added. */
export function cleanBallot(vote: Pick<Vote, 'multi' | 'options'>, value: unknown): string[] {
  const picks = Array.isArray(value) ? value : [];
  const ids = new Set(vote.options.map((o) => o.id));
  if (!picks.every((id) => typeof id === 'string' && ids.has(id)) || new Set(picks).size !== picks.length) {
    fail('One of those options no longer exists. Reload the page and vote again.');
  }
  if (!vote.multi && picks.length !== 1) fail('Pick one option.');
  if (vote.multi && picks.length === 0) fail('Pick at least one option.');
  return vote.options.filter((o) => picks.includes(o.id)).map((o) => o.id);
}

/** The view of a vote that is safe to show anyone. `caller` adds that person's own picks. */
export function toView(vote: Vote, caller?: string): VoteView {
  const options = vote.options.map((option): OptionView => {
    const pickers = vote.voters.filter((name) => vote.ballots.get(name)?.includes(option.id));
    return vote.anonymous
      ? { id: option.id, text: option.text, count: pickers.length }
      : { id: option.id, text: option.text, count: pickers.length, pickedBy: pickers };
  });
  const view: VoteView = {
    id: vote.id,
    title: vote.title,
    owner: vote.owner,
    createdAt: vote.createdAt,
    endsAt: vote.endsAt,
    voters: [...vote.voters],
    multi: vote.multi,
    allowCustom: vote.allowCustom,
    anonymous: vote.anonymous,
    showOnMap: vote.showOnMap,
    options,
    voted: vote.voters.filter((name) => vote.ballots.has(name)),
  };
  if (caller !== undefined) view.mine = [...(vote.ballots.get(caller) ?? [])];
  return view;
}

export interface Results {
  /** Most votes first. Options with the same count keep the order they were added in. */
  options: OptionView[];
  /** The options sharing first place, or none before anyone has voted. */
  winners: OptionView[];
  /** How many people voted. */
  turnout: number;
}

export function results(view: Pick<VoteView, 'options' | 'voted'>): Results {
  const options = view.options.map((o, i) => ({ o, i })).sort((a, b) => b.o.count - a.o.count || a.i - b.i).map(({ o }) => o);
  const top = options[0]?.count ?? 0;
  return { options, winners: top > 0 ? options.filter((o) => o.count === top) : [], turnout: view.voted.length };
}

/** Open votes for the notice board, ending soonest first. */
export function mapSummary<T extends Pick<VoteSettings, 'endsAt'>>(views: T[], now: Date): T[] {
  return views.filter((v) => isOpen(v, now)).sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt));
}

/** Closed votes, the one that ended last first: the History tab, and which ones are kept. */
export function closedNewestFirst<T extends Pick<VoteSettings, 'endsAt'>>(views: T[], now: Date): T[] {
  return views.filter((v) => !isOpen(v, now)).sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt));
}

export interface LatestResult {
  vote: VoteView;
  winners: OptionView[];
}

/** The vote that closed most recently in the last 3 hours with at least one ballot, for the map's banner. */
export function latestResult(views: VoteView[], now: Date): LatestResult | null {
  const recent = closedNewestFirst(views, now).find((v) => v.voted.length > 0 && now.getTime() - Date.parse(v.endsAt) < RESULT_MS);
  return recent ? { vote: recent, winners: results(recent).winners } : null;
}

/** The open votes someone was invited to and hasn't voted on yet, ending soonest first. */
export function waitingVotes(views: VoteView[], username: string, now: Date, { onMapOnly = false } = {}): VoteView[] {
  return mapSummary(views, now).filter((v) => (!onMapOnly || v.showOnMap) && v.voters.includes(username) && !v.voted.includes(username));
}

/** People invited to an open vote shown on the map who haven't voted on it yet. */
export function waitingVoters(views: VoteView[], now: Date): Set<string> {
  const waiting = new Set<string>();
  for (const vote of mapSummary(views, now)) {
    if (!vote.showOnMap) continue;
    for (const name of vote.voters) if (!vote.voted.includes(name)) waiting.add(name);
  }
  return waiting;
}

/** The banner's words. They never name a voter, so they are the same on anonymous and named votes. */
export function resultText({ vote, winners }: LatestResult): string {
  const [first] = winners;
  if (!first) return `${vote.title} closed.`;
  if (winners.length > 1) return `Tie in ${vote.title}: ${listText(winners.map((w) => w.text))}`;
  const votes = first.count === 1 ? 'vote' : 'votes';
  return `🏆 ${first.text} wins ${vote.title}: ${first.count} of ${vote.voted.length} ${votes}`;
}

function listText(items: string[]): string {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** Back from storage: the ballots become a Map again. */
export function fromStored(vote: StoredVote): Vote {
  return { ...vote, options: vote.options.map((o) => ({ ...o })), voters: [...vote.voters], ballots: new Map(vote.ballots.map(([name, picks]) => [name, [...picks]])) };
}

export function toStored(vote: Vote): StoredVote {
  return { ...vote, options: vote.options.map((o) => ({ ...o })), voters: [...vote.voters], ballots: [...vote.ballots].map(([name, picks]) => [name, [...picks]]) };
}
