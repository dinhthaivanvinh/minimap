// Team voting's API: create votes, cast ballots, add options, extend and delete. It keeps
// its own data (data/vote.json on Node.js, the `vote` key on Cloudflare), asks the team's
// core who is calling, and only ever sends views that hide who picked what on anonymous
// votes. Its raw data, ballots included, still goes into the admin's one backup file.

import * as crypto from 'node:crypto';
import {
  cleanBallot,
  cleanEndsAt,
  cleanNewVote,
  cleanOption,
  closedNewestFirst,
  fromStored,
  isOpen,
  MAX_CLOSED,
  MAX_OPEN,
  MAX_OPTION,
  MAX_OPTIONS,
  MAX_TITLE,
  optionKey,
  toStored,
  toView,
  VoteRuleError,
  type Vote,
  type VoteData,
  type VoteView,
} from '../../shared/vote.ts';
import {
  ApiError,
  backupError,
  errorResponse,
  jsonResponse,
  type ApiRequest,
  type ApiResponse,
  type Team,
  type TeamFeature,
} from '../core.ts';

export interface VoteOptions {
  saved: Partial<VoteData> | null;
  save: (data: VoteData) => void | Promise<void>;
  team: Team;
  /** Tells open maps and pages about the new votes. Public views only: never anyone's own picks. */
  onChange?: (views: VoteView[]) => void;
  now?: () => Date;
}

const MAX_ID = 64;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

// Checks one vote of a backup against the people in that backup, so a restore never
// brings back ballots or invitations for someone who isn't on the team.
function checkVote(value: unknown, usernames: ReadonlySet<string>, n: number): Vote {
  const invalid = (why: string) => backupError(`vote ${n} ${why}.`);
  if (!isObject(value) || typeof value.id !== 'string' || !value.id || value.id.length > MAX_ID) throw invalid('has no valid id');
  const { title, owner, createdAt, endsAt, voters, options, ballots } = value;
  if (typeof title !== 'string' || !title || [...title].length > MAX_TITLE) throw invalid('has no valid name');
  if (owner !== null && (typeof owner !== 'string' || !usernames.has(owner))) throw invalid('belongs to someone who is not on the team');
  if (!isTime(createdAt) || !isTime(endsAt)) throw invalid('has a broken time');
  const switches = ['multi', 'allowCustom', 'anonymous', 'showOnMap'] as const;
  if (!switches.every((key) => typeof value[key] === 'boolean')) throw invalid('has broken settings');
  if (!Array.isArray(voters) || !voters.every((v) => typeof v === 'string' && usernames.has(v)) || new Set(voters).size !== voters.length) {
    throw invalid('invites someone who is not on the team');
  }
  const validOption = (o: unknown) =>
    isObject(o) &&
    typeof o.id === 'string' &&
    o.id.length > 0 &&
    o.id.length <= MAX_ID &&
    typeof o.text === 'string' &&
    o.text.length > 0 &&
    [...o.text].length <= MAX_OPTION &&
    (o.addedBy === null || (typeof o.addedBy === 'string' && usernames.has(o.addedBy)));
  if (!Array.isArray(options) || options.length > MAX_OPTIONS || !options.every(validOption)) throw invalid('has broken options');
  const optionIds = options.map((o) => o.id as string);
  if (new Set(optionIds).size !== optionIds.length) throw invalid('has two options with the same id');
  const multi = value.multi as boolean;
  const validBallot = (b: unknown) =>
    Array.isArray(b) &&
    b.length === 2 &&
    typeof b[0] === 'string' &&
    voters.includes(b[0]) &&
    Array.isArray(b[1]) &&
    b[1].length > 0 &&
    (multi || b[1].length === 1) &&
    new Set(b[1]).size === b[1].length &&
    b[1].every((id: unknown) => typeof id === 'string' && optionIds.includes(id));
  if (!Array.isArray(ballots) || !ballots.every(validBallot) || new Set(ballots.map((b) => b[0])).size !== ballots.length) {
    throw invalid('has a ballot from someone who was not invited, or for an option it does not have');
  }
  return fromStored({
    id: value.id,
    title,
    owner: owner as string | null,
    createdAt: new Date(createdAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    voters: voters as string[],
    multi,
    allowCustom: value.allowCustom as boolean,
    anonymous: value.anonymous as boolean,
    showOnMap: value.showOnMap as boolean,
    options: options.map((o) => ({ id: o.id, text: o.text, addedBy: o.addedBy })),
    ballots: ballots as [string, string[]][],
  });
}

function checkVotes(value: unknown, usernames: ReadonlySet<string>): Vote[] {
  // Backups from before voting have no votes, and start with none.
  if (value === undefined) return [];
  if (!isObject(value) || !Array.isArray(value.votes)) throw backupError('its votes are not valid.');
  const votes = value.votes.map((v, i) => checkVote(v, usernames, i + 1));
  if (new Set(votes.map((v) => v.id)).size !== votes.length) throw backupError('two votes have the same id.');
  return votes;
}

// Turns a broken rule from shared/vote.ts into a reply that says what to fix.
function rule<T>(check: () => T): T {
  try {
    return check();
  } catch (err) {
    if (err instanceof VoteRuleError) throw new ApiError(400, err.message);
    throw err;
  }
}

export function createVote({ saved, save: store, team, onChange = () => {}, now = () => new Date() }: VoteOptions) {
  let votes: Vote[] = (saved?.votes ?? []).map(fromStored);
  let writing: Promise<unknown> = Promise.resolve();

  function toJson(): VoteData {
    return { votes: votes.map(toStored) };
  }

  function save(): void | Promise<void> {
    return store(toJson());
  }

  function views(): VoteView[] {
    return votes.map((v) => toView(v));
  }

  // Only the newest closed votes are kept, so the stored value stays small.
  function prune(): void {
    const at = now();
    const keep = new Set(closedNewestFirst(votes, at).slice(0, MAX_CLOSED));
    votes = votes.filter((v) => isOpen(v, at) || keep.has(v));
  }

  // Changes go one at a time, so a slow save is never overtaken by the next change. A reply
  // only says a change is stored once it is, so a change that fails, or fails to save, is undone.
  function change<T>(task: () => T): Promise<T> {
    const run = writing.then(async () => {
      const before = votes.map((v) => fromStored(toStored(v)));
      try {
        const result = task();
        prune();
        await store(toJson());
        onChange(views());
        return result;
      } catch (err) {
        votes = before;
        throw err;
      }
    });
    writing = run.catch(() => {});
    return run;
  }

  function find(id: string): Vote {
    const vote = votes.find((v) => v.id === id);
    if (!vote) throw new ApiError(404, "That vote doesn't exist. It may have been deleted.");
    return vote;
  }

  // Who is calling, if they sent a working login. Anyone may look at the votes.
  function caller(req: ApiRequest): string | undefined {
    if (!req.header('authorization')) return undefined;
    try {
      return team.player(req).username;
    } catch {
      return undefined;
    }
  }

  function mustBeOpenFor(vote: Vote, username: string): void {
    if (!vote.voters.includes(username)) throw new ApiError(403, 'Only invited people can vote on this.');
    if (!isOpen(vote, now())) throw new ApiError(409, 'This vote has ended.');
  }

  async function route(req: ApiRequest): Promise<ApiResponse> {
    const { pathname } = req.url;

    if (req.method === 'GET' && pathname === '/api/vote') {
      const username = caller(req);
      return jsonResponse(200, { votes: votes.map((v) => toView(v, username)) });
    }

    if (req.method === 'POST' && pathname === '/api/vote') {
      const { username } = team.player(req);
      const body = await req.readJson();
      return change(() => {
        const at = now();
        const made = rule(() => cleanNewVote(body, { now: at, members: team.members(), owner: username }));
        if (votes.filter((v) => isOpen(v, at)).length >= MAX_OPEN) {
          throw new ApiError(409, `There are already ${MAX_OPEN} open votes. Wait for one to end or delete one.`);
        }
        const vote: Vote = {
          ...made,
          id: crypto.randomUUID(),
          owner: username,
          createdAt: at.toISOString(),
          options: made.options.map((text, i) => ({ id: `o${i + 1}`, text, addedBy: null })),
          ballots: new Map(),
        };
        votes.push(vote);
        return jsonResponse(201, toView(vote, username));
      });
    }

    const match = pathname.match(/^\/api\/vote\/([^/]+)(?:\/(ballot|options))?$/);
    if (!match) throw new ApiError(404, 'Not found.');
    const id = decodeURIComponent(match[1] ?? '');
    const action = `${req.method} ${match[2] ?? ''}`;

    if (action === 'PATCH ') {
      const { username } = team.player(req);
      const { endsAt } = await req.readJson();
      return change(() => {
        const vote = find(id);
        if (vote.owner !== username) throw new ApiError(403, 'Only the person who made this vote can change its end time.');
        if (!isOpen(vote, now())) throw new ApiError(409, 'This vote has ended.');
        vote.endsAt = rule(() => cleanEndsAt(endsAt, now()));
        return jsonResponse(200, toView(vote, username));
      });
    }

    if (action === 'DELETE ') {
      // The admin password, when sent, is checked with the admin page's own lockout.
      const asAdmin = req.header('x-admin-password') !== undefined;
      if (asAdmin) team.requireAdmin(req);
      const username = asAdmin ? undefined : team.player(req).username;
      return change(() => {
        const vote = find(id);
        if (!asAdmin && (vote.owner === null || vote.owner !== username)) {
          throw new ApiError(403, 'Only the person who made this vote or the admin can delete it.');
        }
        votes = votes.filter((v) => v !== vote);
        return jsonResponse(200, { ok: true });
      });
    }

    if (action === 'POST ballot') {
      const { username } = team.player(req);
      const { choices } = await req.readJson();
      return change(() => {
        const vote = find(id);
        mustBeOpenFor(vote, username);
        vote.ballots.set(username, rule(() => cleanBallot(vote, choices)));
        return jsonResponse(200, toView(vote, username));
      });
    }

    if (action === 'POST options') {
      const { username } = team.player(req);
      const { text } = await req.readJson();
      return change(() => {
        const vote = find(id);
        mustBeOpenFor(vote, username);
        if (!vote.allowCustom) throw new ApiError(403, "This vote doesn't take new options.");
        const clean = rule(() => cleanOption(text));
        // Adding an option that is already there just points at the one there is.
        if (!vote.options.some((o) => optionKey(o.text) === optionKey(clean))) {
          if (vote.options.length >= MAX_OPTIONS) throw new ApiError(409, `This vote already has ${MAX_OPTIONS} options.`);
          // Options are never removed, so the next number is always free.
          vote.options.push({ id: `o${vote.options.length + 1}`, text: clean, addedBy: username });
        }
        return jsonResponse(200, toView(vote, username));
      });
    }

    throw new ApiError(404, 'Not found.');
  }

  /** Answers voting's requests, or returns null for anything else. Never throws. */
  async function handle(req: ApiRequest): Promise<ApiResponse | null> {
    const { pathname } = req.url;
    if (pathname !== '/api/vote' && !pathname.startsWith('/api/vote/')) return null;
    try {
      return await route(req);
    } catch (err) {
      return errorResponse(err);
    }
  }

  const feature: TeamFeature = {
    key: 'vote',
    // Raw ballots, anonymous ones included: a restore needs them. Left out until someone makes a vote.
    backup: () => (votes.length ? toJson() : undefined),
    checkBackup(value, usernames) {
      const restored = checkVotes(value, usernames);
      return () =>
        change(() => {
          votes = restored;
        });
    },
    // Their ballots and invitations go. Votes they made stay, made by "a former member".
    forget: (usernames) =>
      change(() => {
        const gone = new Set(usernames);
        for (const vote of votes) {
          if (vote.owner !== null && gone.has(vote.owner)) vote.owner = null;
          vote.voters = vote.voters.filter((name) => !gone.has(name));
          for (const name of gone) vote.ballots.delete(name);
          for (const option of vote.options) if (option.addedBy !== null && gone.has(option.addedBy)) option.addedBy = null;
        }
      }),
  };

  return { handle, save, views, feature };
}

export type Votes = ReturnType<typeof createVote>;
