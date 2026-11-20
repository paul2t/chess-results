// Mobile-first viewer for chess-results.com team tournaments.
//   (no ?t)       the dashboard: favorite tournaments + search (src/dashboard.ts)
//   ?t=<tnr>      a tournament (tournament number)
//   ?team=<n|name> the team to follow (number or name, e.g. "Dassault Systemes 1")
//   ?view=team|standings|rounds   ?demo=1 (2025 data, no network)   ?proxy=<url template with {url}>
import { createDemoFetcher, createFetcher, pageUrl, type Fetcher } from './api';
import { startDashboard } from './dashboard';
import { h, store, type Kid } from './dom';
import {
  favTeamsKey, FAVS_KEY, isFav, parseFavs, parseNames, pushRecent, RECENT_KEY, toggleFav, toggleName,
} from './favs';
import { t } from './i18n';
import { loadSnapshot, loadTeamPage } from './loader';
import { formatScore, isPlayed, normName, outcome, type Outcome } from './parse';
import type { BoardGame, Snapshot, TeamMatch, TeamPage, TeamRow, Tournament } from './types';

type View = 'team' | 'standings' | 'rounds';
interface Config { proxies: string[] }

// ───────────────────────────── state ─────────────────────────────

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo') || (window as unknown as { __DEMO__?: boolean }).__DEMO__ === true;

const S = {
  tnr: 0,
  teamRef: null as string | number | null,
  mySnr: null as number | null,
  viewSnr: null as number | null,
  view: 'team' as View,
  round: null as number | null,
  snap: null as Snapshot | null,
  other: new Map<number, TeamPage>(),
  open: new Set<string>(),
  filter: '',
  favTeams: [] as string[],
  favTours: [] as Tournament[],
  loading: false,
  error: '',
  offline: false,
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
const clock = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
  return S.viewSnr === S.mySnr ? S.snap.team : S.other.get(S.viewSnr) ?? null;
}

// ───────────────────────────── favorites & my team ─────────────────────────────

/** Personal state (my team, followed teams…) is kept on this device, except in the demo, which leaves no trace. */
const persist = (k: string, v: string): void => { if (!DEMO) store.set(k, v); };

const sameName = (a: string, b: string): boolean => normName(a) === normName(b);
const isFavTeam = (name: string): boolean => S.favTeams.some((n) => sameName(n, name));
const shortName = (name: string): string => name.replace(/\s*\(.*$/, '') || name;

/** My team or a followed team. */
const isFollowed = (row: TeamRow | undefined): boolean => !!row && (row.snr === S.mySnr || isFavTeam(row.name));

/** Toggle shown in Standings and Rounds: keep only my team and the followed teams (a device setting). */
function followFilter(): HTMLElement {
  return h('button', {
    class: `chipbtn ${S.onlyFav ? 'on' : ''}`, 'aria-pressed': S.onlyFav,
    onclick: () => { S.onlyFav = !S.onlyFav; store.set('cr:onlyfav', S.onlyFav ? '1' : '0'); render(); },
  }, `★ ${t('followedOnly')}`);
}

function toggleFavTeam(row: TeamRow): void {
  S.favTeams = toggleName(S.favTeams, row.name, sameName);
  persist(favTeamsKey(S.tnr), JSON.stringify(S.favTeams));
  render();
}

/** Makes `snr` "my team": the one opened first, kept per tournament, shown on the dashboard. */
function chooseMine(snr: number): void {
  const row = teamOf(snr);
  const prev = S.mySnr !== null && S.mySnr !== snr ? teamOf(S.mySnr) : undefined;
  // the previous "my team" stays one tap away as a followed team; the new one is no longer "just followed"
  if (prev && !isFavTeam(prev.name)) S.favTeams = [...S.favTeams, prev.name];
  if (row) S.favTeams = S.favTeams.filter((n) => !sameName(n, row.name));
  persist(favTeamsKey(S.tnr), JSON.stringify(S.favTeams));
  S.teamRef = snr;
  S.mySnr = snr;
  S.viewSnr = snr;
  if (row) persist(`cr:team:${S.tnr}`, row.name);
  syncUrl();
  void load();
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
    const snap = await loadSnapshot(S.fetcher, S.tnr, S.teamRef, S.snap);
    S.snap = snap;
    S.error = '';
    S.offline = false;
    if (snap.teamSnr !== null) {
      S.mySnr = snap.teamSnr;
      // remembered by name: team numbers can move before the event starts
      const mine = snap.home.teams.find((x) => x.snr === snap.teamSnr);
      if (mine) persist(`cr:team:${S.tnr}`, mine.name);
    }
    refreshFavTournament(snap);
    if (!DEMO) store.set(RECENT_KEY, JSON.stringify(pushRecent(parseFavs(store.get(RECENT_KEY)), tournamentInfo(snap))));
    if (S.viewSnr === null) S.viewSnr = S.mySnr;
    if (S.viewSnr !== null && S.viewSnr !== S.mySnr) {
      const page = await loadTeamPage(S.fetcher, S.tnr, S.viewSnr).catch(() => null);
      if (page) S.other.set(S.viewSnr, page);
    }
    if (S.round === null) S.round = defaultRound(snap);
    persist(cacheKey(S.tnr), JSON.stringify(snap));
  } catch (e) {
    S.error = e instanceof Error ? e.message : String(e);
    S.offline = S.snap !== null;
  } finally {
    S.loading = false;
    render();
  }
}

function defaultRound(s: Snapshot): number {
  const paired = s.rounds.map((r) => r.round);
  return paired.length ? Math.max(...paired) : 1;
}

/** Makes sure the page of another team is loaded (my team's page comes with the snapshot). */
async function ensureTeamPage(snr: number): Promise<void> {
  if (snr === S.mySnr || !S.fetcher || S.other.has(snr)) return;
  S.loading = true;
  render();
  try {
    const page = await loadTeamPage(S.fetcher, S.tnr, snr);
    if (page) S.other.set(snr, page);
    S.error = '';
  } catch (e) {
    S.error = e instanceof Error ? e.message : String(e);
  } finally {
    S.loading = false;
    render();
  }
}

async function openTeam(snr: number): Promise<void> {
  S.viewSnr = snr;
  S.view = 'team';
  syncUrl(true);
  render();
  window.scrollTo(0, 0);
  await ensureTeamPage(snr);
}

// The address carries the whole position (?t, team, view, show = viewed team, rd = round), so reload,
// share and the Back/Forward buttons all land where you were. Changing tab or team adds a history
// entry; picking a round or choosing "my team" only rewrites the current one.
function buildUrl(): string {
  const q = new URLSearchParams(location.search);
  if (!DEMO) q.set('t', String(S.tnr));
  q.delete('team'); // "my team" is personal (kept on this device): a shared link must not carry it
  q.set('view', S.view);
  if (S.view === 'team' && S.viewSnr !== null && S.viewSnr !== S.mySnr) q.set('show', String(S.viewSnr)); else q.delete('show');
  if (S.view === 'rounds' && S.round !== null && S.snap && S.round !== defaultRound(S.snap)) q.set('rd', String(S.round)); else q.delete('rd');
  return `${location.pathname}?${q.toString()}${location.hash}`;
}

function syncUrl(push = false): void {
  const url = buildUrl();
  if (url === `${location.pathname}${location.search}${location.hash}`) return;
  try {
    if (push) history.pushState(null, '', url); else history.replaceState(null, '', url);
  } catch { /* sandboxed frames may refuse */ }
}

/** Back/Forward: put the view, viewed team and round back as the address says. */
function applyUrl(): void {
  const q = new URLSearchParams(location.search);
  const v = q.get('view');
  S.view = v === 'standings' || v === 'rounds' ? v : 'team';
  if (S.view === 'team') S.viewSnr = asInt(q.get('show')) || S.mySnr;
  if (S.view === 'rounds') S.round = asInt(q.get('rd')) || (S.snap ? defaultRound(S.snap) : null);
  render();
  window.scrollTo(0, 0);
  if (S.view === 'team' && S.viewSnr !== null) void ensureTeamPage(S.viewSnr);
}

function setView(v: View): void {
  if (S.view === v) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  S.view = v;
  syncUrl(true);
  render();
  window.scrollTo(0, 0);
}

// ───────────────────────────── rendering ─────────────────────────────

function render(): void {
  const y = window.scrollY;
  const view = S.view === 'standings' ? standingsView() : S.view === 'rounds' ? roundsView() : teamView();
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
  const row = S.view === 'team' && S.viewSnr !== null ? teamOf(S.viewSnr) : undefined;
  return row ? `${shortName(row.name)} – ${name}` : S.view === 'standings' ? `${t('standings')} – ${name}` : S.view === 'rounds' ? `${t('rounds')} – ${name}` : name;
}

function header(): HTMLElement {
  const s = S.snap;
  const sub = s
    ? `${t('updated')} ${clock(s.fetchedAt)}${s.home.lastUpdate ? ` · ${t('source')} ${s.home.lastUpdate}` : ''}`
    : S.loading ? t('loading') : '';
  const fav = isFav(S.favTours, S.tnr);
  return h('header', { class: 'top' },
    h('a', { class: 'icon', href: location.pathname, 'aria-label': t('backHome') }, '‹'),
    h('div', { class: 'title' },
      h('h1', null, s?.home.tournamentName || 'Chess results'),
      h('p', { class: 'sub' }, sub)),
    DEMO ? null : h('button', {
      class: `icon star ${fav ? 'on' : ''}`, 'aria-pressed': fav, 'aria-label': fav ? t('removeFav') : t('addFav'),
      onclick: toggleFavTournament,
    }, fav ? '★' : '☆'),
    h('button', { class: `icon ${S.loading ? 'spin' : ''}`, 'aria-label': t('refresh'), onclick: () => void load() }, '↻'),
    h('button', { class: 'icon', 'aria-label': t('settings'), onclick: openSettings }, '⚙'));
}

function banner(): HTMLElement | null {
  const kids: Kid[] = [];
  if (S.error) {
    const direct = /Cannot reach/.test(S.error);
    kids.push(h('div', { class: 'banner err' },
      h('span', null, S.offline && S.snap ? `${t('offline')} ${clock(S.snap.fetchedAt)}` : `${t('error')}: ${S.error}`),
      direct && !S.snap ? h('small', null, t('proxyNeeded')) : null,
      h('button', { class: 'link', onclick: () => void load() }, t('retry'))));
  }
  if (S.snap && S.viewSnr !== null && S.viewSnr !== S.mySnr) {
    kids.push(h('div', { class: 'banner info' },
      h('span', null, `${t('viewing')}: ${teamOf(S.viewSnr)?.name ?? '#' + S.viewSnr}`),
      S.mySnr !== null ? h('button', { class: 'link', onclick: () => void openTeam(S.mySnr!) }, t('backToMine')) : null));
  }
  return kids.length ? h('div', { class: 'banners' }, ...kids) : null;
}

function nav(): HTMLElement {
  const item = (v: View, icon: string, text: string) =>
    h('button', { class: S.view === v ? 'on' : '', onclick: () => setView(v) }, h('span', { class: 'ico' }, icon), h('span', null, text));
  return h('nav', { class: 'tabs' }, item('team', '♟', t('team')), item('standings', '☰', t('standings')), item('rounds', '⚑', t('rounds')));
}

// ── team view ──

function teamView(): HTMLElement {
  const s = S.snap;
  if (!s) return h('p', { class: 'empty' }, S.loading ? t('loading') : t('noData'));
  if (S.viewSnr === null) return chooser();
  const row = teamOf(S.viewSnr);
  const page = viewedPage();
  if (!row) return h('p', { class: 'empty' }, t('noData'));
  const wrap = h('div', { class: 'stack' }, teamSwitcher(), hero(row, s), statusCard(page, s, row));
  if (page && page.lineup.length) wrap.append(lineupCard(page, s));
  if (page && page.matches.length) wrap.append(matchesCard(page, s));
  return wrap;
}

function chooser(): HTMLElement {
  return h('div', { class: 'stack' }, h('h2', null, t('chooseTeam')), teamList(chooseMine));
}

/** My team and the followed teams, one tap apart. */
function teamSwitcher(): HTMLElement | null {
  const s = S.snap;
  if (!s) return null;
  const entries: { row: TeamRow; mine: boolean }[] = [];
  const mine = S.mySnr !== null ? teamOf(S.mySnr) : undefined;
  if (mine) entries.push({ row: mine, mine: true });
  for (const n of S.favTeams) {
    const r = s.home.teams.find((x) => sameName(x.name, n));
    if (r && r.snr !== mine?.snr) entries.push({ row: r, mine: false });
  }
  if (entries.length < 2) return null;
  return h('div', { class: 'chips tswitch', role: 'tablist', 'aria-label': t('followed') },
    ...entries.map((e) => h('button', {
      class: `tchip ${e.row.snr === S.viewSnr ? 'on' : ''}`, role: 'tab', 'aria-selected': e.row.snr === S.viewSnr,
      onclick: () => void openTeam(e.row.snr),
    }, e.mine ? '♟ ' : '★ ', shortName(e.row.name))));
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
  const isMine = row.snr === S.mySnr;
  const fav = isFavTeam(row.name);
  return h('section', { class: 'card hero' },
    h('h2', null, shortName(row.name)),
    h('p', { class: 'sub' }, [row.fed, row.group, row.name.includes('(') ? row.name.slice(row.name.indexOf('(')) : ''].filter(Boolean).join(' · ')),
    h('div', { class: 'hero-actions' },
      isMine
        ? h('span', { class: 'tag' }, `♟ ${t('myTeam')}`)
        : h('button', { class: 'chipbtn', onclick: () => chooseMine(row.snr) }, `♟ ${t('setMine')}`),
      isMine ? null : h('button', {
        class: `chipbtn ${fav ? 'on' : ''}`, 'aria-pressed': fav, onclick: () => toggleFavTeam(row),
      }, fav ? `★ ${t('unfollow')}` : `☆ ${t('follow')}`)),
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
      h('div', null, `${t('vs')} `, h('b', null, pending.oppName), opp?.rank ? ` (#${opp.rank})` : ''),
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
        h('span', { class: 'on' }, m.oppName),
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
      g.opp.title ? h('em', null, g.opp.title + ' ') : null, natural(g.opp.name)),
    h('span', { class: `pill sm ${outcomeClass(o)}` }, res || '·'));
}

// ── standings ──

function teamList(onPick: (snr: number) => void, withStar = false, filterable = false): HTMLElement {
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
    const shown = s!.home.teams.filter((x) => (!qq || normName(x.name).includes(qq)) && (!filterable || !S.onlyFav || isFollowed(x)));
    if (!shown.length && filterable && S.onlyFav && !qq) {
      return h('div', { class: 'tlist', id: 'tlist' }, h('p', { class: 'empty' }, t('noFollowed')));
    }
    return h('div', { class: 'tlist', id: 'tlist' }, ...shown.map((x) => {
      const fav = isFavTeam(x.name);
      return h('div', { class: `trow ${x.snr === S.mySnr ? 'mine' : ''} ${fav ? 'fav' : ''}`, 'data-snr': x.snr },
        h('button', { class: 'tpick', onclick: () => onPick(x.snr) },
          h('span', { class: 'rk' }, started ? x.rank ?? '' : x.snr),
          h('span', { class: 'tn' }, h('b', null, x.name), h('small', null, started
            ? `${x.fed}${x.group ? ' · ' + x.group : ''} · ${x.wins}-${x.draws}-${x.losses}`
            : `Elo ∅ ${x.rating ?? '–'}`)),
          started ? h('span', { class: 'pts2' }, h('b', null, x.tb[0] ?? ''), h('small', null, x.tb[2] ?? '')) : null),
        withStar && x.snr !== S.mySnr ? h('button', {
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
  const jump = S.mySnr !== null
    ? h('button', {
        class: 'link',
        onclick: () => document.querySelector(`.trow[data-snr="${S.mySnr}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      }, t('scrollToMe'))
    : null;
  return h('div', { class: 'stack' },
    h('div', { class: 'row-between' }, h('h2', null, title), jump),
    h('div', { class: 'hero-actions' }, followFilter()),
    started ? h('p', { class: 'legend' }, `${label(labels[1], 'TB1')} · ${label(labels[3], 'TB3')}`) : null,
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
    ? h('p', { class: 'empty' }, S.favTeams.length || S.mySnr !== null ? t('noFollowedGame') : t('noFollowed'))
    : r
    ? h('div', { class: 'pairs' }, ...shownMatches.map((m) => {
        const home = bySnr(m.home), away = bySnr(m.away);
        const mine = S.mySnr !== null && (home?.snr === S.mySnr || away?.snr === S.mySnr);
        const o = outcome(m.homeScore, m.awayScore);
        const side = (name: string, row: TeamRow | undefined, win: boolean) =>
          h('button', { class: `pt ${win ? 'w' : ''}`, disabled: !row || m.bye && name === m.away, onclick: () => row && void openTeam(row.snr) },
            name, row?.rank && s.home.kind === 'ranking' ? h('small', null, ` #${row.rank}`) : null);
        const followed = !mine && (isFavTeam(m.home) || isFavTeam(m.away));
        return h('div', { class: `pair ${mine ? 'mine' : ''} ${followed ? 'fav' : ''}` },
          h('span', { class: 'no' }, m.no),
          side(m.home, home, o === 'W'),
          h('span', { class: 'res' }, m.bye ? `${formatScore(m.homeScore)}` : scoreText(m.homeScore, m.awayScore)),
          m.bye ? h('span', { class: 'pt bye' }, t('bye')) : side(m.away, away, o === 'L'));
      }))
    : h('p', { class: 'empty' }, `${t('notPaired')}${sched ? ` · ${dayTime(sched.date, sched.time)}` : ''}`);
  return h('div', { class: 'stack' },
    h('div', { class: 'row-between' }, h('h2', null, `${t('round')} ${sel}`), r ? h('span', { class: 'sub' }, dayTime(r.date, r.time)) : null),
    h('div', { class: 'hero-actions' }, followFilter()),
    chips, body);
}

// ───────────────────────────── settings ─────────────────────────────

function openSettings(): void {
  const dlg = h('dialog', { class: 'sheet' });
  const tnrInput = h('input', { type: 'text', inputmode: 'url', value: S.tnr ? `tnr${S.tnr}` : '', placeholder: 'https://chess-results.com/tnr1542962.aspx' });
  const proxyInput = h('input', { type: 'text', value: store.get('cr:proxy') ?? '', placeholder: 'https://…/?url={url}' });
  const auto = h('input', { type: 'checkbox', checked: S.auto, onchange: (e: Event) => { S.auto = (e.target as HTMLInputElement).checked; store.set('cr:auto', S.auto ? '1' : '0'); } });
  const apply = () => {
    const m = /tnr(\d+)/i.exec(tnrInput.value) ?? /^(\d+)$/.exec(tnrInput.value.trim());
    const q = new URLSearchParams(location.search);
    if (m) q.set('t', m[1]!);
    if (m && asInt(m[1]!) !== S.tnr) { q.delete('show'); q.delete('rd'); }
    const px = proxyInput.value.trim();
    if (px) store.set('cr:proxy', px); else store.del('cr:proxy');
    location.search = q.toString();
  };
  dlg.append(
    h('h2', null, t('settings')),
    h('label', null, t('tournament'), tnrInput, h('small', null, t('tournamentHint'))),
    h('label', { class: 'check' }, auto, t('autoRefresh')),
    h('p', null, h('a', { class: 'link', href: pageUrl(S.tnr, {}), target: '_blank', rel: 'noopener noreferrer' }, `${t('openOriginal')} ↗`)),
    h('details', null, h('summary', null, t('proxyUrl')), h('label', null, proxyInput)),
    h('div', { class: 'row-between' },
      h('a', { class: 'link', href: `?demo=1` }, t('demo')),
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
  if (!DEMO && !asInt(params.get('t'))) {
    startDashboard($app, S.fetcher);
    return;
  }

  if (params.has('team')) { // links made before "my team" left the address
    const q = new URLSearchParams(location.search);
    q.delete('team');
    try { history.replaceState(null, '', `${location.pathname}${q.size ? '?' + q.toString() : ''}${location.hash}`); } catch { /* ignore */ }
  }

  S.tnr = DEMO ? 1285835 : asInt(params.get('t'));
  S.favTours = parseFavs(store.get(FAVS_KEY));
  S.favTeams = parseNames(store.get(favTeamsKey(S.tnr)));
  // "My team" is never in the address (so a link can be shared): it comes from this device only, and
  // nobody has one until they choose it. The demo uses a fixed team and leaves no trace.
  S.teamRef = DEMO ? '45' : store.get(`cr:team:${S.tnr}`);
  const v = params.get('view');
  if (v === 'standings' || v === 'rounds' || v === 'team') S.view = v;

  // Show what we saved last time immediately, then refresh.
  const cached = store.get(cacheKey(S.tnr));
  if (cached && !DEMO) {
    try {
      const snap = JSON.parse(cached) as Snapshot;
      if (snap && snap.home) {
        S.snap = snap;
        S.mySnr = snap.teamSnr ?? null;
        S.viewSnr = S.mySnr;
        S.round = defaultRound(snap);
      }
    } catch { /* ignore corrupt cache */ }
  }
  // Position from the address: the team being viewed and the selected round
  const show = asInt(params.get('show'));
  if (show && S.view === 'team') S.viewSnr = show;
  const rd = asInt(params.get('rd'));
  if (rd && S.view === 'rounds') S.round = rd;
  window.addEventListener('popstate', applyUrl);
  render();
  await load();

  setInterval(() => {
    if (!S.auto || document.visibilityState !== 'visible' || (S.snap && isFinished(S.snap))) return;
    void load();
  }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.snap && Date.now() - S.snap.fetchedAt > 30000) void load();
  });
}

void boot();
