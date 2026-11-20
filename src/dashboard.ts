// Home screen: favorite tournaments, plus a search over chess-results.com team tournaments.
// Opening a tournament is a plain link (?t=<tnr>), handled by the tournament view in view.ts.
import type { Fetcher } from './api';
import { h, store, type Kid } from './dom';
import { FAVS_KEY, isFav, parseFavs, phaseOf, sortFavs, todayStamp, toggleFav } from './favs';
import { t } from './i18n';
import { parseTnr, searchTournaments, type SearchResults } from './search';
import type { Tournament } from './types';

const MIN_QUERY = 2;

const day = (stamp: string): string => {
  const d = /^\d{4}\/\d{2}\/\d{2}$/.test(stamp) ? new Date(stamp.replace(/\//g, '-') + 'T00:00:00') : null;
  return d && !isNaN(+d) ? d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : stamp;
};
const range = (from: string, to: string): string => (!to || to === from ? day(from) : `${day(from)} – ${day(to)}`);

/** Name of the team followed in a tournament ("My team"), as remembered by the tournament view. */
const myTeamOf = (tnr: number): string => {
  const v = store.get(`cr:team:${tnr}`) ?? '';
  return /^\d*$/.test(v) ? '' : v.replace(/\s*\(.*$/, '');
};

export function startDashboard(root: HTMLElement, fetcher: Fetcher): void {
  const S = {
    favs: parseFavs(store.get(FAVS_KEY)),
    query: '',
    results: null as (SearchResults & { query: string }) | null,
    direct: null as number | null,
    loading: false,
    error: '',
  };

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
      S.direct = tnr; S.results = null; render();
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
      render();
    }
  }

  function badge(tour: Tournament): HTMLElement | null {
    const p = phaseOf(tour.from, tour.to, todayStamp());
    if (p === 'unknown') return null;
    return h('span', { class: `phase ${p}` }, p === 'live' ? t('live') : p === 'upcoming' ? t('upcoming') : t('ended'));
  }

  function row(tour: Tournament, withTeam: boolean): HTMLElement {
    const fav = isFav(S.favs, tour.tnr);
    const mine = withTeam ? myTeamOf(tour.tnr) : '';
    return h('div', { class: 'trow tour' },
      h('a', { class: 'tpick', href: `?t=${tour.tnr}` },
        h('span', { class: 'tn' },
          h('b', null, tour.name),
          h('small', null, [tour.fed, tour.from ? range(tour.from, tour.to) : '', tour.location].filter(Boolean).join(' · ')),
          mine ? h('small', { class: 'mineteam' }, `♟ ${t('myTeamIs')}: ${mine}`) : null),
        badge(tour)),
      h('button', {
        class: `star ${fav ? 'on' : ''}`, 'aria-pressed': fav, 'aria-label': fav ? t('removeFav') : t('addFav'),
        onclick: () => toggle(tour),
      }, fav ? '★' : '☆'));
  }

  function favorites(): HTMLElement {
    return h('section', { class: 'stack' },
      h('h2', null, t('favorites')),
      S.favs.length
        ? h('div', { class: 'tlist' }, ...sortFavs(S.favs, todayStamp()).map((f) => row(f, true)))
        : h('p', { class: 'empty' }, t('noFavorites')));
  }

  function searchBox(): HTMLElement {
    const input = h('input', {
      type: 'search', placeholder: t('searchTournaments'), value: S.query, autocomplete: 'off', enterkeyhint: 'search',
      'aria-label': t('searchTournaments'),
      oninput: (e: Event) => { S.query = (e.target as HTMLInputElement).value; },
    });
    return h('form', { class: 'searchbar', onsubmit: (e: Event) => { e.preventDefault(); void search(); } },
      input, h('button', { class: 'primary', type: 'submit', disabled: S.loading }, S.loading ? '…' : t('searchBtn')));
  }

  function results(): Kid {
    if (S.loading) return h('p', { class: 'empty' }, t('searching'));
    if (S.direct !== null) {
      return h('div', { class: 'tlist' }, row({ tnr: S.direct, name: `${t('openTnr')} ${S.direct}`, fed: '', from: '', to: '', location: '' }, false));
    }
    const r = S.results;
    if (!r) return null;
    if (!r.tournaments.length) return h('p', { class: 'empty' }, t('noResults'));
    return h('div', { class: 'stack' },
      h('p', { class: 'legend' }, `${t('teamsOnly')} · ${r.tournaments.length} ${t('showing')}`),
      h('div', { class: 'tlist' }, ...r.tournaments.map((x) => row(x, false))));
  }

  function openSettings(): void {
    const dlg = h('dialog', { class: 'sheet' });
    const proxyInput = h('input', { type: 'text', value: store.get('cr:proxy') ?? '', placeholder: 'https://…/?url={url}' });
    const apply = (): void => {
      const px = proxyInput.value.trim();
      if (px) store.set('cr:proxy', px); else store.del('cr:proxy');
      location.reload();
    };
    dlg.append(
      h('h2', null, t('settings')),
      h('details', null, h('summary', null, t('proxyUrl')), h('label', null, proxyInput)),
      h('div', { class: 'row-between' },
        h('a', { class: 'link', href: '?demo=1' }, t('demo')),
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
    root.replaceChildren(...[header, banner, h('main', null, h('div', { class: 'stack' }, favorites(), searchBox(), results()))]
      .filter((x): x is HTMLElement => x !== null));
  }

  document.title = 'Chess results';
  render();
}
