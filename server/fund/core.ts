// The team fund's API. It reads the fund's Google Sheet (the tab named after the current year)
// every hour, lets the admin link usernames to names on the sheet, and lets people who are
// ahead hide their look. It keeps its own data (data/fund.json on Node.js, the `fund` key on
// Cloudflare). The sheet stays the one place where payments are recorded; this only reads it.

import {
  canHide,
  csvUrl,
  FUND_EVERY_MS,
  FundSheetError,
  MAX_NAME,
  MAX_SHEET_LINK,
  parseSheet,
  sheetId,
  tierFor,
  type FundAdminView,
  type FundPerson,
  type FundRow,
} from '../../shared/fund.ts';
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

/** What is stored. Rows are kept too, so a restart shows the looks before the sheet is read again. */
export interface FundData {
  sheet: string;
  links: [string, string][];
  hidden: string[];
  rows: FundRow[];
  fetchedAt: string | null;
}

export interface FundOptions {
  saved: Partial<FundData> | null;
  save: (data: FundData) => void | Promise<void>;
  team: Team;
  /** Tells open maps and pages about the new looks and titles. */
  onChange?: (people: FundPerson[]) => void;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  /** Which year it is depends on where the team is. Left out, the computer's own time zone is used. */
  timeZone?: string;
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_CSV = 256 * 1024;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanSheet(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError(400, 'Paste the link to the fund’s Google Sheet.');
  const link = value.trim();
  if (!link) return '';
  if (link.length > MAX_SHEET_LINK || !sheetId(link)) {
    throw new ApiError(400, 'That isn’t a Google Sheets link. Copy the address from the sheet’s browser tab.');
  }
  return link;
}

// username → sheet name. Checked against the team, so nobody is linked who isn't on it.
function cleanLinks(value: unknown, members: ReadonlySet<string>, fail: (why: string) => Error): Map<string, string> {
  if (!Array.isArray(value) || value.length > members.size) throw fail('the links are not a list of usernames and names');
  const links = new Map<string, string>();
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length !== 2) throw fail('a link is not a username and a name');
    const [username, name] = pair;
    if (typeof username !== 'string' || !members.has(username)) throw fail('a link is for someone who is not on the team');
    if (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME) throw fail(`the name for ${username} is empty or too long`);
    if (links.has(username)) throw fail(`${username} is linked twice`);
    links.set(username, name.trim());
  }
  return links;
}

function cleanHidden(value: unknown, members: ReadonlySet<string>): Set<string> {
  if (!Array.isArray(value) || !value.every((name) => typeof name === 'string' && members.has(name))) {
    throw backupError('its fund settings hide the look of someone who is not on the team.');
  }
  return new Set(value as string[]);
}

function checkRows(value: unknown): FundRow[] {
  if (value === undefined) return [];
  const valid = (row: unknown) =>
    isObject(row) && typeof row.name === 'string' && typeof row.title === 'string' && Number.isInteger(row.months);
  if (!Array.isArray(value) || !value.every(valid)) throw backupError('its fund rows are not valid.');
  return (value as FundRow[]).map(({ name, months, title }) => ({ name, months, title }));
}

export function createFund({ saved, save: store, team, onChange = () => {}, now = () => new Date(), fetchImpl = fetch, timeZone }: FundOptions) {
  let sheet = typeof saved?.sheet === 'string' ? saved.sheet : '';
  let links = new Map<string, string>(Array.isArray(saved?.links) ? saved.links : []);
  let hidden = new Set<string>(Array.isArray(saved?.hidden) ? saved.hidden : []);
  let rows: FundRow[] = Array.isArray(saved?.rows) ? saved.rows : [];
  let fetchedAt: string | null = saved?.fetchedAt ?? null;
  let error: string | null = null; // Kept in memory only; the next refresh tells again.
  let triedAt = 0;
  let refreshRun = 0;
  let writing: Promise<unknown> = Promise.resolve();

  function toJson(): FundData {
    return { sheet, links: [...links], hidden: [...hidden], rows, fetchedAt };
  }

  function save(): void | Promise<void> {
    return store(toJson());
  }

  function year(): number {
    return Number(new Intl.DateTimeFormat('en', { timeZone, year: 'numeric' }).format(now()));
  }

  /** Every linked member found on the sheet. A name that left the sheet just shows nothing. */
  function people(): FundPerson[] {
    const byName = new Map(rows.map((row) => [row.name, row]));
    const members = new Set(team.members());
    const found: FundPerson[] = [];
    for (const [username, name] of links) {
      const row = byName.get(name);
      if (!row || !members.has(username)) continue;
      found.push({ username, title: row.title, months: row.months, tier: tierFor(row.months), hidden: hidden.has(username) });
    }
    return found;
  }

  function adminView(): FundAdminView {
    return { sheet, year: year(), fetchedAt, error, rows, links: [...links] };
  }

  // Changes go one at a time, and a reply only says a change is stored once it is. A change
  // that fails, or fails to save, is undone.
  function change<T>(task: () => T): Promise<T> {
    const run = writing.then(async () => {
      const before = { sheet, links: new Map(links), hidden: new Set(hidden), rows, fetchedAt };
      try {
        const result = task();
        await store(toJson());
        onChange(people());
        return result;
      } catch (err) {
        ({ sheet, links, hidden, rows, fetchedAt } = before);
        throw err;
      }
    });
    writing = run.catch(() => {});
    return run;
  }

  async function readSheet(id: string, tab: number): Promise<FundRow[]> {
    let res: Response;
    try {
      res = await fetchImpl(csvUrl(id, tab), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch {
      throw new FundSheetError('Could not reach Google Sheets. It will try again within the hour.');
    }
    // A private sheet answers with a sign-in page instead of CSV.
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/csv')) {
      throw new FundSheetError('Can’t read the sheet. In Google Sheets, set sharing to “Anyone with the link” can view.');
    }
    const text = await res.text();
    if (text.length > MAX_CSV) throw new FundSheetError(`The ${tab} tab is too big to read.`);
    return parseSheet(text, tab);
  }

  /** Reads the sheet again. Never throws: a failure keeps the last rows and is shown to the admin. */
  async function refresh(): Promise<void> {
    const run = ++refreshRun;
    triedAt = now().getTime();
    const id = sheetId(sheet);
    if (!id) {
      error = null;
      if (rows.length || fetchedAt) await change(() => ((rows = []), (fetchedAt = null))).catch(() => {});
      return;
    }
    try {
      const fresh = await readSheet(id, year());
      // A newer refresh, such as one for a new link, wins over this one.
      if (run !== refreshRun) return;
      error = null;
      await change(() => {
        rows = fresh;
        fetchedAt = now().toISOString();
      });
    } catch (err) {
      if (run !== refreshRun) return;
      error = err instanceof FundSheetError ? err.message : 'Could not save what the sheet says. It will try again within the hour.';
      if (!(err instanceof FundSheetError)) console.error(err);
    }
  }

  /** Reads the sheet when the last try is an hour old. For hosts that only run while someone looks. */
  function refreshIfDue(): Promise<void> {
    if (now().getTime() - triedAt < FUND_EVERY_MS) return Promise.resolve();
    return refresh();
  }

  async function route(req: ApiRequest): Promise<ApiResponse> {
    const action = `${req.method} ${req.url.pathname}`;

    if (action === 'GET /api/fund') return jsonResponse(200, { people: people() });

    if (action === 'GET /api/fund/admin') {
      team.requireAdmin(req);
      return jsonResponse(200, adminView());
    }

    // The sheet's link and the links between usernames and names, either or both.
    if (action === 'PATCH /api/fund/admin') {
      team.requireAdmin(req);
      const body = await req.readJson();
      const nextSheet = 'sheet' in body ? cleanSheet(body.sheet) : undefined;
      const members = new Set(team.members());
      const nextLinks = 'links' in body ? cleanLinks(body.links, members, (why) => new ApiError(400, `Can’t save: ${why}.`)) : undefined;
      const newSheet = nextSheet !== undefined && nextSheet !== sheet;
      await change(() => {
        if (nextSheet !== undefined) sheet = nextSheet;
        if (nextLinks) links = nextLinks;
      });
      if (newSheet) await refresh();
      return jsonResponse(200, adminView());
    }

    if (action === 'POST /api/fund/admin/refresh') {
      team.requireAdmin(req);
      await refresh();
      return jsonResponse(200, adminView());
    }

    if (action === 'PATCH /api/fund/me') {
      const { username } = team.player(req);
      const { hidden: hide } = await req.readJson();
      if (typeof hide !== 'boolean') throw new ApiError(400, 'Say whether to hide your fund look.');
      return change(() => {
        const me = people().find((p) => p.username === username);
        if (hide && !(me && canHide(me.tier))) {
          throw new ApiError(403, 'Only people who paid ahead can hide their fund look. Pay the fund to catch up.');
        }
        if (hide) hidden.add(username);
        else hidden.delete(username);
        return jsonResponse(200, { people: people() });
      });
    }

    throw new ApiError(404, 'Not found.');
  }

  /** Answers the fund's requests, or returns null for anything else. Never throws. */
  async function handle(req: ApiRequest): Promise<ApiResponse | null> {
    const { pathname } = req.url;
    if (pathname !== '/api/fund' && !pathname.startsWith('/api/fund/')) return null;
    try {
      return await route(req);
    } catch (err) {
      return errorResponse(err);
    }
  }

  const feature: TeamFeature = {
    key: 'fund',
    // Left out until the admin sets the fund up.
    backup: () => (sheet || links.size || hidden.size ? toJson() : undefined),
    checkBackup(value, usernames) {
      // Backups from before the fund have none of it.
      if (value === undefined) {
        return () => change(() => ((sheet = ''), (links = new Map()), (hidden = new Set()), (rows = []), (fetchedAt = null))).then(() => {});
      }
      if (!isObject(value)) throw backupError('its fund settings are not valid.');
      const nextSheet = value.sheet === undefined ? '' : String(value.sheet);
      if (nextSheet && (nextSheet.length > MAX_SHEET_LINK || !sheetId(nextSheet))) throw backupError('its fund sheet link is not valid.');
      const nextLinks = cleanLinks(value.links ?? [], usernames, (why) => backupError(`in its fund settings, ${why}.`));
      const nextHidden = cleanHidden(value.hidden ?? [], usernames);
      const nextRows = checkRows(value.rows);
      const nextFetchedAt = typeof value.fetchedAt === 'string' && Number.isFinite(Date.parse(value.fetchedAt)) ? value.fetchedAt : null;
      return async () => {
        await change(() => {
          sheet = nextSheet;
          links = nextLinks;
          hidden = nextHidden;
          rows = nextRows;
          fetchedAt = nextFetchedAt;
        });
        void refresh();
      };
    },
    forget: (usernames) =>
      change(() => {
        for (const name of usernames) {
          links.delete(name);
          hidden.delete(name);
        }
      }),
  };

  return { handle, save, people, refresh, refreshIfDue, feature };
}

export type Fund = ReturnType<typeof createFund>;
