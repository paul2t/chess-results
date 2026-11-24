import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  formatScore, isPlayed, normName, outcome, parseHome, parsePairings, parseSchedule, parseScore,
  parseTeamPage, to24h,
} from '../src/parse';

const doc = (path: string): Document => new JSDOM(readFileSync(path, 'utf8')).window.document;
const demo = (f: string) => doc(`public/demo/${f}`);
const fx = (f: string) => doc(`test/fixtures/${f}`);

test('scores', () => {
  assert.equal(parseScore('3½'), 3.5);
  assert.equal(parseScore('½'), 0.5);
  assert.equal(parseScore('4'), 4);
  assert.equal(parseScore('3,5'), 3.5);
  assert.equal(parseScore(''), null);
  assert.equal(formatScore(3.5), '3½');
  assert.equal(formatScore(0.5), '½');
  assert.equal(formatScore(0), '0');
  assert.equal(formatScore(null), '–');
  assert.equal(outcome(2, 2), 'D');
  assert.equal(to24h('3:00 pm'), '15:00');
  assert.equal(to24h('10:00 am'), '10:00');
  assert.equal(to24h('15:00'), '15:00');
  assert.equal(normName('Dassault Systèmes #1'), normName('DASSAULT SYSTEMES #1'));
});

test('home: final ranking (2025)', () => {
  const h = parseHome(demo('home.html'));
  assert.equal(h.kind, 'ranking');
  assert.equal(h.tournamentName, 'European Corporate Chess Championship 2025');
  assert.equal(h.roundsPlayed, 9);
  assert.equal(h.lastUpdate, '10.11.2025 11:26:26');
  assert.equal(h.teams.length, 53);
  assert.equal(h.tbLabels[1], 'Matchpoints (variabel)');
  assert.equal(h.tbLabels[3], 'points (game-points)');
  const ds = h.teams.find((t) => t.snr === 45)!;
  assert.deepEqual(
    { n: ds.name, r: ds.rank, w: ds.wins, d: ds.draws, l: ds.losses, tb: ds.tb },
    { n: 'Dassault Systèmes #1', r: 36, w: 3, d: 2, l: 4, tb: ['17', '3', '15,5', '0'] },
  );
  // blank rank (tie) falls back to list position
  const bdf = h.teams.find((t) => t.name === 'Banque de France')!;
  assert.equal(bdf.rank, 22);
  assert.equal(h.teams.find((t) => t.snr === 11)!.rank, 24);
});

test('home: starting list before the event (2026)', () => {
  const h = parseHome(fx('2026-start.html'));
  assert.equal(h.kind, 'start');
  assert.equal(h.roundsPlayed, 0);
  assert.equal(h.teams.length, 4);
  assert.deepEqual(
    { snr: h.teams[2]!.snr, name: h.teams[2]!.name, rating: h.teams[2]!.rating },
    { snr: 50, name: 'Dassault Systemes 1 (France) Industry', rating: 1696 },
  );
});

test('home: starting list with FED and Group columns (2026, from 24 Nov)', () => {
  const h = parseHome(fx('2026-start-fed.html'));
  assert.equal(h.kind, 'start');
  assert.equal(h.lastUpdate, '24.11.2026 15:15:12');
  assert.equal(h.teams.length, 5);
  assert.deepEqual(
    h.teams.map((t) => [t.snr, t.name, t.fed, t.group, t.rating]),
    [
      [1, 'Le 16 Anjou 1', 'FRA', 'Consulting', 2322],
      [2, 'GRECO', 'UKR', 'Consulting', 2312],
      [3, 'Global Ramblers', 'CZE', 'Sport-Tourism', 2295],
      [50, 'GOOGLE C', 'EUF', 'Digital', 1717],
      [53, 'Dassault Systèmes 1', 'FRA', 'Industry', 1696],
    ],
  );
});

test('schedule', () => {
  const s = parseSchedule(demo('schedule.html'));
  assert.equal(s.length, 9);
  assert.deepEqual(s[0], { round: 1, date: '2025/11/07', time: '15:00' });
  assert.deepEqual(s[4], { round: 5, date: '2025/11/08', time: '10:00' });
  const s26 = parseSchedule(fx('2026-schedule.html'));
  assert.equal(s26[2]!.time, '16:00');
});

test('pairings with bye', () => {
  const p = parsePairings(demo('round-1.html'))!;
  assert.equal(p.round, 1);
  assert.equal(p.time, '15:00');
  assert.equal(p.matches.length, 27);
  assert.deepEqual(p.matches[1], {
    no: 2, home: 'Global Ramblers', away: 'SWISSto12', homeScore: 3.5, awayScore: 0.5, bye: false,
  });
  const bye = p.matches[26]!;
  assert.equal(bye.bye, true);
  assert.equal(bye.homeScore, 2);
  assert.equal(bye.awayScore, null);
  assert.ok(p.matches.every(isPlayed));
  assert.equal(parsePairings(fx('2026-start.html')), null);
});

test('team page: lineup and every match, either side (2025)', () => {
  const t = parseTeamPage(demo('team-45.html'), 45)!;
  assert.equal(t.name, 'Dassault Systèmes #1');
  assert.equal(t.captain, 'Paul de Temmerman');
  assert.equal(t.tb1, '17');
  assert.equal(t.roundColumns, 9);
  assert.equal(t.lineup.length, 4);
  const luca = t.lineup[3]!;
  assert.deepEqual(luca.results, ['0', '+', '1', '1', '1', '1', '1', '1', '1']);
  assert.equal(luca.points, '8');
  assert.equal(luca.rating, 1500); // RtgI = 0 -> national rating

  assert.equal(t.matches.length, 9);
  const [r1, r2, r3, , , , , r8] = t.matches;
  // we are on the left
  assert.deepEqual([r1!.oppName, r1!.usScore, r1!.oppScore], ['PwC Poland', 0, 4]);
  // we are on the right: scores and colours must be flipped to OUR perspective
  assert.deepEqual([r3!.oppName, r3!.oppSnr, r3!.usScore, r3!.oppScore], ['SWISSto12', 28, 3, 1]);
  const b = r3!.boards[0]!;
  assert.equal(b.us.name, 'Ridel, Fabien');
  assert.equal(b.opp.name, 'Moussard, Jules');
  assert.equal(b.color, 'b'); // opponent has white on board 1 -> we are black
  assert.deepEqual([b.usPts, b.oppPts], [0, 1]);
  assert.equal(r3!.boards[1]!.color, 'w');
  // no-space score "1½:2½" with us on the right
  assert.deepEqual([r8!.usScore, r8!.oppScore], [2.5, 1.5]);
  assert.equal(r8!.boards[1]!.usPts, 0.5);
  // forfeit / no player
  const f = r2!.boards[2]!;
  assert.equal(f.noPlayer, true);
  assert.equal(f.forfeit, true);
  assert.deepEqual([f.usPts, f.oppPts], [1, 0]);
  // title on the opponent
  assert.equal(r1!.boards[0]!.opp.title, 'IM');
  assert.ok(t.matches.every((m) => m.played && m.boards.length === 4));
  // our total over the 9 matches must equal the team's game points TB3 (15,5)
  const total = t.matches.reduce((s, m) => s + (m.usScore ?? 0), 0);
  assert.equal(total, 15.5);
});

test('team page: opponent ratings come from the per-player opponent list (2025)', () => {
  for (const page of [fx('2025-team45.html'), demo('team-45.html')]) { // the real page and the demo built from it
    const t = parseTeamPage(page, 45)!;
    const [r1, r2, r3] = t.matches;
    // RtgI first
    assert.equal(r1!.boards[0]!.opp.rating, 2267); // Barski, Radoslaw (IM)
    assert.equal(r1!.boards[1]!.opp.rating, 2112); // Galuszka, Tomasz
    // we are on the right-hand side: the opponent is the left player
    assert.equal(r3!.boards[0]!.opp.name, 'Moussard, Jules');
    assert.equal(r3!.boards[0]!.opp.rating, 2605);
    // RtgI is 0 -> national rating
    assert.equal(r3!.boards[2]!.opp.rating, 1500); // NUTHMANN, Thomas
    // nobody on the other side: no rating
    assert.equal(r2!.boards[2]!.opp.name, 'no player');
    assert.equal(r2!.boards[2]!.opp.rating, null);
    // every real opponent has a rating, and our own side is left alone
    const real = t.matches.flatMap((m) => m.boards).filter((b) => !b.noPlayer);
    assert.ok(real.length > 0 && real.every((b) => (b.opp.rating ?? 0) > 0), 'each opponent has a rating');
    assert.ok(t.matches.flatMap((m) => m.boards).every((b) => b.us.rating === undefined));
  }
});

test('team page without the opponent list leaves ratings unset', () => {
  const d = fx('2025-team45.html');
  const list = Array.from(d.querySelectorAll<HTMLTableElement>('table.CRs1, table.CRs2')).find((t) => /Rp:\d+/.test(t.rows[0]?.textContent ?? ''))!;
  list.remove();
  const boards = parseTeamPage(d, 45)!.matches.flatMap((m) => m.boards);
  assert.ok(boards.length > 30);
  assert.ok(boards.every((b) => b.opp.rating === undefined));
});

test('team page before the event (art=8, 2026)', () => {
  const t = parseTeamPage(fx('2026-team8.html'), 50)!;
  assert.equal(t.name, 'Dassault Systemes 1 (France) Industry');
  assert.equal(t.avgRating, 1696);
  assert.equal(t.matches.length, 0);
  assert.equal(t.roundColumns, 0);
  assert.equal(t.lineup.length, 4);
  assert.deepEqual([t.lineup[0]!.name, t.lineup[0]!.rating], ['Ridel, Fabien', 1771]);
  assert.equal(t.lineup[3]!.rating, null); // unrated
});

test('garbage input does not throw', () => {
  const d = new JSDOM('<html><body><p>Maintenance</p></body></html>').window.document;
  assert.equal(parseTeamPage(d, 1), null);
  assert.equal(parsePairings(d), null);
  assert.deepEqual(parseSchedule(d), []);
  assert.equal(parseHome(d).teams.length, 0);
});
