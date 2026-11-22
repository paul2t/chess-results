// The address is the position:  <base><tournament>/<tab>[/<team or round>]
//   /chess-results/                      the dashboard
//   /chess-results/1542962               a tournament (opens on the standings)
//   /chess-results/1542962/teams         the list of teams
//   /chess-results/1542962/teams/50      the page of team number 50
//   /chess-results/1542962/players       the list of players, by rating
//   /chess-results/1542962/players/138   the card of the player with number 138
//   /chess-results/1542962/standings
//   /chess-results/1542962/rounds/4      round 4
//   /chess-results/demo/standings        the 2025 demo (the word demo replaces the tournament number)
// Older links (?t=1542962&view=team&show=50, ?demo=1, /1542962/team/50) are still understood and rewritten to this form.

export type View = 'teams' | 'players' | 'standings' | 'rounds';

export interface Route {
  /** The demo (2025 data, no network); `tnr` is then 0. */
  demo: boolean;
  tnr: number;
  view: View;
  /** Team number on the Teams tab (none: the list of teams). */
  snr: number | null;
  /** Number of the player on the Players tab (none: the list of players). */
  pno: number | null;
  /** Round on the Rounds tab. */
  rd: number | null;
}

const VIEWS: readonly string[] = ['teams', 'players', 'standings', 'rounds'];
const toView = (v: string | null | undefined): View => (v === 'team' ? 'teams' : VIEWS.includes(v ?? '') ? (v as View) : 'standings');
const asInt = (s: string | null | undefined): number => (s && /^\d+$/.test(s) ? parseInt(s, 10) : 0);

/** Everything before the tournament segment: the folder the site is served from, with a trailing slash. */
export function basePath(pathname: string): string {
  return pathname.replace(/\/(\d+|demo)(\/.*)?$/, '/');
}

export const BASE = basePath(location.pathname);

/** The route in an address path, or null when it holds none (the dashboard). */
export function parsePath(pathname: string, base = BASE): Route | null {
  const seg = pathname.slice(base.length).split('/').filter(Boolean);
  const first = seg[0];
  const demo = first === 'demo';
  const tnr = asInt(first);
  if (!demo && !tnr) return null;
  const view = toView(seg[1]);
  const arg = asInt(seg[2]);
  return {
    demo, tnr, view, snr: view === 'teams' && arg ? arg : null,
    pno: view === 'players' && arg ? arg : null, rd: view === 'rounds' && arg ? arg : null,
  };
}

/** The route in an old-style query string (?t=…&view=…&show=…&rd=…, ?demo=1), or null. */
export function parseLegacy(search: string): Route | null {
  const q = new URLSearchParams(search);
  const demo = q.has('demo');
  const tnr = asInt(q.get('t'));
  if (!demo && !tnr) return null;
  const view = toView(q.get('view'));
  return { demo, tnr, view, snr: view === 'teams' ? asInt(q.get('show')) || null : null, pno: null, rd: view === 'rounds' ? asInt(q.get('rd')) || null : null };
}

/** Query parameters that are not part of the position (e.g. ?proxy=) and must survive navigation. */
export function extraQuery(search: string): string {
  const q = new URLSearchParams(search);
  for (const k of ['t', 'team', 'view', 'show', 'rd', 'demo']) q.delete(k);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function buildPath(r: Route, base = BASE): string {
  const parts = [r.demo ? 'demo' : String(r.tnr), r.view];
  const arg = r.view === 'teams' ? r.snr : r.view === 'players' ? r.pno : r.view === 'rounds' ? r.rd : null;
  if (arg) parts.push(String(arg));
  return base + parts.join('/');
}
