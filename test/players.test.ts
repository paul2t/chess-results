import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { parsePlayerNumbers, parsePlayerPage, parsePlayers, parseTeamPage, playerKey, ratingOf } from '../src/parse';

const doc = (path: string): Document => new JSDOM(readFileSync(path, 'utf8')).window.document;
const fx = (f: string) => doc(`test/fixtures/${f}`);
const demo = (f: string) => doc(`public/demo/${f}`);

// Real pages of the 2025 European Corporate Chess Championship (tnr1285835), trimmed.

test('starting list (real page): columns, titles, missing FIDE ids', () => {
  const rows = parsePlayers(fx('2025-players-list.html'));
  assert.equal(rows.length, 32);
  assert.deepEqual(rows[0], {
    no: 1, title: 'GM', name: "L'ami, Erwin", fideId: '1007998', ratingI: 2640, ratingN: 0,
    fed: 'NED', team: 'TePe Sigeman', board: 1, snr: null,
  });
  assert.equal(rows[1]!.fed, 'BUL');
  assert.equal(rows[1]!.team, 'Agrofert');
  const noFide = rows.find((r) => r.fideId === '');
  assert.ok(noFide, 'a row without a FIDE id');
  assert.equal(noFide.ratingI, 0);
  assert.equal(ratingOf(noFide), 1500); // national rating when there is no international one
  assert.equal(rows[2]!.title, 'GM');
  assert.equal(rows.find((r) => r.title === '')?.title, '');
});

test('player card (real page): details and one game per round', () => {
  const p = parsePlayerPage(fx('2025-player138.html'), 138)!;
  assert.equal(p.name, "L'ami, Erwin");
  assert.equal(p.title, 'GM');
  assert.equal(p.fed, 'NED');
  assert.equal(p.ratingI, 2640);
  assert.equal(p.perf, 2631);
  assert.equal(p.ratingChange, '1,9');
  assert.equal(p.points, 6.5);
  assert.equal(p.rank, 32);
  assert.equal(p.fideId, '1007998');
  assert.equal(p.birth, '1985');
  assert.equal(p.games.length, 9);
  assert.deepEqual(p.games[0], {
    round: 1, board: 1, oppSnr: 99, oppTitle: '', oppName: 'Coupet, Pascal', oppRatingI: 2139, oppRatingN: 0,
    oppFed: 'FRA', oppPts: 3.5, color: 'b', result: 1, forfeit: false,
  });
  const second = p.games[1]!;
  assert.equal(second.oppTitle, 'IM');
  assert.equal(second.color, 'w');
  assert.equal(second.result, 0.5);
  assert.equal(p.games[5]!.result, 0);
  // 6.5 points = the sum of the results
  assert.equal(p.games.reduce((a, g) => a + (g.result ?? 0), 0), 6.5);
});

test('card numbers come from the opponents on the all-players page (real page)', () => {
  const n = parsePlayerNumbers(fx('2025-players-all.html'));
  // Kovalenko's own block lists his opponents with their numbers
  assert.equal(n[playerKey('Mastrovasilis, Dimitrios')]![0]!.snr, 179);
  assert.equal(n[playerKey('Mastrovasilis, Dimitrios')]![0]!.rating, 2500);
  assert.equal(n[playerKey('Topalov, Veselin')]![0]!.snr, 2);
  // "Kovalenko Igor" (all-players page) and "Kovalenko, Igor" (starting list) are the same key
  assert.equal(playerKey('Kovalenko Igor'), playerKey('Kovalenko, Igor'));
  assert.equal(n[playerKey("L'ami, Erwin")]![0]!.snr, 138);
});

test('demo pages: every listed player with games is found by name and opens', () => {
  const list = parsePlayers(demo('players.html'));
  assert.equal(list.length, 242);
  assert.ok(list.every((r, i) => i === 0 || ratingOf(list[i - 1]!) >= ratingOf(r)), 'sorted by rating');
  const nums = parsePlayerNumbers(demo('player-numbers.html'));
  const found = list.filter((r) => nums[playerKey(r.name)]);
  assert.ok(found.length >= 230, `found ${found.length}`);
  const top = nums[playerKey(list[0]!.name)]![0]!.snr;
  assert.equal(top, 138);
  const card = parsePlayerPage(demo(`player-${top}.html`), top)!;
  assert.equal(card.name, list[0]!.name);
  assert.equal(card.games.length, 9);
});

test('a card with forfeits and byes keeps its rows', () => {
  const html = `<html><body><h2>Player info</h2><table Class="CRs1"><tr><td class="CR">Name</td><td class="CR">Doe, Jane</td></tr><tr><td class="CR">Points</td><td class="CR">1</td></tr></table>
    <table class="CRs1"><tr class="CRng1b"><th class="CRc">Rd.</th><th class="CRc">Bo.</th><th class="CRc">SNo</th><th class="CR"></th><th class="CR">Name</th><th class="CRr">RtgI</th><th class="CRr">RtgN</th><th class="CR">FED</th><th class="CRc">Pts.</th><th class="CRc">Res.</th></tr>
    <tr class="CRng2"><td class="CRc">1</td><td class="CRc">2</td><td class="CRc">7</td><td class="CR"></td><td class="CR">Roe, Max</td><td class="CRr">1800</td><td class="CRr">0</td><td class="CR">FRA</td><td class="CRc">0</td><td class="CR"><table><tr><td><div class="FarbewT"></div></td><td class="CR">+</td></tr></table></td></tr>
    <tr class="CRng1"><td class="CRc">2</td><td class="CRc"></td><td class="CRc"></td><td class="CR"></td><td class="CR">bye</td><td class="CRr"></td><td class="CRr"></td><td class="CR"></td><td class="CRc"></td><td class="CR"></td></tr></table></body></html>`;
  const p = parsePlayerPage(new JSDOM(html).window.document, 5)!;
  assert.equal(p.games.length, 2);
  assert.deepEqual([p.games[0]!.result, p.games[0]!.forfeit, p.games[0]!.color], [1, true, 'w']);
  assert.deepEqual([p.games[1]!.oppSnr, p.games[1]!.result, p.games[1]!.color], [0, null, null]);
  assert.equal(p.fideId, '');
  assert.equal(parsePlayerPage(new JSDOM('<html><body><h2>Player info</h2></body></html>').window.document, 9), null);
});

test('starting list before the event (2026): one Rtg column, card numbers in the name links', () => {
  const rows = parsePlayers(fx('2026-players-list.html'));
  assert.equal(rows.length, 30);
  assert.deepEqual(rows[0], {
    no: 1, title: 'GM', name: 'Vachier-Lagrave, Maxime', fideId: '623539', ratingI: 2712, ratingN: 0,
    fed: 'FRA', team: '16 Anjou 1 (France) Consulting', board: 1, snr: 155,
  });
  assert.equal(rows[1]!.snr, 111);
  assert.ok(rows.every((r) => r.snr !== null && ratingOf(r) > 0));
  // the 2025 list (finished event) has no links: the number is found by name
  assert.ok(parsePlayers(fx('2025-players-list.html')).every((r) => r.snr === null));
});

test('line-up names carry the card number before the event (2026)', () => {
  const page = parseTeamPage(fx('2026-team8.html'), 8)!;
  assert.ok(page.lineup.length > 0);
  assert.ok(page.lineup.every((p) => typeof p.snr === 'number' && p.snr > 0));
  assert.equal(parseTeamPage(fx('2025-team45.html'), 45)!.lineup.every((p) => p.snr === null), true);
});

test('card with a forfeit win against an empty board ("- 1K", "Brett nicht besetzt")', () => {
  const p = parsePlayerPage(fx('2025-player242.html'), 242)!;
  assert.equal(p.points, 8);
  assert.equal(p.games.length, 9);
  const g = p.games[1]!;
  assert.deepEqual([g.oppName, g.oppSnr, g.result, g.forfeit, g.color], ['', 0, 1, true, null]);
  assert.equal(p.games.filter((x) => x.result !== null).length, 9, 'every round has a result');
  assert.equal(p.games.reduce((a, x) => a + (x.result ?? 0), 0), 8, 'the results add up to the points');
});

test('forfeit results: "- 1K" wins, "- 0K" loses, "1" and "½" are played games', () => {
  const row = (res: string) => `<tr class="CRng1"><td class="CRc">1</td><td class="CRc">2</td><td class="CRc">7</td><td class="CR"></td><td class="CR">Roe, Max</td><td class="CRr">1800</td><td class="CRr">0</td><td class="CR">FRA</td><td class="CRc">0</td><td class="CRc">${res}</td></tr>`;
  const html = `<html><body><table Class="CRs1"><tr><td class="CR">Name</td><td class="CR">Doe, Jane</td></tr></table>
    <table class="CRs1"><tr class="CRng1b"><th class="CRc">Rd.</th><th class="CRc">Bo.</th><th class="CRc">SNo</th><th class="CR"></th><th class="CR">Name</th><th class="CRr">RtgI</th><th class="CRr">RtgN</th><th class="CR">FED</th><th class="CRc">Pts.</th><th class="CRc">Res.</th></tr>
    ${['- 1K', '- 0K', '1', '&frac12;'].map(row).join('')}</table></body></html>`;
  const games = parsePlayerPage(new JSDOM(html).window.document, 1)!.games;
  assert.deepEqual(games.map((x) => [x.result, x.forfeit]), [[1, true], [0, true], [1, false], [0.5, false]]);
});

test('a card of the running event (2026): the opponent rating is a plain "Rtg" column', () => {
  const html = `<html><body><h2>Player info</h2><table class="CRs1">
    <tr><td class="CR">Name</td><td class="CR">Margarido, Jose Miguel Teixeira</td></tr>
    <tr><td class="CR">Starting rank</td><td class="CR">182</td></tr>
    <tr><td class="CR">Rating</td><td class="CR">2071</td></tr>
    <tr><td class="CR">Rating national</td><td class="CR">0</td></tr>
    <tr><td class="CR">Rating international</td><td class="CR">2071</td></tr>
    <tr><td class="CR">Performance rating</td><td class="CR">2595</td></tr></table>
    <table class="CRs1"><tr><th class="CRc">Rd.</th><th class="CRc">Bo.</th><th class="CRc">SNo</th><th class="CR"></th><th class="CR">Name</th><th class="CRr">Rtg</th><th class="CR">FED</th><th class="CRc">Pts.</th><th class="CRc">Res.</th></tr>
    <tr><td class="CRc">1</td><td class="CRc">3</td><td class="CRc">161</td><td class="CR"></td><td class="CR">Vaissaire, Michel</td><td class="CRr">1598</td><td class="CR">FRA</td><td class="CRc">1</td><td class="CRc">1</td></tr>
    <tr><td class="CRc">2</td><td class="CRc">3</td><td class="CRc">194</td><td class="CR"></td><td class="CR">Balandynowicz, Wojciech</td><td class="CRr">1992</td><td class="CR">POL</td><td class="CRc">1</td><td class="CRc">1</td></tr></table></body></html>`;
  const p = parsePlayerPage(new JSDOM(html).window.document, 182)!;
  assert.deepEqual(p.games.map((g) => [g.round, g.oppName, g.oppRatingI, g.oppFed, g.result]), [
    [1, 'Vaissaire, Michel', 1598, 'FRA', 1],
    [2, 'Balandynowicz, Wojciech', 1992, 'POL', 1],
  ]);
  assert.equal(ratingOf({ ratingI: p.games[1]!.oppRatingI, ratingN: p.games[1]!.oppRatingN }), 1992);
});
