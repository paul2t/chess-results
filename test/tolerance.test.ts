// chess-results changes its pages while a tournament runs (columns appear, headers are reworded). These tests
// take the real pages and change them the way the site has changed, or might: the result must stay the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { parseDetails, parseHome, parsePairings, parsePlayers, parseSchedule, parseTeamPage } from '../src/parse';

const html = (path: string): string => readFileSync(path, 'utf8');
const dom = (s: string): Document => new JSDOM(s).window.document;
const fx = (f: string): string => html(`test/fixtures/${f}`);
const demo = (f: string): string => html(`public/demo/${f}`);

/** Applies `edit` to every row of every table of a page, and returns the page as a document. */
function mutate(src: string, edit: (row: HTMLTableRowElement, doc: Document) => void): Document {
  const d = dom(src);
  d.querySelectorAll('tr').forEach((r) => edit(r as HTMLTableRowElement, d));
  return d;
}

const cell = (d: Document, tag: 'td' | 'th', text = ''): HTMLElement => {
  const c = d.createElement(tag);
  c.textContent = text;
  return c;
};

// ── team page header ──

const withHead = (head: string): Document =>
  dom(fx('2026-team8.html').replace('50. Dassault Systemes 1 (France) Industry (RtgAvg:1696 / TB1: 0 / TB2: 0)', head));

test('team header: every wording seen so far, and likely ones', () => {
  const cases: Array<[string, string, number | null, string, string]> = [
    // header, name, avg, captain, tb1
    ['52. Dassault Systèmes 1 (RtgAvg:1696 / TB1: 0 / TB2: 0) Captain: Paul de Temmerman', 'Dassault Systèmes 1', 1696, 'Paul de Temmerman', '0'],
    ['36. Dassault Systèmes #1 (RtgAvg:1642, Captain: Paul de Temmerman / TB1: 17 / TB2: 3)', 'Dassault Systèmes #1', 1642, 'Paul de Temmerman', '17'],
    ['50. Dassault Systemes 1 (France) Industry (RtgAvg:1696 / TB1: 0 / TB2: 0)', 'Dassault Systemes 1 (France) Industry', 1696, '', '0'],
    ['52. Dassault Systèmes 1 (RtgAvg:1696)', 'Dassault Systèmes 1', 1696, '', ''],
    ['52. Dassault Systèmes 1 (RtgAvg: 1696 / TB1: 0 / TB2: 0 / TB3: 0) Captain: Paul de Temmerman', 'Dassault Systèmes 1', 1696, 'Paul de Temmerman', '0'],
    ['52. Dassault Systèmes 1 Captain: Paul de Temmerman (RtgAvg:1696 / TB1: 0)', 'Dassault Systèmes 1 Captain: Paul de Temmerman', 1696, '', '0'],
    ['52. Dassault Systèmes 1', 'Dassault Systèmes 1', null, '', ''], // no field at all: the line-up table says it is a team
  ];
  for (const [head, name, avg, captain, tb1] of cases) {
    const t = parseTeamPage(withHead(head), 52);
    assert.ok(t, `not recognised: ${head}`);
    assert.equal(t.lineup.length, 4, head);
    assert.equal(t.avgRating, avg, head);
    if (!head.includes('Captain: Paul de Temmerman (RtgAvg')) {
      assert.equal(t.name, name, head);
      assert.equal(t.captain, captain, head);
      assert.equal(t.tb1, tb1, head);
    }
  }
});

test('team line-up: columns moved, added or renamed', () => {
  const base = parseTeamPage(dom(fx('2026-team8.html')), 50)!;
  // an extra column at the front and another in the middle
  const wide = mutate(fx('2026-team8.html'), (r, d) => {
    if (r.cells.length < 2) return; // the title row stays as it is
    const th = r.cells[0]?.tagName === 'TH';
    r.insertBefore(cell(d, th ? 'th' : 'td', th ? 'Seed' : '9'), r.cells[0] ?? null);
    r.insertBefore(cell(d, th ? 'th' : 'td', th ? 'Title' : 'x'), r.cells[3] ?? null);
  });
  const t = parseTeamPage(wide, 50);
  assert.ok(t);
  assert.deepEqual(t.lineup.map((p) => [p.board, p.name, p.rating]), base.lineup.map((p) => [p.board, p.name, p.rating]));
  // "Board" instead of "Bo.", "Player" instead of "Name"
  const renamed = mutate(fx('2026-team8.html'), (r) => {
    r.querySelectorAll('th').forEach((c) => {
      if (c.textContent === 'Bo.') c.textContent = 'Board';
      if (c.textContent === 'Name') c.textContent = 'Player';
    });
  });
  assert.deepEqual(parseTeamPage(renamed, 50)!.lineup.map((p) => p.name), base.lineup.map((p) => p.name));
});

// ── match tables: columns added next to the result ──

test('team matches: an extra column before the score changes nothing', () => {
  const base = parseTeamPage(dom(demo('team-45.html')), 45)!;
  const changed = mutate(demo('team-45.html'), (r, d) => {
    // match tables only: the rows with 11 cells (header and boards), in front of the score cell
    if (r.cells.length === 11) {
      const th = r.cells[0]!.tagName === 'TH';
      r.insertBefore(cell(d, th ? 'th' : 'td', th ? 'Elo' : '1800'), r.cells[10]!);
    }
  });
  const t = parseTeamPage(changed, 45)!;
  assert.ok(base.matches.length >= 9);
  assert.deepEqual(t.matches, base.matches);
});

// ── tables, home, schedule, pairings ──

test('tables whose class is no longer CRs1 / CRs2', () => {
  const src = fx('2026-start-fed.html').replace(/class="CRs1"/g, 'class="CRtable"');
  assert.notEqual(src, fx('2026-start-fed.html'));
  const h = parseHome(dom(src));
  assert.equal(h.teams.length, 5);
  assert.equal(h.teams[4]!.name, 'Dassault Systèmes 1');
  const renumbered = fx('2026-start-fed.html').replace(/class="CRs1"/g, 'class="CRs3"');
  assert.equal(parseHome(dom(renumbered)).teams.length, 5);
});

test('home: starting list with renamed headers', () => {
  const src = fx('2026-start-fed.html').replace('>No.<', '>Nr.<').replace('>RtgAvg<', '>Rtg<').replace('>Team<', '>Name<');
  const h = parseHome(dom(src));
  assert.equal(h.kind, 'start');
  assert.deepEqual(h.teams.map((t) => [t.snr, t.name, t.rating]).slice(-1), [[53, 'Dassault Systèmes 1', 1696]]);
});

test('home: ranking without the group and the tie-break columns', () => {
  const base = parseHome(dom(demo('home.html')));
  const cut = mutate(demo('home.html'), (r) => {
    // drop the last four columns (TB1..TB4)
    for (let i = 0; i < 4; i++) r.cells[r.cells.length - 1]?.remove();
  });
  const h = parseHome(cut);
  assert.equal(h.kind, 'ranking');
  assert.equal(h.teams.length, base.teams.length);
  assert.deepEqual(h.teams.map((t) => t.name), base.teams.map((t) => t.name));
  assert.equal(h.teams[0]!.wins, base.teams[0]!.wins);
});

test('pairings: a column added in front, the title without date or time', () => {
  const base = parsePairings(dom(demo('round-1.html')))!;
  const wide = mutate(demo('round-1.html'), (r, d) => {
    if (r.cells.length === 6) {
      const th = r.cells[0]!.tagName === 'TH';
      r.insertBefore(cell(d, th ? 'th' : 'td', th ? 'Bo.' : '0'), r.cells[0]!);
    }
  });
  const p = parsePairings(wide)!;
  assert.ok(p);
  assert.equal(p.matches.length, base.matches.length);
  // the first "No." of the original is now in the second column; the new first one is no number we can trust,
  // but nothing may be lost or shifted: scores and bye stay right
  assert.deepEqual(p.matches.map((m) => [m.home, m.away, m.homeScore, m.awayScore, m.bye]), base.matches.map((m) => [m.home, m.away, m.homeScore, m.awayScore, m.bye]));

  const bare = demo('round-1.html').replace(/Round 1 on [^<]*/, 'Round 1');
  const q = parsePairings(dom(bare))!;
  assert.equal(q.round, 1);
  assert.equal(q.matches.length, base.matches.length);
});

test('schedule: columns in another order', () => {
  const base = parseSchedule(dom(demo('schedule.html')));
  const swapped = mutate(demo('schedule.html'), (r) => {
    const [a, b, c] = [r.cells[0], r.cells[1], r.cells[2]];
    if (a && b && c) { r.append(b, c, a); } // Date | Time | Round
  });
  assert.deepEqual(parseSchedule(swapped), base);
});

test('details: reworded labels', () => {
  const d = dom('<table><tr><td class="CR">Rounds</td><td class="CR">9</td></tr><tr><td class="CR">Dates</td><td class="CR">2026/11/27 - 2026/11/29</td></tr><tr><td class="CR">Venue</td><td class="CR">Espace Concorde</td></tr></table>');
  const x = parseDetails(d);
  assert.deepEqual([x?.rounds, x?.dates, x?.location], [9, '2026/11/27 - 2026/11/29', 'Espace Concorde']);
});

test('players list: Player instead of Name, no Bo. column', () => {
  const base = parsePlayers(dom(fx('2026-players-list.html')));
  assert.ok(base.length > 0);
  const src = fx('2026-players-list.html').replace('>Name<', '>Player<');
  assert.deepEqual(parsePlayers(dom(src)).map((p) => p.name), base.map((p) => p.name));
});

test('a page that is something else gives nothing instead of throwing', () => {
  const d = dom('<html><body><table class="CRs1"><tr><td>Maintenance 42.</td></tr><tr><th>Bo.</th></tr></table></body></html>');
  assert.equal(parseTeamPage(d, 1), null);
  assert.equal(parsePairings(d), null);
  assert.equal(parseHome(d).teams.length, 0);
  assert.deepEqual(parseSchedule(d), []);
  assert.deepEqual(parsePlayers(d), []);
});
