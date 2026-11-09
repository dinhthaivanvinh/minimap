// The team fund's rules, shared by the server and the browser: reading the fund's Google
// Sheet, turning months paid ahead or behind into a tier, and who may hide their look.
//
// The sheet works it out like this: a hidden column B counts the months marked "x" (paid)
// or "o" (excused), minus this month's number, and the Title column looks B up in a hidden
// table. We read both. The title is shown as the sheet writes it; the look comes from the
// number, so renaming a title in the sheet never breaks the looks.

/** Worst to best. Matches the bands of the sheet's own title table. */
export const FUND_TIERS = ['broke', 'debtor', 'normal', 'rich', 'generous', 'tycoon', 'billionaire'] as const;

export type FundTier = (typeof FUND_TIERS)[number];

/** One person's row on the year's tab. */
export interface FundRow {
  name: string;
  /** Months paid ahead (+) or behind (−). A blank cell counts as 0, as the sheet's lookup does. */
  months: number;
  title: string;
}

/** What everyone may see about one linked member. */
export interface FundPerson {
  username: string;
  title: string;
  months: number;
  tier: FundTier;
  /** They chose to hide their look. Only counts while they are ahead (see `shownTier`). */
  hidden: boolean;
}

/** What the admin sees on the fund panel. */
export interface FundAdminView {
  /** The sheet's link as the admin pasted it, or '' when there is none. */
  sheet: string;
  /** The tab that is read: the current year. */
  year: number;
  fetchedAt: string | null;
  /** Why the last refresh failed, or null when it worked. */
  error: string | null;
  rows: FundRow[];
  /** username → name on the sheet. */
  links: [string, string][];
}

export const MAX_ROWS = 100;
export const MAX_NAME = 80;
export const MAX_TITLE = 40;
export const MAX_SHEET_LINK = 300;
/** How often the server reads the sheet again. */
export const FUND_EVERY_MS = 60 * 60 * 1000;

export function tierFor(months: number): FundTier {
  if (months <= -2) return 'broke';
  if (months === -1) return 'debtor';
  if (months === 0) return 'normal';
  if (months <= 2) return 'rich';
  if (months <= 5) return 'generous';
  if (months <= 11) return 'tycoon';
  return 'billionaire';
}

const rankOf = (tier: FundTier) => FUND_TIERS.indexOf(tier);

/** Only people ahead on the fund may hide their look. Those behind wear theirs until they pay. */
export function canHide(tier: FundTier): boolean {
  return rankOf(tier) > rankOf('normal');
}

/** The look to draw, or null for none: normal people have none, and people ahead may hide theirs. */
export function shownTier(person: Pick<FundPerson, 'tier' | 'hidden'> | null | undefined): FundTier | null {
  if (!person || person.tier === 'normal') return null;
  if (person.hidden && canHide(person.tier)) return null;
  return person.tier;
}

/** The sheet's id from a pasted link or a bare id, or null when it has none. */
export function sheetId(link: string): string | null {
  const text = link.trim();
  const fromLink = text.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})(?:[/?#]|$)/);
  if (fromLink) return fromLink[1] ?? null;
  return /^[A-Za-z0-9_-]{20,100}$/.test(text) ? text : null;
}

/**
 * The address of one tab as CSV. Reading from row 2 with one header row gives "Name, , Title"
 * first, which is how `parseSheet` knows it got the right tab: Google sends the first tab
 * instead when a tab with that name doesn't exist. Hidden rows (people who left) are left out.
 */
export function csvUrl(id: string, year: number): string {
  const params = new URLSearchParams({ tqx: 'out:csv', sheet: String(year), range: 'A2:C', headers: '1' });
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?${params}`;
}

// Google's CSV quotes every field and doubles quotes inside one.
function csvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else field += ch;
  }
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  return records;
}

export class FundSheetError extends Error {}

/** The rows of one year's tab. Throws a FundSheetError, with what to do, when it isn't that tab. */
export function parseSheet(text: string, year: number): FundRow[] {
  const [header, ...records] = csvRecords(text);
  const label = (i: number) => (header?.[i] ?? '').trim().toLowerCase();
  if (label(0) !== 'name' || label(2) !== 'title') {
    throw new FundSheetError(`Can't find a tab named ${year} with Name and Title columns. Check the tab's name in the sheet.`);
  }
  const rows: FundRow[] = [];
  for (const [rawName = '', rawMonths = '', rawTitle = ''] of records) {
    const name = rawName.trim().slice(0, MAX_NAME);
    const title = rawTitle.trim().slice(0, MAX_TITLE);
    // Totals and empty lines have no title.
    if (!name || !title) continue;
    const months = Number(rawMonths.trim() || 0);
    rows.push({ name, title, months: Number.isInteger(months) ? Math.max(-12, Math.min(12, months)) : 0 });
    if (rows.length === MAX_ROWS) break;
  }
  return rows;
}

// Lowercase without Vietnamese marks or spaces, so "Định" matches "dinh".
function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Sheet names that obviously belong to a username, for the admin to check before saving:
 * the same letters, or the username as one of the name's words ("vinh" for "anh Vinh").
 * A username that fits more than one name, or a name taken twice, gets no suggestion.
 */
export function suggestLinks(usernames: readonly string[], names: readonly string[]): Map<string, string> {
  const found = new Map<string, string>();
  for (const username of usernames) {
    const user = plain(username);
    if (user.length < 2) continue;
    const exact = names.filter((name) => plain(name) === user);
    const byWord = names.filter((name) => name.split(/\s+/).some((word) => plain(word) === user));
    const fits = exact.length ? exact : byWord;
    if (fits.length === 1 && fits[0]) found.set(username, fits[0]);
  }
  const taken = new Map<string, number>();
  for (const name of found.values()) taken.set(name, (taken.get(name) ?? 0) + 1);
  for (const [username, name] of found) if ((taken.get(name) ?? 0) > 1) found.delete(username);
  return found;
}
