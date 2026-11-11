// Birthdays and work anniversaries: the API. People set their own birthday (month and day)
// and start date, the admin can set anyone's, and teammates send wishes on the day. It keeps
// its own data (data/celebrate.json on Node.js, the `celebrate` key on Cloudflare). Wishes
// only last for the day they were sent; the next day's view simply leaves them out.

import {
  celebrations,
  dateIn,
  isDate,
  isMonthDay,
  type CelebrateDates,
  type CelebrateView,
} from '../../shared/celebrate.ts';
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

export interface CelebrateData {
  people: [string, CelebrateDates][];
  /** Today's wishes: who sent wishes to whom, and the day they are for. */
  wishes: { day: string; to: [string, string[]][] };
}

export interface CelebrateOptions {
  saved: Partial<CelebrateData> | null;
  save: (data: CelebrateData) => void | Promise<void>;
  team: Team;
  /** Tells open maps about new dates, new wishes and a new day. */
  onChange?: (view: CelebrateView) => void;
  now?: () => Date;
  /** Which day it is depends on where the team is. Left out, the computer's own time zone is used. */
  timeZone?: string;
}

const NO_DATES: CelebrateDates = { birthday: null, joined: null };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanBirthday(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (!isMonthDay(value)) throw new ApiError(400, 'That birthday isn’t a real day. Pick a month and a day.');
  return value;
}

function cleanJoined(value: unknown, today: string): string | null {
  if (value === null || value === '') return null;
  if (!isDate(value)) throw new ApiError(400, 'That start date isn’t a real date. Pick another.');
  if (value > today) throw new ApiError(400, 'That start date is still to come. Pick today or an earlier day.');
  return value;
}

// Checks a backup's dates against the people in that backup.
function checkPeople(value: unknown, usernames: ReadonlySet<string>): Map<string, CelebrateDates> {
  if (!Array.isArray(value)) throw backupError('its birthdays are not a list.');
  const people = new Map<string, CelebrateDates>();
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length !== 2 || !isObject(pair[1])) throw backupError('a birthday entry is not valid.');
    const [username, { birthday = null, joined = null }] = pair as [unknown, Record<string, unknown>];
    if (typeof username !== 'string' || !usernames.has(username)) throw backupError('it has a birthday for someone who is not on the team.');
    if (people.has(username)) throw backupError(`it has two birthday entries for ${username}.`);
    if ((birthday !== null && !isMonthDay(birthday)) || (joined !== null && !isDate(joined))) {
      throw backupError(`the birthday or start date for ${username} is not valid.`);
    }
    if (birthday || joined) people.set(username, { birthday: birthday as string | null, joined: joined as string | null });
  }
  return people;
}

function checkWishes(value: unknown, usernames: ReadonlySet<string>): { day: string; to: Map<string, Set<string>> } {
  if (value === undefined) return { day: '', to: new Map() };
  const valid =
    isObject(value) &&
    typeof value.day === 'string' &&
    Array.isArray(value.to) &&
    value.to.every(
      (pair) =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        usernames.has(pair[0]) &&
        Array.isArray(pair[1]) &&
        pair[1].every((from: unknown) => typeof from === 'string' && usernames.has(from)),
    );
  if (!valid) throw backupError('its birthday wishes are not valid.');
  const { day, to } = value as unknown as CelebrateData['wishes'];
  return { day, to: new Map(to.map(([name, from]) => [name, new Set(from)])) };
}

// Takes what was stored, keeping only entries that make sense, so a damaged file or storage
// value can't stop the server from starting.
function fromSaved(saved: Partial<CelebrateData> | null): { people: Map<string, CelebrateDates>; wishDay: string; wishes: Map<string, Set<string>> } {
  const people = new Map<string, CelebrateDates>();
  for (const pair of Array.isArray(saved?.people) ? saved.people : []) {
    if (!Array.isArray(pair) || typeof pair[0] !== 'string' || !isObject(pair[1])) continue;
    const { birthday, joined } = pair[1];
    const dates = { birthday: isMonthDay(birthday) ? birthday : null, joined: isDate(joined) ? joined : null };
    if (dates.birthday || dates.joined) people.set(pair[0], dates);
  }
  const wishes = new Map<string, Set<string>>();
  for (const pair of Array.isArray(saved?.wishes?.to) ? saved.wishes.to : []) {
    if (!Array.isArray(pair) || typeof pair[0] !== 'string' || !Array.isArray(pair[1])) continue;
    wishes.set(pair[0], new Set(pair[1].filter((from: unknown) => typeof from === 'string')));
  }
  const wishDay = typeof saved?.wishes?.day === 'string' ? saved.wishes.day : '';
  return { people, wishDay, wishes };
}

export function createCelebrate({ saved, save: store, team, onChange = () => {}, now = () => new Date(), timeZone }: CelebrateOptions) {
  // Per-person data lives in Maps, so a username such as __proto__ is just a key.
  let { people, wishDay, wishes } = fromSaved(saved);
  let shownDay = '';
  let writing: Promise<unknown> = Promise.resolve();

  const today = () => dateIn(now(), timeZone);

  function toJson(): CelebrateData {
    return { people: [...people], wishes: { day: wishDay, to: [...wishes].map(([name, from]) => [name, [...from]]) } };
  }

  function save(): void | Promise<void> {
    return store(toJson());
  }

  function view(): CelebrateView {
    const day = today();
    const members = new Set(team.members());
    const list = celebrations([...people].filter(([name]) => members.has(name)), day);
    if (wishDay === day) {
      for (const c of list) if (c.days === 0) c.wishes = [...(wishes.get(c.username) ?? [])].filter((name) => members.has(name));
    }
    return { today: day, celebrations: list };
  }

  // Changes go one at a time, and a reply only says a change is stored once it is. A change
  // that fails, or fails to save, is undone.
  function change<T>(task: () => T): Promise<T> {
    const run = writing.then(async () => {
      const before = { people: new Map(people), wishDay, wishes: new Map([...wishes].map(([k, v]) => [k, new Set(v)])) };
      try {
        const result = task();
        await store(toJson());
        onChange(view());
        return result;
      } catch (err) {
        ({ people, wishDay, wishes } = before);
        throw err;
      }
    });
    writing = run.catch(() => {});
    return run;
  }

  /** Tells open maps when a new day starts, so hats and balloons change at midnight. Run it often. */
  function tick(): void {
    const day = today();
    if (day === shownDay) return;
    const first = !shownDay;
    shownDay = day;
    if (!first) onChange(view());
  }

  // The team's own spelling of a username, as the admin typed it.
  function member(value: unknown): string {
    const key = String(value ?? '').toLowerCase();
    const name = team.members().find((m) => m.toLowerCase() === key);
    if (!name) throw new ApiError(404, 'That username does not exist.');
    return name;
  }

  // Sets one person's dates from a request body. A key that is left out stays as it was.
  // Run it inside change(), so it starts from the dates as they are once earlier saves are done:
  // otherwise two quick edits of different fields both start from the old dates, and the last
  // one puts back the other field's old value. Someone with no dates left is dropped, so the
  // data stays small.
  function setDates(username: string, body: Record<string, unknown>): CelebrateDates {
    const current = people.get(username) ?? NO_DATES;
    const dates = {
      birthday: 'birthday' in body ? cleanBirthday(body.birthday) : current.birthday,
      joined: 'joined' in body ? cleanJoined(body.joined, today()) : current.joined,
    };
    if (dates.birthday || dates.joined) people.set(username, dates);
    else people.delete(username);
    return dates;
  }

  async function route(req: ApiRequest): Promise<ApiResponse> {
    const action = `${req.method} ${req.url.pathname}`;

    if (action === 'GET /api/celebrate') return jsonResponse(200, view());

    if (action === 'GET /api/celebrate/me') {
      const { username } = team.player(req);
      return jsonResponse(200, people.get(username) ?? NO_DATES);
    }

    if (action === 'PATCH /api/celebrate/me') {
      const { username } = team.player(req);
      const body = await req.readJson();
      const dates = await change(() => setDates(username, body));
      return jsonResponse(200, dates);
    }

    if (action === 'GET /api/celebrate/admin') {
      team.requireAdmin(req);
      return jsonResponse(200, { people: [...people] });
    }

    if (action === 'PATCH /api/celebrate/admin') {
      team.requireAdmin(req);
      const body = await req.readJson();
      const username = member(body.username);
      await change(() => setDates(username, body));
      return jsonResponse(200, { people: [...people] });
    }

    if (action === 'POST /api/celebrate/wish') {
      const { username: from } = team.player(req);
      const to = member((await req.readJson()).to);
      if (to === from) throw new ApiError(400, 'You can’t send wishes to yourself. Enjoy your day!');
      const day = today();
      if (!view().celebrations.some((c) => c.days === 0 && c.username === to)) {
        throw new ApiError(409, 'They aren’t celebrating today. Try again on the day.');
      }
      // Sending twice changes nothing, so a double tap is fine.
      if (wishDay === day && wishes.get(to)?.has(from)) return jsonResponse(200, view());
      await change(() => {
        if (wishDay !== day) {
          wishDay = day;
          wishes = new Map();
        }
        const sent = wishes.get(to) ?? new Set();
        sent.add(from);
        wishes.set(to, sent);
      });
      return jsonResponse(200, view());
    }

    throw new ApiError(404, 'Not found.');
  }

  /** Answers the celebrations' requests, or returns null for anything else. Never throws. */
  async function handle(req: ApiRequest): Promise<ApiResponse | null> {
    const { pathname } = req.url;
    if (pathname !== '/api/celebrate' && !pathname.startsWith('/api/celebrate/')) return null;
    try {
      return await route(req);
    } catch (err) {
      return errorResponse(err);
    }
  }

  const feature: TeamFeature = {
    key: 'celebrate',
    // Left out until someone sets a date.
    backup: () => (people.size ? toJson() : undefined),
    checkBackup(value, usernames) {
      // Backups from before celebrations have none.
      if (value === undefined) return () => change(() => ((people = new Map()), (wishDay = ''), (wishes = new Map()))).then(() => {});
      if (!isObject(value)) throw backupError('its birthdays are not valid.');
      const nextPeople = checkPeople(value.people ?? [], usernames);
      const nextWishes = checkWishes(value.wishes, usernames);
      return () =>
        change(() => {
          people = nextPeople;
          wishDay = nextWishes.day;
          wishes = nextWishes.to;
        }).then(() => {});
    },
    forget: (usernames) =>
      change(() => {
        const gone = new Set(usernames);
        for (const name of gone) {
          people.delete(name);
          wishes.delete(name);
        }
        for (const from of wishes.values()) for (const name of gone) from.delete(name);
      }),
  };

  return { handle, save, view, tick, feature };
}

export type Celebrate = ReturnType<typeof createCelebrate>;
