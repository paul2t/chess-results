import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import type { Fetcher } from '../src/api';
import { mergeResults, parseSearchForm, parseSearchResults, parseTnr, searchTournaments, SEARCH_URL } from '../src/search';
import {
  isFav, parseFavs, parseNames, phaseOf, pushRecent, sortFavs, splitFavs, toggleFav, toggleName,
} from '../src/favs';
import type { Tournament } from '../src/types';

// searchTournaments uses the browser's DOMParser
(globalThis as { DOMParser?: unknown }).DOMParser = new JSDOM('').window.DOMParser;

const read = (f: string): string => readFileSync(`test/fixtures/${f}`, 'utf8');
const doc = (f: string): Document => new JSDOM(read(f)).window.document;
const T = (tnr: number, from: string, to = from, name = `T${tnr}`): Tournament => ({ tnr, name, fed: '', from, to, location: '' });

test('search form: hidden ASP.NET state is collected', () => {
  const form = parseSearchForm(doc('search-form.html'));
  assert.ok(form['__VIEWSTATE']!.length > 100);
  assert.ok('__EVENTVALIDATION' in form);
  assert.equal(form['__VIEWSTATEGENERATOR'], '11983972');
  assert.equal(form['ctl00$P1$txt_bez'], undefined); // visible fields are ours to fill
});

test('search results: rows, dates and total', () => {
  const r = parseSearchResults(doc('search-results.html'));
  assert.equal(r.total, 100);
  assert.equal(r.tournaments.length, 5);
  const eccc = r.tournaments.find((x) => x.tnr === 1542962)!;
  assert.equal(eccc.name, 'European Corporate Chess Championship 2026');
  assert.equal(eccc.fed, 'ECU');
  assert.equal(eccc.from, '2026/11/27');
  assert.equal(eccc.to, '2026/11/28');
  assert.equal(eccc.location, 'Espace Concorde-Francis Delage');
  assert.equal(r.tournaments[0]!.tnr, 1545510);
});

test('search results: garbage and empty pages do not throw', () => {
  const empty = parseSearchResults(new JSDOM('<html><body><p>0 tournaments were found.</p></body></html>').window.document);
  assert.deepEqual(empty, { tournaments: [], total: 0 });
  assert.deepEqual(parseSearchResults(new JSDOM('').window.document).tournaments, []);
});

test('tournament number from a link or a bare number', () => {
  assert.equal(parseTnr('https://chess-results.com/tnr1542962.aspx?lan=1'), 1542962);
  assert.equal(parseTnr('tnr12345'), 12345);
  assert.equal(parseTnr(' 1542962 '), 1542962);
  assert.equal(parseTnr('corporate'), null);
  assert.equal(parseTnr('2026'), null);
});

test('merge: dedupes and puts the most recent start first', () => {
  const m = mergeResults([[T(1, '2026/01/01'), T(2, '2026/05/01')], [T(2, '2026/05/01'), T(3, '2026/03/01')]]);
  assert.deepEqual(m.map((x) => x.tnr), [2, 3, 1]);
});

test('searchTournaments: GETs the form once, POSTs it back once per team type', async () => {
  const calls: { url: string; form?: string }[] = [];
  const f: Fetcher = {
    source: () => 'test',
    get: () => Promise.reject(new Error('unused')),
    raw: async (url, form) => {
      calls.push({ url, form });
      return form === undefined ? read('search-form.html') : read('search-results.html');
    },
  };
  const r = await searchTournaments(f, 'corporate');
  assert.equal(calls.length, 3);
  assert.equal(calls[0]!.url, SEARCH_URL);
  assert.equal(calls[0]!.form, undefined);
  const posts = calls.slice(1).map((c) => new URLSearchParams(c.form));
  assert.deepEqual(posts.map((p) => p.get('ctl00$P1$combo_art')).sort(), ['2', '3']);
  for (const p of posts) {
    assert.equal(p.get('ctl00$P1$txt_bez'), 'corporate');
    assert.equal(p.get('ctl00$P1$cb_suchen'), 'Search');
    assert.ok(p.get('__VIEWSTATE')!.length > 100);
  }
  assert.equal(r.tournaments.length, 5); // same fixture twice, deduplicated
  assert.equal(r.total, 200);
});

test('searchTournaments: a page without form state is an error', async () => {
  const f: Fetcher = { source: () => 't', get: () => Promise.reject(new Error('x')), raw: async () => '<html></html>' };
  await assert.rejects(searchTournaments(f, 'x'), /Unexpected search page/);
});

test('favorites: parsing is forgiving, toggling adds on top and removes', () => {
  assert.deepEqual(parseFavs(null), []);
  assert.deepEqual(parseFavs('not json'), []);
  assert.deepEqual(parseFavs('{"a":1}'), []);
  const ok = parseFavs(JSON.stringify([{ tnr: 5, name: 'A' }, { tnr: 5, name: 'dup' }, { tnr: 'x' }, null, { tnr: 6 }]));
  assert.deepEqual(ok.map((x) => [x.tnr, x.name]), [[5, 'A'], [6, 'Tournament 6']]);
  let favs: Tournament[] = [];
  favs = toggleFav(favs, T(1, '2026/01/01'));
  favs = toggleFav(favs, T(2, '2026/01/02'));
  assert.deepEqual(favs.map((x) => x.tnr), [2, 1]);
  assert.ok(isFav(favs, 1));
  favs = toggleFav(favs, T(2, '2026/01/02'));
  assert.deepEqual(favs.map((x) => x.tnr), [1]);
});

test('phase and ordering: live, then upcoming (soonest first), then finished (latest first)', () => {
  const today = '2026/11/20';
  assert.equal(phaseOf('2026/11/27', '2026/11/28', today), 'upcoming');
  assert.equal(phaseOf('2026/11/20', '2026/11/20', today), 'live');
  assert.equal(phaseOf('2026/11/18', '2026/11/22', today), 'live');
  assert.equal(phaseOf('2026/11/01', '2026/11/02', today), 'finished');
  assert.equal(phaseOf('', '', today), 'unknown');
  const sorted = sortFavs([T(1, '2026/10/01'), T(2, '2026/12/01'), T(3, '2026/11/20'), T(4, '2026/11/27'), T(5, '2026/09/01')], today);
  assert.deepEqual(sorted.map((x) => x.tnr), [3, 4, 2, 1, 5]);
});

test('favorite teams: names are deduped and toggled case-insensitively', () => {
  assert.deepEqual(parseNames('["A","A","",3]'), ['A']);
  assert.deepEqual(parseNames('oops'), []);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  assert.deepEqual(toggleName(['Alpha'], 'beta', same), ['Alpha', 'beta']);
  assert.deepEqual(toggleName(['Alpha', 'Beta'], 'ALPHA', same), ['Beta']);
});

test('recent tournaments: newest first, no duplicates, capped, details kept', () => {
  let list: Tournament[] = [];
  for (const n of [1, 2, 3]) list = pushRecent(list, T(n, '2026/01/01'), 3);
  assert.deepEqual(list.map((x) => x.tnr), [3, 2, 1]);
  list = pushRecent(list, T(4, '2026/01/01'), 3);
  assert.deepEqual(list.map((x) => x.tnr), [4, 3, 2]); // oldest dropped
  list = pushRecent(list, T(2, '2026/01/01'), 3);
  assert.deepEqual(list.map((x) => x.tnr), [2, 4, 3]); // moved to the front, not duplicated
  const rich: Tournament = { tnr: 9, name: 'Nine', fed: 'FRA', from: '2026/02/01', to: '2026/02/02', location: 'Paris' };
  list = pushRecent([rich], { tnr: 9, name: 'Nine (updated)', fed: '', from: '', to: '', location: '' });
  assert.deepEqual(list, [{ ...rich, name: 'Nine (updated)' }]); // what the tournament page does not say is kept
});

test('favorites split: live and upcoming first, finished apart, undated stay with the first', () => {
  const today = '2026/11/20';
  const { current, past } = splitFavs(
    [T(1, '2025/11/07'), T(2, '2026/11/27'), T(3, '2026/11/20'), T(4, ''), T(5, '2026/01/10', '2026/01/11')], today);
  assert.deepEqual(current.map((x) => x.tnr), [3, 2, 4]); // live, then upcoming, then undated
  assert.deepEqual(past.map((x) => x.tnr), [5, 1]); // most recent first
  assert.deepEqual(splitFavs([], today), { current: [], past: [] });
});
