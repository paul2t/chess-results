// Tournament search on chess-results.com (TurnierSuche.aspx). It is an ASP.NET form: GET the page,
// then POST it back with its hidden state fields and our criteria. Parsers are pure functions over
// a Document so they run in the browser and in tests.
import type { Fetcher } from './api';
import type { Tournament } from './types';

export const SEARCH_URL = 'https://s2.chess-results.com/TurnierSuche.aspx?lan=1&SNode=S0';

const F = {
  name: 'ctl00$P1$txt_bez',
  type: 'ctl00$P1$combo_art',
  sort: 'ctl00$P1$combo_sort',
  submit: 'ctl00$P1$cb_suchen',
};
/** Tournament types of the form: 2 = round robin for teams, 3 = Swiss system for teams. */
const TEAM_TYPES = ['3', '2'];
const SORT_LAST_UPDATE = '1';

const norm = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** Hidden ASP.NET state (__VIEWSTATE, __EVENTVALIDATION, …) that has to be sent back with the search. */
export function parseSearchForm(doc: Document): Record<string, string> {
  const out: Record<string, string> = {};
  for (const el of Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="hidden"][name]'))) {
    out[el.name] = el.value;
  }
  return out;
}

export interface SearchResults { tournaments: Tournament[]; total: number }

/** Reads the result table: columns are located by their header text, rows by their tnr link. */
export function parseSearchResults(doc: Document): SearchResults {
  const tournaments: Tournament[] = [];
  const table = Array.from(doc.querySelectorAll<HTMLTableElement>('table')).find(
    (t) => t.rows[0] && /^no\.?$/i.test(norm(t.rows[0].cells[0]?.textContent)) && /tournament/i.test(norm(t.rows[0].cells[1]?.textContent)),
  );
  if (table) {
    const head = Array.from(table.rows[0]!.cells).map((c) => norm(c.textContent).toLowerCase());
    const col = (name: string): number => head.indexOf(name);
    const [cFed, cFrom, cTo, cLoc] = [col('fed'), col('from'), col('to'), col('location')];
    for (const row of Array.from(table.rows).slice(1)) {
      const a = row.querySelector<HTMLAnchorElement>('a[href*="tnr"]');
      const tnr = /tnr(\d+)\.aspx/i.exec(a?.getAttribute('href') ?? '')?.[1];
      if (!a || !tnr) continue;
      const at = (i: number): string => (i >= 0 ? norm(row.cells[i]?.textContent) : '');
      tournaments.push({ tnr: parseInt(tnr, 10), name: norm(a.textContent), fed: at(cFed), from: at(cFrom), to: at(cTo), location: at(cLoc) });
    }
  }
  const found = /(\d+)\s+tournaments?\s+(?:were|was)\s+found/i.exec(doc.body?.textContent ?? '');
  return { tournaments, total: found ? parseInt(found[1]!, 10) : tournaments.length };
}

/** Pulls a tournament number out of a pasted chess-results link or a bare number. */
export function parseTnr(input: string): number | null {
  const m = /tnr(\d+)/i.exec(input) ?? /^\s*(\d{5,8})\s*$/.exec(input);
  return m ? parseInt(m[1]!, 10) : null;
}

const toDoc = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

/** Merges lists, drops duplicates, most recent start first. */
export function mergeResults(lists: Tournament[][]): Tournament[] {
  const seen = new Set<number>();
  const all: Tournament[] = [];
  for (const t of lists.flat()) if (!seen.has(t.tnr)) { seen.add(t.tnr); all.push(t); }
  return all.sort((a, b) => b.from.localeCompare(a.from) || b.tnr - a.tnr);
}

/** Searches team tournaments by name (chess-results returns at most 100 per type). */
export async function searchTournaments(f: Fetcher, name: string): Promise<SearchResults> {
  const form = parseSearchForm(toDoc(await f.raw(SEARCH_URL)));
  if (!form['__VIEWSTATE']) throw new Error('Unexpected search page');
  const run = async (type: string): Promise<SearchResults> => {
    const body = new URLSearchParams({ ...form, [F.name]: name, [F.type]: type, [F.sort]: SORT_LAST_UPDATE, [F.submit]: 'Search' });
    return parseSearchResults(toDoc(await f.raw(SEARCH_URL, body.toString())));
  };
  const parts = await Promise.all(TEAM_TYPES.map(run));
  return { tournaments: mergeResults(parts.map((p) => p.tournaments)), total: parts.reduce((n, p) => n + p.total, 0) };
}
