// Mobile-first viewer for chess-results.com team tournaments.
//   /                          the dashboard: favorite tournaments + search (src/dashboard.ts)
//   /<tnr>/teams/<snr>         a tournament (tournament number), its Teams tab on team number <snr>
//   /<tnr>/players/<number>    the card of a player (the list is /<tnr>/players)
//   /<tnr>/standings           /<tnr>/rounds/<round>      the other tabs (see src/route.ts)
//   /demo/…                    the 2025 edition (real data, no network)      ?proxy=<url template with {url}>
import { createDemoFetcher, createFetcher, pageUrl, type Fetcher } from './api';
import { startDashboard } from './dashboard';
import { h, store, type Kid } from './dom';
import {
  favTeamsKey, FAVS_KEY, isFav, parseFavs, parseNames, pushRecent, RECENT_KEY, toggleFav, toggleName,
} from './favs';
import { flagOf } from './flags';
import { t } from './i18n';
import { loadPlayerNumbers, loadPlayerPage, loadPlayers, loadSnapshot, loadTeamPage } from './loader';
import { BASE, buildPath, extraQuery, parseLegacy, parsePath, type Route, type View } from './route';
import { formatScore, isPlayed, normName, outcome, playerKey, ratingOf, type Outcome } from './parse';
import type {
  BoardGame, PlayerGame, PlayerNumbers, PlayerPage, PlayerRow, Snapshot, TeamMatch, TeamPage, TeamRow, Tournament,
} from './types';

interface Config { proxies: string[] }

// ───────────────────────────── state ─────────────────────────────

const params = new URLSearchParams(location.search);
// From the address: a path (/1542962/team/50) or, for links made before, a query (?t=1542962&show=50).
const ROUTE: Route | null = parsePath(location.pathname) ?? parseLegacy(location.search);
const DEMO = ROUTE?.demo === true;

const S = {
  tnr: 0,
  viewSnr: null as number | null,
  view: 'standings' as View,
  round: null as number | null,
  snap: null as Snapshot | null,
  /** Team pages loaded or remembered, most recently used last. */
  pages: new Map<number, TeamPage>(),
  /** Pages fetched since the last refresh of the tournament (the others may be out of date). */
  fresh: new Set<number>(),
  /** Players tab: the starting list, the card numbers, the cards opened (most recent last), the card on show. */
  players: null as PlayerRow[] | null,
  playersAt: 0,
  numbers: null as PlayerNumbers | null,
  cards: new Map<number, PlayerPage>(),
  cardFresh: new Set<number>(),
  viewPno: null as number | null,
  /** Rows of the list whose card could not be found. */
  noCard: new Set<number>(),
  pfilter: '',
  open: new Set<string>(),
  filter: '',
  favTeams: [] as string[],
  favTours: [] as Tournament[],
  loading: false,
  error: '',
  auto: store.get('cr:auto') !== '0',
  onlyFav: store.get('cr:onlyfav') === '1',
  fetcher: null as Fetcher | null,
  cfg: { proxies: [] } as Config,
};

const $app = document.getElementById('app')!;
const asInt = (s: string | null): number => (s && /^\d+$/.test(s) ? parseInt(s, 10) : 0);

// ───────────────────────────── helpers ─────────────────────────────

const natural = (name: string): string => {
  const [last, first] = name.split(',').map((s) => s.trim());
  return first ? `${first} ${last}` : name;
};
const teamOf = (snr: number): TeamRow | undefined => S.snap?.home.teams.find((x) => x.snr === snr);
const bySnr = (name: string): TeamRow | undefined => {
  const n = normName(name);
  return S.snap?.home.teams.find((x) => normName(x.name) === n);
};
const clock = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
/** chess-results' "Last update 22.11.2026 14:10:05" as "14:10" (today) or "21.11 14:10": short enough for a phone header. */
function shortUpload(src: string, now = new Date()): string {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}:\d{2})/.exec(src);
  if (!m) return src;
  const today = +m[1]! === now.getDate() && +m[2]! === now.getMonth() + 1 && +m[3]! === now.getFullYear();
  return today ? m[4]! : `${m[1]}.${m[2]} ${m[4]}`;
}
const dayTime = (date: string, time: string): string => {
  const d = date ? new Date(date.replace(/\//g, '-') + 'T00:00:00') : null;
  const day = d && !isNaN(+d) ? d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : date;
  return `${day} ${time}`.trim();
};
const label = (raw: string | undefined, fallback: string): string => {
  if (!raw) return fallback;
  if (/match\s*points/i.test(raw)) return t('mp');
  if (/game|board/i.test(raw)) return t('gp');
  return raw.replace(/\s*\(.*\)\s*/g, '');
};
const outcomeClass = (o: Outcome | null): string => (o === 'W' ? 'win' : o === 'L' ? 'loss' : o === 'D' ? 'draw' : 'none');
const scoreText = (a: number | null, b: number | null): string => `${formatScore(a)} – ${formatScore(b)}`;

const isFinished = (s: Snapshot): boolean =>
  s.totalRounds > 0 && s.home.roundsPlayed >= s.totalRounds &&
  s.rounds.length >= s.totalRounds && s.rounds.every((r) => r.matches.every(isPlayed));

function viewedPage(): TeamPage | null {
  if (!S.snap || S.viewSnr === null) return null;
  return S.pages.get(S.viewSnr) ?? null;
}

// ───────────────────────────── followed teams ─────────────────────────────

/** Personal state (followed teams…) is kept on this device, except in the demo, which leaves no trace. */
const persist = (k: string, v: string): void => { if (!DEMO) store.set(k, v); };

const sameName = (a: string, b: string): boolean => normName(a) === normName(b);
const isFavTeam = (name: string): boolean => S.favTeams.some((n) => sameName(n, name));
const shortName = (name: string): string => name.replace(/\s*\(.*$/, '') || name;

const isFollowed = (row: TeamRow | undefined): boolean => !!row && isFavTeam(row.name);

/** Toggle shown in Standings and Rounds: keep only the followed teams (a device setting). */
function followFilter(): HTMLElement {
  return h('button', {
    class: `iconbtn star ${S.onlyFav ? 'on' : ''}`, 'aria-pressed': S.onlyFav, 'aria-label': t('followedOnly'), title: t('followedOnly'),
    onclick: () => { S.onlyFav = !S.onlyFav; store.set('cr:onlyfav', S.onlyFav ? '1' : '0'); render(); },
  }, S.onlyFav ? '★' : '☆');
}

/** Header of a page or card: title (and a small line under it) on the left, icon buttons on the right. */
function pageHead(title: string, sub: string, ...icons: Kid[]): HTMLElement {
  return h('div', { class: 'head' },
    h('div', { class: 'head-title' }, h('h2', null, title), sub ? h('p', { class: 'sub' }, sub) : null),
    icons.some(Boolean) ? h('div', { class: 'head-icons' }, ...icons) : null);
}

function toggleFavTeam(row: TeamRow): void {
  S.favTeams = toggleName(S.favTeams, row.name, sameName);
  persist(favTeamsKey(S.tnr), JSON.stringify(S.favTeams));
  render();
}

/** The Teams tab comes back as you left it: the last team opened, or the list of teams. */
const lastTeamKey = (tnr: number) => `cr:lastteam:${tnr}`;

const pagesKey = (tnr: number) => `cr:pages:${tnr}`;
const MAX_PAGES = 8;

/** Keeps a team page (in memory, and on this device for when the wifi drops). */
function rememberPage(snr: number, page: TeamPage): void {
  S.pages.delete(snr);
  S.pages.set(snr, page);
  S.fresh.add(snr);
  while (S.pages.size > MAX_PAGES) S.pages.delete(S.pages.keys().next().value!);
  persist(pagesKey(S.tnr), JSON.stringify([...S.pages]));
}

function tournamentInfo(snap: Snapshot | null): Tournament {
  const first = snap?.schedule[0]?.date ?? '';
  const last = snap?.schedule[snap.schedule.length - 1]?.date ?? first;
  return {
    tnr: S.tnr, name: snap?.home.tournamentName || `Tournament ${S.tnr}`,
    fed: '', from: first, to: last, location: snap?.details?.location ?? '',
  };
}

const saveTournaments = (): void => persist(FAVS_KEY, JSON.stringify(S.favTours));

function toggleFavTournament(): void {
  S.favTours = toggleFav(S.favTours, tournamentInfo(S.snap));
  saveTournaments();
  render();
}

/** Keeps a favorite's name and dates in step with what the tournament page says. */
function refreshFavTournament(snap: Snapshot): void {
  const cur = S.favTours.find((f) => f.tnr === S.tnr);
  if (!cur) return;
  const info = tournamentInfo(snap);
  const next: Tournament = {
    ...cur, name: info.name || cur.name, from: info.from || cur.from, to: info.to || cur.to,
    location: info.location || cur.location,
  };
  if (JSON.stringify(next) === JSON.stringify(cur)) return;
  S.favTours = S.favTours.map((f) => (f.tnr === S.tnr ? next : f));
  saveTournaments();
}

// ───────────────────────────── loading ─────────────────────────────

const cacheKey = (tnr: number) => `cr:snap:${tnr}`;

async function load(): Promise<void> {
  if (S.loading || !S.fetcher) return;
  S.loading = true;
  render();
  try {
    const snap = await loadSnapshot(S.fetcher, S.tnr, S.snap);
    S.snap = snap;
    S.error = '';
    refreshFavTournament(snap);
    if (!DEMO) store.set(RECENT_KEY, JSON.stringify(pushRecent(parseFavs(store.get(RECENT_KEY)), tournamentInfo(snap))));
    S.fresh.clear();
    syncUrl(); // the team on show is only known now when nothing was cached
    if (S.viewSnr !== null) {
      const page = await loadTeamPage(S.fetcher, S.tnr, S.viewSnr).catch(() => null);
      if (page) rememberPage(S.viewSnr, page);
    }
    S.cardFresh.clear();
    if (S.view === 'players') await fetchPlayersTab().catch(() => undefined); // the Players tab refreshes with the rest
    if (S.round === null) S.round = defaultRound(snap);
    persist(cacheKey(S.tnr), JSON.stringify(snap));
  } catch (e) {
    S.error = e instanceof Error ? e.message : String(e);
  } finally {
    S.loading = false;
    render();
  }
}

function defaultRound(s: Snapshot): number {
  const paired = s.rounds.map((r) => r.round);
  return paired.length ? Math.max(...paired) : 1;
}

/** Makes sure the page of a team is loaded and up to date (a remembered page is shown meanwhile). */
async function ensureTeamPage(snr: number): Promise<void> {
  if (!S.fetcher || S.fresh.has(snr)) return;
  const alone = !S.loading; // a refresh already under way keeps the spinner until it is done
  S.loading = true;
  render();
  try {
    const page = await loadTeamPage(S.fetcher, S.tnr, snr);
    if (page) rememberPage(snr, page);
    S.error = '';
  } catch (e) {
    S.error = e instanceof Error ? e.message : String(e);
  } finally {
    if (alone) S.loading = false;
    render();
  }
}

/** Back to the list of teams (the Teams tab without a team). */
function showTeamList(): void {
  S.viewSnr = null;
  syncUrl(true);
  render();
  window.scrollTo(0, 0);
}

async function openTeam(snr: number): Promise<void> {
  // From the list or another tab this is a new page (Back returns there); from another team's page it
  // replaces that team, so Back skips the teams browsed in between.
  const switching = S.view === 'teams' && S.viewSnr !== null;
  S.viewSnr = snr;
  S.view = 'teams';
  syncUrl(!switching);
  render();
  window.scrollTo(0, 0);
  await ensureTeamPage(snr);
}

// The address carries the whole position (/<tnr>/<tab>/<team or round>), so reload, share and the
// Back/Forward buttons all land where you were. Changing tab or opening a team from a list adds a history entry (going from one team to another replaces it); picking a
// round only rewrites the current one.
function buildUrl(): string {
  const rd = S.view === 'rounds' && S.round !== null && (!S.snap || S.round !== defaultRound(S.snap)) ? S.round : null;
  const path = buildPath({ demo: DEMO, tnr: S.tnr, view: S.view, snr: S.view === 'teams' ? S.viewSnr : null, pno: S.view === 'players' ? S.viewPno : null, rd });
  return `${path}${extraQuery(location.search)}${location.hash}`;
}

function syncUrl(push = false): void {
  if (S.view === 'teams') persist(lastTeamKey(S.tnr), S.viewSnr === null ? '' : String(S.viewSnr));
  if (S.view === 'players') persist(lastPlayerKey(S.tnr), S.viewPno === null ? '' : String(S.viewPno));
  const url = buildUrl();
  if (url === `${location.pathname}${location.search}${location.hash}`) return;
  try {
    if (push) history.pushState(null, '', url); else history.replaceState(null, '', url);
  } catch { /* sandboxed frames may refuse */ }
}

/** Back/Forward: put the view, viewed team and round back as the address says. */
function applyUrl(): void {
  const r = parsePath(location.pathname);
  S.view = r?.view ?? 'standings';
  if (S.view === 'teams') S.viewSnr = r?.snr ?? null;
  if (S.view === 'players') S.viewPno = r?.pno ?? null;
  if (S.view === 'rounds') S.round = r?.rd || (S.snap ? defaultRound(S.snap) : null);
  render();
  window.scrollTo(0, 0);
  if (S.view === 'teams' && S.viewSnr !== null) void ensureTeamPage(S.viewSnr);
  if (S.view === 'players') void ensurePlayersTab();
}

function setView(v: View): void {
  if (S.view === v) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  S.view = v;
  syncUrl(true);
  render();
  window.scrollTo(0, 0);
  if (v === 'teams' && S.viewSnr !== null) void ensureTeamPage(S.viewSnr);
  if (v === 'players') void ensurePlayersTab();
}

// ───────────────────────────── rendering ─────────────────────────────

function render(): void {
  const y = window.scrollY;
  const view = S.view === 'standings' ? standingsView() : S.view === 'rounds' ? roundsView() : S.view === 'players' ? playersView() : teamView();
  const b = banner();
  document.title = pageTitle();
  $app.replaceChildren(...[header(), b, h('main', null, view, S.snap ? originalLink() : null), nav()].filter((x): x is HTMLElement => x !== null));
  window.scrollTo(0, y);
  document.querySelector('.rchip.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

/** The same page on chess-results.com, for whatever is on screen (team, standings or round). */
function originalUrl(): string {
  const s = S.snap;
  const started = s?.home.kind === 'ranking';
  if (S.view === 'standings') return pageUrl(S.tnr, { art: started ? 1 : 0 });
  if (S.view === 'rounds') return pageUrl(S.tnr, { art: 2, rd: S.round ?? (s ? defaultRound(s) : 1) });
  if (S.view === 'players') return S.viewPno !== null ? pageUrl(S.tnr, { art: 9, snr: S.viewPno }) : pageUrl(S.tnr, { art: 16, zeilen: 99999 });
  return S.viewSnr !== null ? pageUrl(S.tnr, { art: started ? 20 : 8, snr: S.viewSnr }) : pageUrl(S.tnr, {});
}

function originalLink(): HTMLElement {
  return h('p', { class: 'srclink' },
    h('a', { class: 'link', href: originalUrl(), target: '_blank', rel: 'noopener noreferrer' }, `${t('openOriginal')} ↗`));
}

/** Shown in the tab and in the browser's history list: "<team> – <tournament>" on the Team tab. */
function pageTitle(): string {
  const name = S.snap?.home.tournamentName;
  if (!name) return 'Chess results';
  const row = S.view === 'teams' && S.viewSnr !== null ? teamOf(S.viewSnr) : undefined;
  const card = S.view === 'players' && S.viewPno !== null ? S.cards.get(S.viewPno) : undefined;
  if (card) return `${natural(card.name)} – ${name}`;
  if (S.view === 'players') return `${t('players')} – ${name}`;
  return row ? `${shortName(row.name)} – ${name}` : S.view === 'standings' ? `${t('standings')} – ${name}` : S.view === 'rounds' ? `${t('rounds')} – ${name}` : name;
}

/** Circular arrow drawn around the middle of its box, so it spins on its own centre (the ↻ glyph does not). */
function refreshIcon(): HTMLElement {
  const el = h('span', { class: 'rotor', 'aria-hidden': 'true' });
  el.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 3.5v4.6h-4.6"/></svg>';
  return el;
}

function header(): HTMLElement {
  const s = S.snap;
  const sub = s
    ? `↻ ${clock(s.fetchedAt)}${s.home.lastUpdate ? ` · ↑ ${shortUpload(s.home.lastUpdate)}` : ''}`
    : S.loading ? t('loading') : '';
  const fav = isFav(S.favTours, S.tnr);
  // The last refresh failed but saved data is shown: warn in the header, where nothing moves.
  const warn = s && S.error ? `${t('offline')} ${clock(s.fetchedAt)} – ${S.error}` : null;
  return h('header', { class: 'top' },
    h('a', { class: 'icon', href: BASE, 'aria-label': t('backHome') }, '‹'),
    h('div', { class: 'title' },
      h('h1', null, s?.home.tournamentName || 'Chess results'),
      // ↻ = when this page last fetched, ↑ = when chess-results says it was uploaded (spelled out in the tooltip)
      h('p', { class: `sub ${warn ? 'warn' : ''}`, title: warn ?? (s ? `${t('updated')} · ${t('source')}` : null) }, sub)),
    DEMO ? null : h('button', {
      class: `icon star ${fav ? 'on' : ''}`, 'aria-pressed': fav, 'aria-label': fav ? t('removeFav') : t('addFav'),
      onclick: toggleFavTournament,
    }, fav ? '★' : '☆'),
    h('button', { class: `icon ${S.loading ? 'spin' : ''} ${warn ? 'warn' : ''}`, 'aria-label': warn ? `${t('refresh')} – ${warn}` : t('refresh'), title: warn, onclick: () => void load() }, refreshIcon()),
    h('button', { class: 'icon', 'aria-label': t('settings'), onclick: openSettings }, '⚙'));
}

function banner(): HTMLElement | null {
  const kids: Kid[] = [];
  // With data on screen a failed refresh is shown in the header (see header()), not by pushing the page down.
  if (S.error && !S.snap) {
    const direct = /Cannot reach/.test(S.error);
    kids.push(h('div', { class: 'banner err' },
      h('span', null, `${t('error')}: ${S.error}`),
      direct && !S.snap ? h('small', null, t('proxyNeeded')) : null,
      h('button', { class: 'link', onclick: () => void load() }, t('retry'))));
  }
  return kids.length ? h('div', { class: 'banners' }, ...kids) : null;
}

function nav(): HTMLElement {
  const item = (v: View, icon: string, text: string) =>
    h('button', { class: S.view === v ? 'on' : '', onclick: () => setView(v) }, h('span', { class: 'ico' }, icon), h('span', null, text));
  return h('nav', { class: 'tabs' }, item('standings', '☰', t('standings')), item('teams', '♟', t('teams')), item('players', '♞', t('players')), item('rounds', '⚑', t('rounds')));
}

// ── team view ──

function teamView(): HTMLElement {
  const s = S.snap;
  if (!s) return h('p', { class: 'empty' }, S.loading ? t('loading') : t('noData'));
  if (S.viewSnr === null) return teamsList();
  const row = teamOf(S.viewSnr);
  const page = viewedPage();
  if (!row) return h('p', { class: 'empty' }, t('noData'));
  const wrap = h('div', { class: 'stack' },
    teamBar(), hero(row, s),
    // until the team's page is here, say so rather than guess (an empty page would read as "starts at …")
    page ? statusCard(page, s, row) : h('p', { class: 'empty' }, S.loading ? t('loading') : t('noData')));
  if (page && page.lineup.length) wrap.append(lineupCard(page, s));
  if (page && page.matches.length) wrap.append(matchesCard(page, s));
  return wrap;
}

function teamsList(): HTMLElement {
  return h('div', { class: 'stack' }, pageHead(t('allTeams'), '', followFilter()), teamList((snr) => void openTeam(snr), true, true, true));
}

/** One line: back to the list of teams, then the followed teams, one tap apart. */
function teamBar(): HTMLElement {
  const entries: TeamRow[] = [];
  for (const n of S.favTeams) {
    const r = S.snap?.home.teams.find((x) => sameName(x.name, n));
    if (r && !entries.some((e) => e.snr === r.snr)) entries.push(r);
  }
  return h('div', { class: 'chips tswitch', 'aria-label': t('followed') },
    h('button', { class: 'tchip all', onclick: showTeamList }, `‹ ${t('allTeams')}`),
    ...entries.map((r) => h('button', {
      class: `tchip ${r.snr === S.viewSnr ? 'on' : ''}`, 'aria-current': r.snr === S.viewSnr ? 'true' : null,
      onclick: () => void openTeam(r.snr),
    }, '★ ', shortName(r.name))));
}

function hero(row: TeamRow, s: Snapshot): HTMLElement {
  const started = s.home.kind === 'ranking';
  const stat = (k: string, v: string | number) => h('div', { class: 'stat' }, h('b', null, v), h('span', null, k));
  const labels = s.home.tbLabels;
  const stats: HTMLElement[] = started
    ? [
        stat(t('rank'), `${row.rank ?? '–'}/${s.home.teams.length}`),
        stat(label(labels[1], 'TB1'), row.tb[0] ?? '–'),
        stat(label(labels[3], 'TB3'), row.tb[2] ?? '–'),
        stat(t('record'), `${row.wins}-${row.draws}-${row.losses}`),
      ]
    : [stat(t('seed'), `#${row.snr}`), stat('Elo ∅', row.rating ?? '–')];
  const fav = isFavTeam(row.name);
  const followLabel = fav ? t('unfollow') : t('follow');
  return h('section', { class: 'card hero' },
    pageHead(
      shortName(row.name),
      [flagOf(row.fed), row.group, row.name.includes('(') ? row.name.slice(row.name.indexOf('(')) : ''].filter(Boolean).join(' · '),
      h('button', {
        class: `iconbtn star ${fav ? 'on' : ''}`, 'aria-pressed': fav, 'aria-label': followLabel, title: followLabel,
        onclick: () => toggleFavTeam(row),
      }, fav ? '★' : '☆')),
    h('div', { class: 'stats' }, ...stats));
}

/** Score as shown, or provisional from finished boards while the match is running. */
function liveScore(m: TeamMatch): [number | null, number | null] {
  if (m.played) return [m.usScore, m.oppScore];
  const done = m.boards.filter((b) => b.usPts !== null);
  if (!done.length) return [null, null];
  return [done.reduce((a, b) => a + (b.usPts ?? 0), 0), done.reduce((a, b) => a + (b.oppPts ?? 0), 0)];
}

function statusCard(page: TeamPage | null, s: Snapshot, row: TeamRow): HTMLElement {
  const matches = page?.matches ?? [];
  const pending = matches.find((m) => !m.played);
  const last = [...matches].reverse().find((m) => m.played);
  const finished = isFinished(s);

  if (pending) {
    const [a, b] = liveScore(pending);
    const opp = teamOf(pending.oppSnr);
    const running = a !== null;
    return h('section', { class: `card status ${running ? 'live' : ''}` },
      h('h3', null, running ? t('liveMatch') : t('nextMatch')),
      h('div', { class: 'big' }, `${t('round')} ${pending.round}`, ' · ', dayTime(pending.date, pending.time)),
      h('div', null, `${t('vs')} `, oppLink(pending), opp?.rank ? ` (#${opp.rank})` : ''),
      running ? h('div', { class: 'score' }, scoreText(a, b)) : null);
  }
  if (!matches.length) {
    const first = s.schedule[0];
    return h('section', { class: 'card status' },
      h('h3', null, t('startsAt')),
      h('div', { class: 'big' }, first ? dayTime(first.date, first.time) : '—'),
      s.details?.location ? h('div', { class: 'sub' }, s.details.location) : null,
      null);
  }
  const nextRound = (last?.round ?? 0) + 1;
  const sched = s.schedule.find((r) => r.round === nextRound);
  if (!finished && sched) {
    return h('section', { class: 'card status' },
      h('h3', null, `${t('nextMatch')} · ${t('round')} ${nextRound}`),
      h('div', { class: 'big' }, dayTime(sched.date, sched.time)),
      h('div', { class: 'sub' }, t('notPaired')),
      last ? h('div', { class: 'sub' }, `${t('lastMatch')}: ${t('vs')} ${last.oppName} ${scoreText(last.usScore, last.oppScore)}`) : null);
  }
  return h('section', { class: 'card status' },
    h('h3', null, finished ? t('finished') : t('lastMatch')),
    last ? h('div', null, `${t('vs')} `, h('b', null, last.oppName), ' ', scoreText(last.usScore, last.oppScore)) : null);
}

const CHIP: Record<string, string> = { '1': 'win', '+': 'win forf', '½': 'draw', '0': 'loss', '-': 'loss forf' };

function lineupCard(page: TeamPage, s: Snapshot): HTMLElement {
  const nCols = Math.max(page.roundColumns, page.lineup[0]?.results.length ?? 0);
  const roundsShown = Math.max(nCols, s.home.kind === 'ranking' ? s.totalRounds : 0);
  const chips = (kids: Kid[]) => h('div', { class: 'chips9', style: `--n:${roundsShown}` }, ...kids);
  const head = roundsShown
    ? h('div', { class: 'lhead' }, h('span'), chips(Array.from({ length: roundsShown }, (_, i) => h('span', { class: 'c' }, i + 1))), h('span'))
    : null;
  const rows = page.lineup.map((p) => h('div', { class: 'player' },
    h('span', { class: 'bo' }, p.board),
    h('span', { class: 'nm' }, p.title ? h('em', null, p.title + ' ') : null, natural(p.name),
      p.rating ? h('small', null, ` ${p.rating}`) : null),
    h('span', { class: 'pts' }, roundsShown ? p.points || '–' : ''),
    roundsShown
      ? chips(Array.from({ length: roundsShown }, (_, i) => {
          const r = p.results[i] ?? '';
          return h('span', { class: `chip ${CHIP[r] ?? 'none'}` }, r === '' ? '·' : r);
        }))
      : null));
  return h('section', { class: 'card' }, h('h3', null, t('lineup')), h('div', { class: 'lineup' }, head, ...rows));
}

function matchesCard(page: TeamPage, s: Snapshot): HTMLElement {
  const list = [...page.matches].reverse();
  const latest = page.matches.find((m) => !m.played) ?? page.matches[page.matches.length - 1];
  return h('section', { class: 'card' }, h('h3', null, t('matches')),
    ...list.map((m) => matchCard(m, page, s, m === latest)));
}

/** The opponent's name, which opens that team's page (inside a match summary it must not also fold the match). */
function oppLink(m: TeamMatch, cls = ''): HTMLElement {
  const row = teamOf(m.oppSnr);
  if (!row) return h('span', { class: cls }, m.oppName);
  return h('button', {
    class: `opplink ${cls}`, title: t('openTeam'),
    onclick: (e: Event) => { e.preventDefault(); e.stopPropagation(); void openTeam(row.snr); },
  }, m.oppName);
}

function matchCard(m: TeamMatch, page: TeamPage, _s: Snapshot, defaultOpen: boolean): HTMLElement {
  const key = `${page.snr}:${m.round}`;
  const [a, b] = liveScore(m);
  const o = outcome(a, b);
  const opp = teamOf(m.oppSnr);
  const open = S.open.has(key) || (defaultOpen && !S.open.has(`-${key}`));
  const d = h('details', {
    class: 'match', open,
    ontoggle: (e: Event) => {
      const isOpen = (e.target as HTMLDetailsElement).open;
      S.open.delete(key); S.open.delete(`-${key}`);
      S.open.add(isOpen ? key : `-${key}`);
    },
  },
    h('summary', null,
      h('span', { class: 'rd' }, `R${m.round}`),
      h('span', { class: 'opp' },
        oppLink(m, 'on'),
        h('small', null, [dayTime(m.date, m.time), opp?.rank ? `#${opp.rank}` : ''].filter(Boolean).join(' · '))),
      h('span', { class: `pill ${outcomeClass(o)}` }, scoreText(a, b))),
    h('div', { class: 'boards' }, ...m.boards.map((g) => boardRow(g, page))));
  return d;
}

function boardRow(g: BoardGame, page: TeamPage): HTMLElement {
  const player = page.lineup.find((p) => p.name === g.us.name);
  const o = outcome(g.usPts, g.oppPts);
  const res = g.noPlayer || g.forfeit
    ? `${g.usPts === null ? '' : formatScore(g.usPts)} (${g.noPlayer ? t('noPlayer') : t('forfeit')})`
    : g.usPts === null ? '' : `${formatScore(g.usPts)}–${formatScore(g.oppPts)}`;
  return h('div', { class: 'board' },
    h('span', { class: 'bo' }, g.board),
    h('span', { class: `sq ${g.color ?? ''}`, title: g.color === 'w' ? t('white') : g.color === 'b' ? t('black') : '' }),
    h('span', { class: 'who' },
      h('b', null, natural(g.us.name)), player?.rating ? h('small', null, ` ${player.rating}`) : null,
      h('span', { class: 'vs' }, ' – '),
      g.opp.title ? h('em', null, g.opp.title + ' ') : null, natural(g.opp.name),
      g.opp.rating ? h('small', null, ` ${g.opp.rating}`) : null),
    h('span', { class: `pill sm ${outcomeClass(o)}` }, res || '·'));
}

// ── standings ──

/** `byStart`: in starting order, numbered by starting number (the standings list is in ranking order). */
function teamList(onPick: (snr: number) => void, withStar = false, filterable = false, byStart = false): HTMLElement {
  const s = S.snap;
  if (!s) return h('p', { class: 'empty' }, t('loading'));
  const started = s.home.kind === 'ranking';
  const search = h('input', {
    type: 'search', placeholder: t('search'), value: S.filter, autocomplete: 'off',
    oninput: (e: Event) => {
      S.filter = (e.target as HTMLInputElement).value;
      const list = document.getElementById('tlist');
      if (list) list.replaceWith(buildRows());
    },
  });
  function buildRows(): HTMLElement {
    const qq = normName(S.filter);
    const teams = byStart ? [...s!.home.teams].sort((a, b) => a.snr - b.snr) : s!.home.teams;
    const shown = teams.filter((x) => (!qq || normName(x.name).includes(qq)) && (!filterable || !S.onlyFav || isFollowed(x)));
    if (!shown.length && filterable && S.onlyFav && !qq) {
      return h('div', { class: 'tlist', id: 'tlist' }, h('p', { class: 'empty' }, t('noFollowed')));
    }
    return h('div', { class: 'tlist', id: 'tlist' }, ...shown.map((x) => {
      const fav = isFavTeam(x.name);
      return h('div', { class: `trow ${fav ? 'fav' : ''}`, 'data-snr': x.snr },
        h('button', { class: 'tpick', onclick: () => onPick(x.snr) },
          h('span', { class: 'rk' }, started && !byStart ? x.rank ?? '' : x.snr),
          h('span', { class: 'tn' }, h('b', null, x.name), h('small', null, started
            ? `${flagOf(x.fed)}${x.group ? ' · ' + x.group : ''} · ${x.wins}-${x.draws}-${x.losses}`
            : `Elo ∅ ${x.rating ?? '–'}`)),
          started ? h('span', { class: 'pts2' }, h('b', null, x.tb[0] ?? ''), h('small', null, x.tb[2] ?? '')) : null),
        withStar ? h('button', {
          class: `star ${fav ? 'on' : ''}`, 'aria-pressed': fav, 'aria-label': fav ? t('unfollow') : t('follow'),
          onclick: () => toggleFavTeam(x),
        }, fav ? '★' : '☆') : null);
    }));
  }
  return h('div', null, search, buildRows());
}

function standingsView(): HTMLElement {
  const s = S.snap;
  if (!s) return h('p', { class: 'empty' }, S.loading ? t('loading') : t('noData'));
  const started = s.home.kind === 'ranking';
  const labels = s.home.tbLabels;
  const title = started ? (s.home.listTitle || t('standings')) : t('startingList');
  return h('div', { class: 'stack' },
    pageHead(title, started ? `${label(labels[1], 'TB1')} · ${label(labels[3], 'TB3')}` : '', followFilter()), // the star comes last so it stays put when switching to Rounds
    teamList((snr) => void openTeam(snr), true, true));
}

// ── rounds ──

function roundsView(): HTMLElement {
  const s = S.snap;
  if (!s) return h('p', { class: 'empty' }, S.loading ? t('loading') : t('noData'));
  const total = Math.max(s.totalRounds, s.rounds.length);
  const sel = S.round ?? defaultRound(s);
  const chips = h('div', { class: 'chips' }, ...Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const r = s.rounds.find((x) => x.round === n);
    const done = !!r && r.matches.every(isPlayed);
    return h('button', {
      class: `rchip ${n === sel ? 'on' : ''} ${done ? 'done' : r ? 'live' : ''}`,
      onclick: () => { S.round = n; syncUrl(); render(); },
    }, n);
  }));
  const r = s.rounds.find((x) => x.round === sel);
  const sched = s.schedule.find((x) => x.round === sel);
  const shownMatches = r ? r.matches.filter((m) => !S.onlyFav || isFollowed(bySnr(m.home)) || isFollowed(bySnr(m.away))) : [];
  const body = r && S.onlyFav && !shownMatches.length
    ? h('p', { class: 'empty' }, S.favTeams.length ? t('noFollowedGame') : t('noFollowed'))
    : r
    ? h('div', { class: 'pairs' }, ...shownMatches.map((m) => {
        const home = bySnr(m.home), away = bySnr(m.away);
        const o = outcome(m.homeScore, m.awayScore);
        const side = (name: string, row: TeamRow | undefined, win: boolean) =>
          h('button', { class: `pt ${win ? 'w' : ''}`, disabled: !row || m.bye && name === m.away, onclick: () => row && void openTeam(row.snr) },
            name, row?.rank && s.home.kind === 'ranking' ? h('small', null, ` #${row.rank}`) : null);
        const followed = isFavTeam(m.home) || isFavTeam(m.away);
        return h('div', { class: `pair ${followed ? 'fav' : ''}` },
          h('span', { class: 'no' }, m.no),
          side(m.home, home, o === 'W'),
          h('span', { class: 'res' }, m.bye ? `${formatScore(m.homeScore)}` : scoreText(m.homeScore, m.awayScore)),
          m.bye ? h('span', { class: 'pt bye' }, t('bye')) : side(m.away, away, o === 'L'));
      }))
    : h('p', { class: 'empty' }, `${t('notPaired')}${sched ? ` · ${dayTime(sched.date, sched.time)}` : ''}`);
  return h('div', { class: 'stack' },
    pageHead(`${t('round')} ${sel}`, r ? dayTime(r.date, r.time) : '', followFilter()),
    chips, body);
}

// ───────────────────────────── players ─────────────────────────────

const playersKey = (tnr: number) => `cr:players:${tnr}`;
const numbersKey = (tnr: number) => `cr:numbers:${tnr}`;
const cardsKey = (tnr: number) => `cr:cards:${tnr}`;
const lastPlayerKey = (tnr: number) => `cr:lastplayer:${tnr}`;
/** The starting list and the card numbers hardly change: they are fetched again after this long. */
const PLAYERS_TTL = 5 * 60_000;
const MAX_CARDS = 8;

const inflight = new Map<string, Promise<void>>();
/** One request at a time per page, however many places ask for it. */
function once(key: string, fn: () => Promise<void>): Promise<void> {
  const running = inflight.get(key);
  if (running) return running;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const listStale = (): boolean => Date.now() - S.playersAt > PLAYERS_TTL;
const cardStale = (): boolean => S.viewPno !== null && !S.cardFresh.has(S.viewPno);

/** Keeps a player's card (in memory, and on this device for when the wifi drops). */
function rememberCard(snr: number, page: PlayerPage): void {
  S.cards.delete(snr);
  S.cards.set(snr, page);
  S.cardFresh.add(snr);
  while (S.cards.size > MAX_CARDS) S.cards.delete(S.cards.keys().next().value!);
  persist(cardsKey(S.tnr), JSON.stringify([...S.cards]));
}

/** The requests behind the Players tab: the list, and the card on show. */
async function fetchPlayersTab(): Promise<void> {
  const f = S.fetcher;
  if (!f) return;
  const jobs: Promise<void>[] = [];
  if (listStale()) {
    jobs.push(once('list', async () => {
      S.players = await loadPlayers(f, S.tnr);
      S.playersAt = Date.now();
      persist(playersKey(S.tnr), JSON.stringify(S.players));
    }));
  }
  const pno = S.viewPno;
  if (pno !== null && cardStale()) {
    jobs.push(once(`card:${pno}`, async () => {
      const page = await loadPlayerPage(f, S.tnr, pno);
      if (page) rememberCard(pno, page);
    }));
  }
  await Promise.all(jobs);
}

/** Like ensureTeamPage: shows the spinner while the Players tab loads, and what failed in the header. */
async function ensurePlayersTab(): Promise<void> {
  if (!S.fetcher || !(listStale() || cardStale())) return;
  const alone = !S.loading;
  S.loading = true;
  render();
  try {
    await fetchPlayersTab();
    S.error = '';
  } catch (e) {
    S.error = e instanceof Error ? e.message : String(e);
  } finally {
    if (alone) S.loading = false;
    render();
  }
}

/** The card number of a row of the list (the list itself does not say it): found by name, then by rating. */
function cardNumberOf(row: PlayerRow): number | null {
  const found = S.numbers?.[playerKey(row.name)];
  if (!found?.length) return null;
  return (found.find((x) => x.rating === ratingOf(row)) ?? found[0]!).snr;
}

let numbersAt = 0;

/** Opens the card of a player picked in the list; the first time this fetches the numbers of all players. */
async function openPlayerRow(row: PlayerRow): Promise<void> {
  let snr = cardNumberOf(row);
  const f = S.fetcher;
  if (snr === null && f && Date.now() - numbersAt > PLAYERS_TTL) {
    const alone = !S.loading;
    S.loading = true;
    render();
    try {
      const numbers = await once('numbers', async () => {
        const n = await loadPlayerNumbers(f, S.tnr);
        if (Object.keys(n).length) { S.numbers = n; persist(numbersKey(S.tnr), JSON.stringify(n)); }
      }).then(() => S.numbers);
      numbersAt = Date.now();
      S.error = '';
      snr = numbers ? cardNumberOf(row) : null;
    } catch (e) {
      S.error = e instanceof Error ? e.message : String(e);
    } finally {
      if (alone) S.loading = false;
      render();
    }
  }
  if (snr === null) {
    if (!S.error) { S.noCard.add(row.no); render(); }
    return;
  }
  await openPlayer(snr);
}

async function openPlayer(snr: number): Promise<void> {
  // as for teams: from the list or another tab this is a new page, from another card it replaces that card
  const switching = S.view === 'players' && S.viewPno !== null;
  S.viewPno = snr;
  S.view = 'players';
  syncUrl(!switching);
  render();
  window.scrollTo(0, 0);
  await ensurePlayersTab();
}

function showPlayerList(): void {
  S.viewPno = null;
  syncUrl(true);
  render();
  window.scrollTo(0, 0);
  void ensurePlayersTab();
}

function playersView(): HTMLElement {
  return S.viewPno === null ? playerList() : playerCard(S.viewPno);
}

function playerList(): HTMLElement {
  const rows = S.players;
  if (!rows?.length) return h('p', { class: 'empty' }, !rows && S.loading ? t('loading') : t('noData'));
  const search = h('input', {
    type: 'search', placeholder: t('searchPlayers'), value: S.pfilter, autocomplete: 'off',
    oninput: (e: Event) => {
      S.pfilter = (e.target as HTMLInputElement).value;
      document.getElementById('plist')?.replaceWith(buildRows());
    },
  });
  function buildRows(): HTMLElement {
    const q = normName(S.pfilter);
    const shown = q ? rows!.filter((r) => normName(`${r.title} ${r.name} ${r.team} ${r.fed}`).includes(q)) : rows!;
    return h('div', { class: 'tlist', id: 'plist' }, ...shown.map((r) => {
      const missing = S.noCard.has(r.no);
      return h('div', { class: `trow ${missing ? 'dim' : ''}` },
        h('button', { class: 'tpick', disabled: missing, onclick: () => void openPlayerRow(r) },
          h('span', { class: 'rk' }, r.no),
          h('span', { class: 'tn' },
            h('b', null, r.title ? h('em', null, `${r.title} `) : null, natural(r.name)),
            h('small', null, missing ? t('playerNoCard') : [flagOf(r.fed), r.team, r.board ? `${t('board')} ${r.board}` : ''].filter(Boolean).join(' · '))),
          h('span', { class: 'pts2' }, h('b', null, ratingOf(r) || '–'))));
    }));
  }
  return h('div', { class: 'stack' }, pageHead(t('players'), `${rows.length}`), h('div', null, search, buildRows()));
}

function gameRow(g: PlayerGame): HTMLElement {
  const o = g.result === null ? null : outcome(g.result, 1 - g.result);
  const rating = ratingOf({ ratingI: g.oppRatingI, ratingN: g.oppRatingN });
  const name = g.oppName && !/^bye$/i.test(g.oppName) ? natural(g.oppName) : t('bye');
  return h('div', { class: 'board' },
    h('span', { class: 'bo' }, g.round),
    h('span', { class: `sq ${g.color ?? ''}`, title: g.color === 'w' ? t('white') : g.color === 'b' ? t('black') : '' }),
    h('span', { class: 'who' },
      g.oppTitle ? h('em', null, `${g.oppTitle} `) : null,
      g.oppSnr ? h('button', { class: 'opplink', onclick: () => void openPlayer(g.oppSnr) }, name) : name,
      rating ? h('small', null, ` ${rating}`) : null,
      g.oppFed ? h('small', null, ` ${flagOf(g.oppFed)}`) : null),
    h('span', { class: `pill sm ${outcomeClass(o)}` },
      g.result === null ? '·' : `${formatScore(g.result)}${g.forfeit ? ` (${t('forfeit')})` : ''}`));
}

function playerCard(pno: number): HTMLElement {
  const bar = h('div', { class: 'chips tswitch' },
    h('button', { class: 'tchip all', onclick: showPlayerList }, `‹ ${t('allPlayers')}`));
  const page = S.cards.get(pno);
  if (!page) return h('div', { class: 'stack' }, bar, h('p', { class: 'empty' }, S.loading ? t('loading') : t('noData')));
  const row = S.players?.find((r) => playerKey(r.name) === playerKey(page.name));
  const teamRow = row ? S.snap?.home.teams.find((x) => sameName(x.name, row.team)) : undefined;
  const played = page.games.filter((g) => g.result !== null).length;
  const stat = (k: string, v: string | number) => h('div', { class: 'stat' }, h('b', null, v), h('span', null, k));
  const kv = (k: string, v: Kid): HTMLElement | null =>
    v === null || v === '' || v === undefined || v === false ? null : h('div', { class: 'kv' }, h('span', null, k), h('b', null, v));
  const hero = h('section', { class: 'card hero' },
    pageHead(`${page.title ? `${page.title} ` : ''}${natural(page.name)}`, [flagOf(page.fed), row?.team ?? ''].filter(Boolean).join(' · ')),
    h('div', { class: 'stats' },
      stat(t('rating'), ratingOf(page) || '–'), stat(t('perf'), page.perf ?? '–'),
      stat(t('points'), page.points === null ? '–' : `${formatScore(page.points)}/${played}`), stat(t('rank'), page.rank ?? '–')));
  const details = [
    kv(t('teamLabel'), teamRow ? h('button', { class: 'opplink', onclick: () => void openTeam(teamRow.snr) }, shortName(teamRow.name)) : row?.team),
    kv(t('board'), row?.board),
    kv(t('ratingChange'), page.ratingChange),
    kv(t('fideId'), page.fideId ? h('a', { class: 'opplink', href: `https://ratings.fide.com/profile/${page.fideId}`, target: '_blank', rel: 'noopener noreferrer' }, page.fideId) : ''),
    kv(t('born'), page.birth),
    kv(t('startNo'), page.snr),
  ].filter((x): x is HTMLElement => x !== null);
  return h('div', { class: 'stack' }, bar, hero,
    details.length ? h('section', { class: 'card' }, ...details) : null,
    page.games.length ? h('section', { class: 'card' }, h('h3', null, t('opponents')), h('div', { class: 'opps' }, ...page.games.map(gameRow))) : null);
}

// ───────────────────────────── settings ─────────────────────────────

function openSettings(): void {
  const dlg = h('dialog', { class: 'sheet' });
  const proxyInput = h('input', { type: 'text', value: store.get('cr:proxy') ?? '', placeholder: 'https://…/?url={url}' });
  const auto = h('input', { type: 'checkbox', checked: S.auto, onchange: (e: Event) => { S.auto = (e.target as HTMLInputElement).checked; store.set('cr:auto', S.auto ? '1' : '0'); } });
  const apply = () => {
    const px = proxyInput.value.trim();
    if (px === (store.get('cr:proxy') ?? '')) { dlg.close(); return; }
    if (px) store.set('cr:proxy', px); else store.del('cr:proxy');
    location.reload(); // the proxy is read at start-up
  };
  dlg.append(
    h('h2', null, t('settings')),
    h('label', { class: 'check' }, auto, t('autoRefresh')),
    h('p', null, h('a', { class: 'link', href: pageUrl(S.tnr, {}), target: '_blank', rel: 'noopener noreferrer' }, `${t('openOriginal')} ↗`)),
    h('details', null, h('summary', null, t('proxyUrl')), h('label', null, proxyInput)),
    h('div', { class: 'row-between' },
      h('span', null,
        h('button', { class: 'link', onclick: () => dlg.close() }, t('close')),
        h('button', { class: 'primary', onclick: apply }, t('apply')))));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

// ───────────────────────────── boot ─────────────────────────────

async function boot(): Promise<void> {
  try {
    const res = await fetch('config.json', { cache: 'no-store' });
    if (res.ok) S.cfg = { ...S.cfg, ...(await res.json()) };
  } catch { /* defaults */ }

  const proxies = [params.get('proxy') ?? store.get('cr:proxy') ?? '', ...S.cfg.proxies].filter(Boolean);
  S.fetcher = DEMO ? createDemoFetcher() : createFetcher(proxies);

  // No tournament in the address: show the dashboard (favorites + search).
  if (!ROUTE) {
    startDashboard($app, S.fetcher);
    return;
  }

  S.tnr = DEMO ? 1285835 : ROUTE.tnr;
  S.favTours = parseFavs(store.get(FAVS_KEY));
  S.favTeams = parseNames(store.get(favTeamsKey(S.tnr)));
  // Followed teams are never in the address (so a link can be shared): they come from this device only.
  // Whoever had "my team" here before keeps it as the first followed team.
  const legacy = DEMO ? null : store.get(`cr:team:${S.tnr}`);
  if (legacy !== null) {
    store.del(`cr:team:${S.tnr}`);
    if (!/^\d*$/.test(legacy) && !isFavTeam(legacy)) {
      S.favTeams = [legacy, ...S.favTeams];
      persist(favTeamsKey(S.tnr), JSON.stringify(S.favTeams));
    }
  }
  S.view = ROUTE.view;

  // Show what we saved last time immediately, then refresh.
  const cached = store.get(cacheKey(S.tnr));
  if (cached && !DEMO) {
    try {
      const snap = JSON.parse(cached) as Snapshot;
      if (snap && snap.home) {
        S.snap = snap;
        S.round = defaultRound(snap);
      }
    } catch { /* ignore corrupt cache */ }
    try {
      for (const [snr, page] of JSON.parse(store.get(pagesKey(S.tnr)) ?? '[]') as [number, TeamPage][]) S.pages.set(snr, page);
    } catch { /* ignore corrupt cache */ }
  }
  // Position from the address: the team being viewed and the selected round
  S.viewSnr = ROUTE.view === 'teams' ? ROUTE.snr : DEMO ? null : asInt(store.get(lastTeamKey(S.tnr))) || null;
  S.viewPno = ROUTE.view === 'players' ? ROUTE.pno : DEMO ? null : asInt(store.get(lastPlayerKey(S.tnr))) || null;
  if (!DEMO) { // what the Players tab showed last time, until it is fetched again
    try { S.players = JSON.parse(store.get(playersKey(S.tnr)) ?? 'null') as PlayerRow[] | null; } catch { /* ignore corrupt cache */ }
    try { S.numbers = JSON.parse(store.get(numbersKey(S.tnr)) ?? 'null') as PlayerNumbers | null; } catch { /* ignore corrupt cache */ }
    try {
      for (const [snr, card] of JSON.parse(store.get(cardsKey(S.tnr)) ?? '[]') as [number, PlayerPage][]) S.cards.set(snr, card);
    } catch { /* ignore corrupt cache */ }
  }
  if (ROUTE.rd && S.view === 'rounds') S.round = ROUTE.rd;
  syncUrl(); // an old ?t=… link becomes /<tnr>/…
  window.addEventListener('popstate', applyUrl);
  render();
  const tab = S.view === 'players' ? ensurePlayersTab() : Promise.resolve(); // independent of the tournament page
  await Promise.all([load(), tab]);

  setInterval(() => {
    if (!S.auto || document.visibilityState !== 'visible' || (S.snap && isFinished(S.snap))) return;
    void load();
  }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.snap && Date.now() - S.snap.fetchedAt > 30000) void load();
  });
}

void boot();
