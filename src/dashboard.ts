// Home screen: favorite tournaments, plus a search over chess-results.com team tournaments.
// Opening a tournament is a plain link (<base>/<tnr>), handled by the tournament view in view.ts.
import type { Fetcher } from './api';
import { h, session, store, type Kid } from './dom';
import { FAVS_KEY, isFav, parseFavs, phaseOf, RECENT_KEY, splitFavs, todayStamp, toggleFav } from './favs';
import { flagOf } from './flags';
import { t } from './i18n';
import { getTheme, setTheme, type Theme } from './theme';
import { BASE } from './route';
import { parseTnr, searchTournaments, type SearchResults } from './search';
import type { Tournament } from './types';

const MIN_QUERY = 2;

const day = (stamp: string): string => {
  const d = /^\d{4}\/\d{2}\/\d{2}$/.test(stamp) ? new Date(stamp.replace(/\//g, '-') + 'T00:00:00') : null;
  return d && !isNaN(+d) ? d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : stamp;
};
const range = (from: string, to: string): string => (!to || to === from ? day(from) : `${day(from)} – ${day(to)}`);

const DASH_KEY = 'cr:dash';
const RECENT_SHOWN = 5;

export function startDashboard(root: HTMLElement, fetcher: Fetcher): void {
  const S = {
    favs: parseFavs(store.get(FAVS_KEY)),
    recent: parseFavs(store.get(RECENT_KEY)),
    // opens on live and upcoming favorites, or on the past ones when there are no others; a tab pressed sticks
    favTab: 'auto' as 'auto' | 'current' | 'past',
    query: '',
    results: null as (SearchResults & { query: string }) | null,
    direct: null as number | null,
    loading: false,
    error: '',
  };

  // The last search survives opening a tournament and coming back with Back (for this tab only).
  const persist = (): void => session.set(DASH_KEY, JSON.stringify({ query: S.query, results: S.results, direct: S.direct, favTab: S.favTab }));
  try {
    const saved = JSON.parse(session.get(DASH_KEY) ?? 'null') as { query?: unknown; results?: SearchResults & { query: string } | null; direct?: unknown; favTab?: unknown } | null;
    if (saved && typeof saved.query === 'string') {
      S.query = saved.query;
      if (saved.favTab === 'past' || saved.favTab === 'current') S.favTab = saved.favTab;
      S.direct = Number.isInteger(saved.direct) ? (saved.direct as number) : null;
      const r = saved.results;
      if (r && Array.isArray(r.tournaments)) {
        S.results = { tournaments: parseFavs(JSON.stringify(r.tournaments)), total: Number(r.total) || 0, query: String(r.query ?? '') };
      }
    }
  } catch { /* ignore a corrupt saved search */ }

  const saveFavs = (): void => store.set(FAVS_KEY, JSON.stringify(S.favs));
  const toggle = (tour: Tournament): void => {
    S.favs = toggleFav(S.favs, tour);
    saveFavs();
    render();
  };

  async function search(): Promise<void> {
    const q = S.query.trim();
    S.error = '';
    const tnr = parseTnr(q);
    if (tnr !== null) {
      S.direct = tnr; S.results = null; persist(); render();
      return;
    }
    S.direct = null;
    if (q.length < MIN_QUERY || S.loading) return;
    S.loading = true;
    render();
    try {
      S.results = { ...(await searchTournaments(fetcher, q)), query: q };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      S.error = /HTTP (403|405)/.test(msg) ? t('proxyOutdated') : `${t('error')}: ${msg}`;
      S.results = null;
    } finally {
      S.loading = false;
      persist();
      render();
    }
  }

  function badge(tour: Tournament): HTMLElement | null {
    const p = phaseOf(tour.from, tour.to, todayStamp());
    if (p === 'unknown') return null;
    return h('span', { class: `phase ${p}` }, p === 'live' ? t('live') : p === 'upcoming' ? t('upcoming') : t('ended'));
  }

  function row(tour: Tournament): HTMLElement {
    const fav = isFav(S.favs, tour.tnr);
    return h('div', { class: 'trow tour' },
      h('a', { class: 'tpick', href: `${BASE}${tour.tnr}` },
        h('span', { class: 'tn' },
          h('b', null, tour.name),
          h('small', null, [flagOf(tour.fed), tour.from ? range(tour.from, tour.to) : '', tour.location].filter(Boolean).join(' · '))),
        badge(tour)),
      h('button', {
        class: `star ${fav ? 'on' : ''}`, 'aria-pressed': fav, 'aria-label': fav ? t('removeFav') : t('addFav'),
        onclick: () => toggle(tour),
      }, fav ? '★' : '☆'));
  }

  function setFavTab(tab: 'current' | 'past'): void {
    S.favTab = tab;
    persist();
    render();
  }

  /** Favorites: live and upcoming first; finished ones sit behind a "Past" tab, shown only when there are some (and shown first when nothing is upcoming). */
  function favorites(): HTMLElement {
    const { current, past } = splitFavs(S.favs, todayStamp());
    const tab = !past.length ? 'current' : S.favTab === 'auto' ? (current.length ? 'current' : 'past') : S.favTab;
    const seg = (id: 'current' | 'past', label: string, n: number): HTMLElement =>
      h('button', {
        class: `segbtn ${tab === id ? 'on' : ''}`, role: 'tab', 'aria-selected': tab === id,
        onclick: () => setFavTab(id),
      }, label, h('span', { class: 'count' }, n));
    const list = tab === 'past' ? past : current;
    return h('section', { class: 'stack' },
      h('h2', null, t('favorites')),
      past.length
        ? h('div', { class: 'seg', role: 'tablist', 'aria-label': t('favorites') }, seg('current', t('upcoming'), current.length), seg('past', t('past'), past.length))
        : null,
      list.length
        ? h('div', { class: 'tlist' }, ...list.map((f) => row(f)))
        : h('p', { class: 'empty' }, S.favs.length ? t('noUpcomingFav') : t('noFavorites')));
  }

  /** Tournaments opened lately that are not already favorites. */
  function recent(): HTMLElement | null {
    const list = S.recent.filter((r) => !isFav(S.favs, r.tnr)).slice(0, RECENT_SHOWN);
    if (!list.length) return null;
    return h('section', { class: 'stack' },
      h('div', { class: 'row-between' },
        h('h2', null, t('recent')),
        h('button', { class: 'link', onclick: () => { S.recent = []; store.del(RECENT_KEY); render(); } }, t('clear'))),
      h('div', { class: 'tlist' }, ...list.map((r) => row(r))));
  }

  function searchBox(): HTMLElement {
    const input = h('input', {
      type: 'search', placeholder: t('searchTournaments'), value: S.query, autocomplete: 'off', enterkeyhint: 'search',
      'aria-label': t('searchTournaments'),
      oninput: (e: Event) => { S.query = (e.target as HTMLInputElement).value; persist(); },
    });
    return h('form', { class: 'searchbar', onsubmit: (e: Event) => { e.preventDefault(); void search(); } },
      input, h('button', { class: 'primary', type: 'submit', disabled: S.loading }, S.loading ? '…' : t('searchBtn')));
  }

  function results(): Kid {
    if (S.loading) return h('p', { class: 'empty' }, t('searching'));
    if (S.direct !== null) {
      return h('div', { class: 'tlist' }, row({ tnr: S.direct, name: `${t('openTnr')} ${S.direct}`, fed: '', from: '', to: '', location: '' }));
    }
    const r = S.results;
    if (!r) return null;
    if (!r.tournaments.length) return h('p', { class: 'empty' }, t('noResults'));
    return h('div', { class: 'stack' },
      h('p', { class: 'legend' }, `${t('teamsOnly')} · ${r.tournaments.length} ${t('showing')}`),
      h('div', { class: 'tlist' }, ...r.tournaments.map((x) => row(x))));
  }

  function openSettings(): void {
    const dlg = h('dialog', { class: 'sheet' });
    const proxyInput = h('input', { type: 'text', value: store.get('cr:proxy') ?? '', placeholder: 'https://…/?url={url}' });
    const apply = (): void => {
      const px = proxyInput.value.trim();
      if (px) store.set('cr:proxy', px); else store.del('cr:proxy');
      location.reload();
    };
    const themes: [Theme, string][] = [['auto', t('themeAuto')], ['light', t('themeLight')], ['dark', t('themeDark')]];
    const seg = h('div', { class: 'seg three', role: 'group', 'aria-label': t('theme') });
    const paint = (): void => seg.replaceChildren(...themes.map(([mode, label]) => h('button', {
      class: `segbtn ${getTheme() === mode ? 'on' : ''}`, 'aria-pressed': getTheme() === mode,
      onclick: () => { setTheme(mode); paint(); },
    }, label)));
    paint();
    const auto = h('input', {
      type: 'checkbox', checked: store.get('cr:auto') !== '0',
      onchange: (e: Event) => store.set('cr:auto', (e.target as HTMLInputElement).checked ? '1' : '0'),
    });
    dlg.append(
      h('h2', null, t('settings')),
      h('label', null, t('theme'), seg),
      h('label', { class: 'check' }, auto, t('autoRefresh')),
      h('details', null, h('summary', null, t('proxyUrl')), h('label', null, proxyInput)),
      h('div', { class: 'row-between' },
        h('a', { class: 'link', href: `${BASE}demo` }, t('demo')),
        h('span', null,
          h('button', { class: 'link', onclick: () => dlg.close() }, t('close')),
          h('button', { class: 'primary', onclick: apply }, t('apply')))));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  function render(): void {
    const header = h('header', { class: 'top' },
      h('div', { class: 'title' }, h('h1', null, 'Chess results'), h('p', { class: 'sub' }, t('home'))),
      h('button', { class: 'icon', 'aria-label': t('settings'), onclick: openSettings }, '⚙'));
    const banner = S.error ? h('div', { class: 'banners' }, h('div', { class: 'banner err' }, h('span', null, S.error))) : null;
    root.replaceChildren(...[header, banner, h('main', null, h('div', { class: 'stack' }, favorites(), recent(), searchBox(), results()))]
      .filter((x): x is HTMLElement => x !== null));
  }

  // Back can restore this page from the browser's cache: pick up stars and tournaments changed meanwhile.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    S.favs = parseFavs(store.get(FAVS_KEY));
    S.recent = parseFavs(store.get(RECENT_KEY));
    render();
  });

  document.title = 'Chess results';
  render();
}
