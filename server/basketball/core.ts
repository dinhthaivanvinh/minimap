// The basketball arcade's API: leaderboards, signed round tickets and score checks.
// It keeps its own data (data/basketball.json on Node.js, the `basketball` key on
// Cloudflare) and asks the team's core who is playing, so neither has to know the
// other's data. Its scores still go into the admin's one backup file.

import * as crypto from 'node:crypto';
import {
  MAX_ROUND_SCORE,
  ROUND_MS,
  rank,
  replay,
  weekKey,
  type BasketballRecords,
  type RecordScore,
} from '../../shared/basketball.ts';
import {
  ApiError,
  backupError,
  errorResponse,
  jsonResponse,
  safeEqual,
  type ApiRequest,
  type ApiResponse,
  type Team,
  type TeamFeature,
} from '../core.ts';

/** Someone's latest round. The digest is set once its score is saved, so only the same shots can be sent again. */
export interface RoundTicket {
  ticket: string;
  digest?: string;
}

export interface BasketballData {
  records: BasketballRecords | null;
  /** Each player's latest round, by username. */
  rounds: Record<string, RoundTicket>;
}

export interface BasketballOptions {
  saved: Partial<BasketballData> | null;
  save: (data: BasketballData) => void | Promise<void>;
  team: Team;
  now?: () => Date;
}

const RULES = 2; // Bump when the game rules change, so older rounds can't be scored.
const MAX_TICKET = 1024;
const RETRY_MS = 24 * 60 * 60 * 1000; // How long a finished round's score can be sent again.

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The arcade's records used to be kept in the team's data. This takes them out of what
// was saved there, so the team's data drops them, and returns them for the arcade's own store.
export function takeOldBasketball(teamSaved: unknown): BasketballData | null {
  if (!isObject(teamSaved)) return null;
  const records = teamSaved.basketball;
  delete teamSaved.basketball;
  const rounds = new Map<string, RoundTicket>();
  for (const user of Array.isArray(teamSaved.users) ? teamSaved.users : []) {
    if (!isObject(user)) continue;
    const round = user.basketballRound;
    delete user.basketballRound;
    if (typeof user.username !== 'string' || !isObject(round) || typeof round.ticket !== 'string') continue;
    rounds.set(user.username, typeof round.digest === 'string' ? { ticket: round.ticket, digest: round.digest } : { ticket: round.ticket });
  }
  if (!isObject(records) && rounds.size === 0) return null;
  return { records: isObject(records) ? (records as unknown as BasketballRecords) : null, rounds: Object.fromEntries(rounds) };
}

// Checks the arcade's part of a backup against the people in that backup.
function checkRecords(value: unknown, usernames: ReadonlySet<string>): BasketballRecords | null {
  // Backups from before the arcade have no records, and start with empty rankings.
  if (value === undefined) return null;
  const valid = (rows: unknown): rows is RecordScore[] =>
    Array.isArray(rows) &&
    new Set(rows.map((r) => (isObject(r) ? r.username : null))).size === rows.length &&
    rows.every(
      (r) =>
        isObject(r) &&
        typeof r.username === 'string' &&
        usernames.has(r.username) &&
        Number.isInteger(r.score) &&
        (r.score as number) >= 0 &&
        (r.score as number) <= MAX_ROUND_SCORE &&
        typeof r.at === 'string' &&
        Number.isFinite(Date.parse(r.at)),
    );
  if (!isObject(value) || typeof value.week !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.week) || !valid(value.allTime) || !valid(value.weekly)) {
    throw backupError('its basketball records are not valid.');
  }
  return { week: value.week, allTime: value.allTime, weekly: value.weekly };
}

export function createBasketball({ saved, save: store, team, now = () => new Date() }: BasketballOptions) {
  let records: BasketballRecords | null = saved?.records ?? null;
  // A Map, because a username such as "__proto__" would break a plain object.
  const rounds = new Map<string, RoundTicket>(Object.entries(saved?.rounds ?? {}));
  let writing: Promise<unknown> = Promise.resolve();

  function toJson(): BasketballData {
    return { records, rounds: Object.fromEntries(rounds) };
  }

  function save(): void | Promise<void> {
    return store(toJson());
  }

  // Changes go one at a time, so a slow save is never overtaken by the next change.
  function queue<T>(task: () => Promise<T>): Promise<T> {
    const run = writing.then(task);
    writing = run.catch(() => {});
    return run;
  }

  // A reply only says a round or score is stored once it is, so a failed save is undone.
  async function saveOrUndo(undo: () => void): Promise<void> {
    try {
      await store(toJson());
    } catch (err) {
      undo();
      throw err;
    }
  }

  function setRound(username: string, round: RoundTicket | undefined): void {
    if (round) rounds.set(username, round);
    else rounds.delete(username);
  }

  // Only current members are ranked, and the weekly board starts again each Monday (UTC).
  function boards(): BasketballRecords {
    const week = weekKey(now());
    const members = new Set(team.members());
    const keep = (rows: RecordScore[]) => rank(rows.filter((r) => members.has(r.username)));
    return { week, allTime: keep(records?.allTime ?? []), weekly: keep(records?.week === week ? records.weekly : []) };
  }

  async function route(req: ApiRequest): Promise<ApiResponse> {
    const route = `${req.method} ${req.url.pathname}`;

    if (route === 'GET /api/basketball') return jsonResponse(200, boards());

    if (route === 'POST /api/basketball/round') {
      const player = team.player(req);
      const seed = crypto.randomInt(0x100000000);
      const payload = Buffer.from(
        JSON.stringify({
          rules: RULES,
          username: player.username,
          version: player.pinVersion,
          start: now().getTime(),
          seed,
          nonce: crypto.randomBytes(12).toString('hex'),
        }),
      ).toString('base64url');
      const ticket = `${payload}.${team.sign('basketball', payload)}`;
      return queue(async () => {
        // Starting a round replaces the previous ticket.
        const previous = rounds.get(player.username);
        const mine = { ticket };
        rounds.set(player.username, mine);
        await saveOrUndo(() => {
          if (rounds.get(player.username) === mine) setRound(player.username, previous);
        });
        return jsonResponse(201, { seed, ticket });
      });
    }

    if (route === 'POST /api/basketball/score') {
      const player = team.player(req);
      const { ticket, shots } = await req.readJson();
      if (typeof ticket !== 'string' || ticket.length > MAX_TICKET) throw new ApiError(400, 'Invalid round ticket.');
      const [payload = '', sig = ''] = ticket.split('.');
      if (!safeEqual(sig, team.sign('basketball', payload))) throw new ApiError(400, 'Invalid round ticket.');
      let round;
      try {
        round = JSON.parse(Buffer.from(payload, 'base64url').toString());
      } catch {
        throw new ApiError(400, 'Invalid round ticket.');
      }
      if (round.rules !== RULES) throw new ApiError(400, 'Round rules changed. Start a new round.');
      const age = now().getTime() - round.start;
      if (round.username !== player.username || round.version !== player.pinVersion || age < ROUND_MS || age > RETRY_MS) {
        throw new ApiError(400, 'Round is unfinished or expired.');
      }
      let score: number;
      try {
        // The server plays the round again from the shot times, so the browser can't pick its score.
        score = replay(shots, round.seed).score;
      } catch {
        throw new ApiError(400, 'Invalid shot timing.');
      }
      const digest = crypto.createHash('sha256').update(JSON.stringify(shots)).digest('hex');
      return queue(async () => {
        const current = rounds.get(player.username);
        // The same shots may be sent again (a retry); different shots for a finished round may not.
        if (current?.ticket !== ticket || (current.digest && current.digest !== digest)) {
          throw new ApiError(409, 'This round has already ended or been replaced.');
        }
        const board = boards();
        const entry = { username: player.username, score, at: new Date(round.start).toISOString() };
        // One personal best each; an earlier result wins a tie.
        const best = (rows: RecordScore[]) =>
          rank([
            ...rows.filter((r) => r.username !== player.username),
            rows.find((r) => r.username === player.username && r.score >= score) ?? entry,
          ]);
        const next: BasketballRecords = {
          week: board.week,
          allTime: best(board.allTime),
          weekly: weekKey(new Date(round.start)) === board.week ? best(board.weekly) : board.weekly,
        };
        const previousRecords = records;
        const finished = { ticket, digest };
        rounds.set(player.username, finished);
        records = next;
        await saveOrUndo(() => {
          if (rounds.get(player.username) === finished) setRound(player.username, current);
          if (records === next) records = previousRecords;
        });
        return jsonResponse(200, { score, ...next });
      });
    }

    throw new ApiError(404, 'Not found.');
  }

  /** Answers the arcade's requests, or returns null for anything else. Never throws. */
  async function handle(req: ApiRequest): Promise<ApiResponse | null> {
    const { pathname } = req.url;
    if (pathname !== '/api/basketball' && !pathname.startsWith('/api/basketball/')) return null;
    try {
      return await route(req);
    } catch (err) {
      return errorResponse(err);
    }
  }

  const feature: TeamFeature = {
    key: 'basketball',
    // Left out of the backup (undefined) until somebody has played.
    backup: () => records ?? undefined,
    checkBackup(value, usernames) {
      const restored = checkRecords(value, usernames);
      return () =>
        queue(async () => {
          records = restored;
          for (const username of rounds.keys()) if (!usernames.has(username)) rounds.delete(username);
          await save();
        });
    },
    forget: (usernames) =>
      queue(async () => {
        const gone = new Set(usernames);
        const keep = (rows: RecordScore[]) => rows.filter((r) => !gone.has(r.username));
        if (records) records = { week: records.week, allTime: keep(records.allTime), weekly: keep(records.weekly) };
        for (const username of gone) rounds.delete(username);
        await save();
      }),
  };

  return { handle, save, feature };
}

export type Basketball = ReturnType<typeof createBasketball>;
