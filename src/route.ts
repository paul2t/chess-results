// The address is the position:  <base><tournament>/<tab>[/<team or round>]
//   /chess-results/                      the dashboard
//   /chess-results/1542962               a tournament (opens on the Team tab)
//   /chess-results/1542962/team/50       the page of team number 50
//   /chess-results/1542962/standings
//   /chess-results/1542962/rounds/4      round 4
//   /chess-results/demo/standings        the 2025 demo (the word demo replaces the tournament number)
// Older links (?t=1542962&view=team&show=50, ?demo=1) are still understood and rewritten to this form.

export type View = 'team' | 'standings' | 'rounds';

export interface Route {
  /** The demo (2025 data, no network); `tnr` is then 0. */
  demo: boolean;
  tnr: number;
  view: View;
  /** Team number on the Team tab. */
  snr: number | null;
  /** Round on the Rounds tab. */
  rd: number | null;
}

const VIEWS: readonly string[] = ['team', 'standings', 'rounds'];
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
  const view = (VIEWS.includes(seg[1] ?? '') ? seg[1] : 'team') as View;
  const arg = asInt(seg[2]);
  return { demo, tnr, view, snr: view === 'team' && arg ? arg : null, rd: view === 'rounds' && arg ? arg : null };
}

/** The route in an old-style query string (?t=…&view=…&show=…&rd=…, ?demo=1), or null. */
export function parseLegacy(search: string): Route | null {
  const q = new URLSearchParams(search);
  const demo = q.has('demo');
  const tnr = asInt(q.get('t'));
  if (!demo && !tnr) return null;
  const v = q.get('view');
  const view: View = v === 'standings' || v === 'rounds' ? v : 'team';
  return { demo, tnr, view, snr: view === 'team' ? asInt(q.get('show')) || null : null, rd: view === 'rounds' ? asInt(q.get('rd')) || null : null };
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
  const arg = r.view === 'team' ? r.snr : r.view === 'rounds' ? r.rd : null;
  if (arg) parts.push(String(arg));
  return base + parts.join('/');
}
