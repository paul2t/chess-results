// Parsers for chess-results.com pages (lan=1, English). Pure functions over a DOM Document,
// so they run unchanged in the browser (DOMParser) and in tests (jsdom).
import type {
  BoardGame, Details, HomePage, Opponent, Pairing, Player, PlayerGame, PlayerNumbers, PlayerPage, PlayerRow,
  RoundPairings, ScheduleRound, TeamMatch, TeamPage, TeamRow,
} from './types';

const norm = (s: string | null | undefined): string =>
  (s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const txt = (e: Element | null | undefined): string => (e ? norm(e.textContent) : '');

function tables(doc: Document): HTMLTableElement[] {
  return Array.from(doc.querySelectorAll<HTMLTableElement>('table.CRs1, table.CRs2'));
}

function rowsOf(t: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(t.rows);
}

const cells = (r: HTMLTableRowElement): HTMLTableCellElement[] => Array.from(r.cells);
const isHeaderRow = (r: HTMLTableRowElement): boolean => r.cells[0]?.tagName === 'TH';

/** "3½" -> 3.5, "½" -> 0.5, "4" -> 4, "3,5" -> 3.5, "" -> null */
export function parseScore(raw: string): number | null {
  const s = norm(raw).replace(',', '.');
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const m = /^(\d+)?\s*½$/.exec(s);
  if (m) return (m[1] ? parseInt(m[1], 10) : 0) + 0.5;
  return null;
}

/** Numbers shown by chess-results use a decimal comma ("15,5"). */
export function parseDecimal(raw: string): number {
  const n = parseFloat(norm(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

const int = (raw: string): number => {
  const n = parseInt(norm(raw), 10);
  return Number.isFinite(n) ? n : 0;
};

/** "2026/11/27", "3:00 pm" -> "15:00". Already-24h values are kept. */
export function to24h(time: string): string {
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(norm(time));
  if (!m) return norm(time);
  let h = parseInt(m[1]!, 10);
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** Normalises a team name for matching (accents, case, punctuation). */
export function normName(s: string): string {
  return norm(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, ' ')
    .trim();
}

// ───────────────────────────── home page ─────────────────────────────

export function parseHome(doc: Document): HomePage {
  const h2s = Array.from(doc.querySelectorAll('h2')).map(txt).filter(Boolean);
  const tournamentName = h2s[0] ?? '';
  const listTitle = h2s[1] ?? '';

  const bodyText = norm(doc.body?.textContent);
  const lastUpdate = /Last update\s+(\d{1,2}\.\d{1,2}\.\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?)/i.exec(bodyText)?.[1] ?? '';

  const tbLabels: Record<number, string> = {};
  const html = doc.body?.innerHTML ?? '';
  const tbRe = /Tie Break\s*(\d)\s*:\s*(.*?)(?=<br|Tie Break\s*\d|<\/|$)/gi;
  for (let m = tbRe.exec(html); m; m = tbRe.exec(html)) {
    tbLabels[parseInt(m[1]!, 10)] = norm(m[2]!.replace(/<[^>]+>/g, ''));
  }

  let teams: TeamRow[] = [];
  let kind: HomePage['kind'] = 'start';
  for (const t of tables(doc)) {
    const rows = rowsOf(t);
    const headerIdx = rows.findIndex(isHeaderRow);
    if (headerIdx < 0) continue;
    const headers = cells(rows[headerIdx]!).map(txt);
    if (!headers.includes('Team')) continue;
    if (headers.includes('Rk.') && headers.includes('SNo')) {
      kind = 'ranking';
      teams = parseRankingRows(rows.slice(headerIdx + 1), headers);
      break;
    }
    if (headers.includes('No.') && headers.includes('RtgAvg')) {
      kind = 'start';
      teams = parseStartRows(rows.slice(headerIdx + 1), headers);
      break;
    }
  }

  // A ranking table exists as soon as round 1 has been paired; "played" is what counts.
  const after = /after\s+(?:round\s+)?(\d+)/i.exec(listTitle);
  let roundsPlayed = after ? parseInt(after[1]!, 10) : 0;
  if (!after && kind === 'ranking') roundsPlayed = Math.max(0, ...teams.map((t) => t.played));

  return { tournamentName, listTitle, lastUpdate, kind, roundsPlayed, tbLabels, teams };
}

function parseRankingRows(rows: HTMLTableRowElement[], headers: string[]): TeamRow[] {
  const ix = (n: string) => headers.indexOf(n);
  const col = (re: RegExp) => headers.findIndex((h) => re.test(h));
  const iRk = ix('Rk.'), iSno = ix('SNo'), iFed = ix('FED'), iTeam = ix('Team'), iGrp = ix('Group');
  const iGames = ix('Games'), iW = col(/^\+$/), iD = col(/^=$/), iL = col(/^-$/);
  const iTb = [1, 2, 3, 4].map((n) => ix(`TB${n}`));
  const out: TeamRow[] = [];
  rows.forEach((r) => {
    const c = cells(r).map(txt);
    if (c.length < 6 || !/^\d+$/.test(c[iSno] ?? '')) return;
    out.push({
      snr: int(c[iSno]!),
      name: c[iTeam] ?? '',
      fed: c[iFed] ?? '',
      group: iGrp >= 0 ? c[iGrp] ?? '' : '',
      // blank rank = tied with the previous row; fall back to its position in the list
      rank: /^\d+$/.test(c[iRk] ?? '') ? int(c[iRk]!) : out.length + 1,
      played: int(c[iGames] ?? ''),
      wins: int(c[iW] ?? ''),
      draws: int(c[iD] ?? ''),
      losses: int(c[iL] ?? ''),
      tb: iTb.map((i) => (i >= 0 ? c[i] ?? '' : '')),
      rating: null,
    });
  });
  return out;
}

function parseStartRows(rows: HTMLTableRowElement[], headers: string[]): TeamRow[] {
  const iNo = headers.indexOf('No.'), iTeam = headers.indexOf('Team'), iRtg = headers.indexOf('RtgAvg');
  const out: TeamRow[] = [];
  rows.forEach((r) => {
    const c = cells(r).map(txt);
    if (!/^\d+$/.test(c[iNo] ?? '')) return;
    out.push({
      snr: int(c[iNo]!),
      name: c[iTeam] ?? '',
      fed: '',
      group: '',
      rank: null,
      played: 0, wins: 0, draws: 0, losses: 0,
      tb: [],
      rating: /^\d+$/.test(c[iRtg] ?? '') ? int(c[iRtg]!) : null,
    });
  });
  return out;
}

// ───────────────────────────── schedule / details ─────────────────────────────

export function parseSchedule(doc: Document): ScheduleRound[] {
  for (const t of tables(doc)) {
    const rows = rowsOf(t);
    const head = rows[0] ? cells(rows[0]).map(txt) : [];
    if (head[0] !== 'Round' || !head.includes('Date')) continue;
    return rows.slice(1).flatMap((r) => {
      const c = cells(r).map(txt);
      if (!/^\d+$/.test(c[0] ?? '')) return [];
      return [{ round: int(c[0]!), date: c[1] ?? '', time: to24h(c[2] ?? '') }];
    });
  }
  return [];
}

/** Key/value table shown with "turdet=YES". Returns null when the page has none (old tournaments). */
export function parseDetails(doc: Document): Details | null {
  const kv = new Map<string, string>();
  doc.querySelectorAll('td.CR').forEach((td) => {
    const next = td.nextElementSibling;
    if (next && next.tagName === 'TD' && next.classList.contains('CR')) kv.set(txt(td), txt(next));
  });
  const rounds = kv.get('Number of rounds');
  if (!rounds && !kv.get('Date')) return null;
  const tcKey = Array.from(kv.keys()).find((k) => k.startsWith('Time control'));
  return {
    rounds: rounds && /^\d+$/.test(rounds) ? parseInt(rounds, 10) : null,
    dates: kv.get('Date') ?? '',
    location: kv.get('Location') ?? '',
    timeControl: tcKey ? kv.get(tcKey) ?? '' : '',
  };
}

// ───────────────────────────── round pairings (art=2) ─────────────────────────────

const ROUND_HEAD = /Round\s+(\d+)\s+on\s+(\S+)\s+at\s+(.+)$/i;

/** Returns null when the round has not been paired yet (no pairing table on the page). */
export function parsePairings(doc: Document): RoundPairings | null {
  for (const t of tables(doc)) {
    const rows = rowsOf(t);
    const m = rows[0] ? ROUND_HEAD.exec(txt(rows[0])) : null;
    if (!m) continue;
    const matches: Pairing[] = [];
    for (const r of rows.slice(1)) {
      if (isHeaderRow(r)) continue;
      const c = cells(r).map(txt);
      if (c.length < 5 || !/^\d+$/.test(c[0] ?? '')) continue;
      const away = c[2] ?? '';
      const bye = /^bye$/i.test(away);
      matches.push({
        no: int(c[0]!),
        home: c[1] ?? '',
        away,
        homeScore: parseScore(c[3] ?? ''),
        awayScore: bye ? null : parseScore(c[5] ?? ''),
        bye,
      });
    }
    return { round: parseInt(m[1]!, 10), date: m[2]!, time: to24h(m[3]!), matches };
  }
  return null;
}

export const isPlayed = (p: Pairing): boolean => p.homeScore !== null && (p.bye || p.awayScore !== null);

// ───────────────────────────── team page (art=20 / art=8) ─────────────────────────────

const TEAM_HEAD =
  /^(\d+)\.\s*(.*?)\s*\(RtgAvg:\s*(\d+)(?:,\s*Captain:\s*(.*?))?\s*\/\s*TB1:\s*([^/]*?)\s*\/\s*TB2:\s*([^)]*?)\)\s*$/;

const RESULT_TOKEN = '(\\+|-|0|1|½)';
const GAME_RESULT = new RegExp(`^${RESULT_TOKEN}\\s+-\\s+${RESULT_TOKEN}$`);

function tokenPts(tok: string): number {
  return tok === '+' || tok === '1' ? 1 : tok === '½' ? 0.5 : 0;
}

/** Parses the team-composition table and, when present, the per-round board pairings. */
export function parseTeamPage(doc: Document, snr: number): TeamPage | null {
  const page: TeamPage = {
    snr, name: '', captain: '', avgRating: null, tb1: '', tb2: '', lineup: [], matches: [], roundColumns: 0,
  };
  let found = false;
  const opponents: OpponentRow[] = [];

  for (const t of tables(doc)) {
    const rows = rowsOf(t);
    const first = rows[0] ? txt(rows[0]) : '';

    const head = TEAM_HEAD.exec(first);
    if (head) {
      found = true;
      page.name = head[2]!;
      page.avgRating = int(head[3]!) || null;
      page.captain = head[4] ?? '';
      page.tb1 = head[5] ?? '';
      page.tb2 = head[6] ?? '';
      parseComposition(rows, page);
      continue;
    }

    if (ROUND_HEAD.test(first)) {
      found = true;
      page.matches = parseTeamMatches(rows, snr);
      continue;
    }

    if (rows.some((r) => isHeaderRow(r) && txt(r.cells[0]) === 'Rd.')) opponents.push(...parseOpponentRows(rows));
  }
  applyOpponentRatings(page.matches, opponents);
  return found ? page : null;
}

interface OpponentRow { round: number; board: number; name: string; rating: number | null }

/**
 * The team page lists, for each player of the team, the opponent met in every round with RtgI/RtgN
 * (the board pairings themselves carry no rating). Blocks are: a title row, a header row, round rows.
 */
function parseOpponentRows(rows: HTMLTableRowElement[]): OpponentRow[] {
  const out: OpponentRow[] = [];
  let col: Record<string, number> | null = null;
  for (const r of rows) {
    if (isHeaderRow(r) && txt(r.cells[0]) === 'Rd.') {
      const heads = cells(r).map(txt);
      col = { rd: heads.indexOf('Rd.'), name: heads.indexOf('Name'), intl: heads.indexOf('RtgI'), natl: heads.indexOf('RtgN'), bo: heads.indexOf('Bo.') };
      continue;
    }
    const c = cells(r).map(txt);
    if (!col || c.length < 2 || !/^\d+$/.test(c[col.rd!] ?? '')) continue;
    const rating = (col.intl! >= 0 ? int(c[col.intl!] ?? '') : 0) || (col.natl! >= 0 ? int(c[col.natl!] ?? '') : 0) || null;
    out.push({ round: int(c[col.rd!]!), board: col.bo! >= 0 ? int(c[col.bo!] ?? '') : 0, name: c[col.name!] ?? '', rating });
  }
  return out;
}

/** "Barski, Radoslaw" (pairings) and "Barski Radoslaw" (opponent list) must compare equal. */
const sameKey = (s: string): string => normName(s.replace(/,/g, ' '));

/** Fills `opp.rating` of every board: by round and name, else by round and board number. */
function applyOpponentRatings(matches: TeamMatch[], rows: OpponentRow[]): void {
  if (!rows.length) return;
  for (const m of matches) {
    for (const g of m.boards) {
      const key = sameKey(g.opp.name);
      const hit = rows.find((x) => x.round === m.round && sameKey(x.name) === key)
        ?? rows.find((x) => x.round === m.round && x.board === g.board);
      g.opp.rating = hit?.rating ?? null;
    }
  }
}

function parseComposition(rows: HTMLTableRowElement[], page: TeamPage): void {
  const hi = rows.findIndex((r, i) => i > 0 && isHeaderRow(r));
  if (hi < 0) return;
  const headers = cells(rows[hi]!).map(txt);
  const iName = headers.indexOf('Name');
  const iBo = headers.indexOf('Bo.');
  const iRtgI = headers.indexOf('RtgI');
  const iRtgN = headers.indexOf('RtgN');
  const iRtg = headers.indexOf('Rtg');
  const iFed = headers.indexOf('FED');
  const iFide = headers.indexOf('FideID');
  const iPts = headers.indexOf('Pts.');
  const iGames = headers.indexOf('Games');
  const roundCols = headers.flatMap((h, i) => (/^\d+$/.test(h) ? [i] : []));
  page.roundColumns = roundCols.length;

  for (const r of rows.slice(hi + 1)) {
    const c = cells(r).map(txt);
    if (!/^\d+$/.test(c[iBo] ?? '') || iName < 0) continue;
    // Before the event only "Rtg" exists; later RtgI (international) wins over RtgN (national).
    const intl = iRtgI >= 0 ? int(c[iRtgI] ?? '') : 0;
    const natl = iRtgN >= 0 ? int(c[iRtgN] ?? '') : 0;
    const single = iRtg >= 0 ? int(c[iRtg] ?? '') : 0;
    const rating = intl || natl || single || null;
    const player: Player = {
      board: int(c[iBo]!),
      title: iName > 0 ? c[iName - 1] ?? '' : '',
      name: c[iName] ?? '',
      rating,
      fed: c[iFed] ?? '',
      fideId: c[iFide] ?? '',
      results: roundCols.map((i) => c[i] ?? ''),
      points: iPts >= 0 ? c[iPts] ?? '' : '',
      games: iGames >= 0 ? int(c[iGames] ?? '') : null,
    };
    page.lineup.push(player);
  }
}

function parseTeamMatches(rows: HTMLTableRowElement[], snr: number): TeamMatch[] {
  const out: TeamMatch[] = [];
  let cur: TeamMatch | null = null;
  let usIsLeft = true;

  for (const r of rows) {
    const c = cells(r);
    if (c.length === 1) {
      const m = ROUND_HEAD.exec(txt(c[0]));
      if (m) {
        cur = {
          round: parseInt(m[1]!, 10), date: m[2]!, time: to24h(m[3]!),
          usSnr: snr, usName: '', oppSnr: 0, oppName: '',
          usScore: null, oppScore: null, played: false, boards: [],
        };
        out.push(cur);
      }
      continue;
    }
    if (!cur) continue;

    if (isHeaderRow(r) && c.length >= 11) {
      // Bo. | snrL | nameL | FED | | - | snrR | nameR | FED | | score
      const leftSnr = int(txt(c[1]));
      const leftName = txt(c[2]);
      const rightSnr = int(txt(c[6]));
      const rightName = txt(c[7]);
      usIsLeft = leftSnr === snr;
      const [ls, rs] = txt(c[10]).split(':').map((s) => parseScore(s));
      cur.usSnr = snr;
      cur.usName = usIsLeft ? leftName : rightName;
      cur.oppSnr = usIsLeft ? rightSnr : leftSnr;
      cur.oppName = usIsLeft ? rightName : leftName;
      cur.usScore = (usIsLeft ? ls : rs) ?? null;
      cur.oppScore = (usIsLeft ? rs : ls) ?? null;
      cur.played = cur.usScore !== null && cur.oppScore !== null;
      continue;
    }

    if (c.length >= 11 && /^\d+\.\d+$/.test(txt(c[0]))) {
      const board = parseInt(txt(c[0]).split('.')[1]!, 10);
      const left: Opponent = { name: txt(c[2]), fed: txt(c[3]), title: txt(c[4]) };
      const right: Opponent = { name: txt(c[7]), fed: txt(c[8]), title: txt(c[6]) };
      const leftWhite = c[2]!.querySelector('.FarbewT') ? true : c[2]!.querySelector('.FarbesT') ? false : null;
      const m = GAME_RESULT.exec(txt(c[10]));
      const forfeit = !!m && /[+-]/.test(m[1]! + m[2]!);
      const lp = m ? tokenPts(m[1]!) : null;
      const rp = m ? tokenPts(m[2]!) : null;
      const game: BoardGame = {
        board,
        color: leftWhite === null ? null : (leftWhite === usIsLeft ? 'w' : 'b'),
        us: usIsLeft ? left : right,
        opp: usIsLeft ? right : left,
        usPts: usIsLeft ? lp : rp,
        oppPts: usIsLeft ? rp : lp,
        forfeit,
        noPlayer: /^no player$/i.test(left.name) || /^no player$/i.test(right.name),
      };
      cur.boards.push(game);
    }
  }
  return out;
}

// ───────────────────────────── players (art=16, art=9, art=24) ─────────────────────────────

const headersOf = (r: HTMLTableRowElement): string[] => cells(r).map((c) => txt(c));

/** International rating, else the national one (what chess-results sorts the starting list by). */
export const ratingOf = (r: { ratingI: number; ratingN: number }): number => r.ratingI || r.ratingN;

/** The players' starting list (art=16): one row per player, highest rating first. */
export function parsePlayers(doc: Document): PlayerRow[] {
  const out: PlayerRow[] = [];
  for (const t of tables(doc)) {
    const rows = rowsOf(t);
    const head = rows.find(isHeaderRow);
    if (!head) continue;
    const h = headersOf(head);
    const iName = h.indexOf('Name'), iTeam = h.indexOf('Team');
    if (iName < 0 || iTeam < 0) continue;
    const iNo = h.indexOf('No.'), iFide = h.indexOf('FideID'), iI = h.indexOf('RtgI'), iN = h.indexOf('RtgN');
    const iFed = h.indexOf('FED'), iBo = h.indexOf('Bo.');
    for (const r of rows) {
      if (isHeaderRow(r)) continue;
      const c = cells(r).map(txt);
      if (c.length <= iTeam || !c[iName]) continue;
      out.push({
        no: iNo >= 0 ? int(c[iNo]!) : out.length + 1,
        title: h[iName - 1] === '' ? c[iName - 1] ?? '' : '', // the untitled column right before the name
        name: c[iName]!,
        fideId: iFide >= 0 ? c[iFide] ?? '' : '',
        ratingI: iI >= 0 ? int(c[iI]!) : 0,
        ratingN: iN >= 0 ? int(c[iN]!) : 0,
        fed: iFed >= 0 ? c[iFed] ?? '' : '',
        team: c[iTeam] ?? '',
        board: iBo >= 0 && c[iBo] ? int(c[iBo]!) : null,
      });
    }
    if (out.length) break;
  }
  return out;
}

/** A game result as printed on a card: "1", "½", "0", or "+"/"-" for a forfeit. */
function cardResult(raw: string): { result: number | null; forfeit: boolean } {
  const s = norm(raw);
  if (s === '1') return { result: 1, forfeit: false };
  if (s === '½') return { result: 0.5, forfeit: false };
  if (s === '0') return { result: 0, forfeit: false };
  if (s === '+') return { result: 1, forfeit: true };
  if (s === '-') return { result: 0, forfeit: true };
  return { result: null, forfeit: false };
}

/** A player's card (art=9): the info table (label / value) and the games table, one row per round. */
export function parsePlayerPage(doc: Document, snr: number): PlayerPage | null {
  const info = new Map<string, string>();
  const games: PlayerGame[] = [];
  for (const t of tables(doc)) {
    const rows = rowsOf(t);
    const head = rows.find(isHeaderRow);
    if (!head) {
      for (const r of rows) if (r.cells.length === 2) info.set(txt(r.cells[0]).toLowerCase(), txt(r.cells[1]));
      continue;
    }
    const h = headersOf(head);
    const iRd = h.indexOf('Rd.'), iName = h.indexOf('Name');
    if (iRd < 0 || iName < 0) continue;
    const iBo = h.indexOf('Bo.'), iSno = h.indexOf('SNo'), iI = h.indexOf('RtgI'), iN = h.indexOf('RtgN');
    const iFed = h.indexOf('FED'), iPts = h.indexOf('Pts.'), iRes = h.indexOf('Res.');
    for (const r of rows) {
      if (isHeaderRow(r)) continue;
      const cs = cells(r);
      const c = cs.map(txt);
      const round = int(c[iRd] ?? '');
      if (!round) continue;
      const res = iRes >= 0 ? cs[iRes] : undefined;
      const { result, forfeit } = cardResult(res ? txt(res.querySelector('td.CR') ?? res) : '');
      games.push({
        round,
        board: iBo >= 0 && c[iBo] ? int(c[iBo]!) : null,
        oppSnr: iSno >= 0 ? int(c[iSno] ?? '') : 0,
        oppTitle: h[iName - 1] === '' ? c[iName - 1] ?? '' : '',
        oppName: c[iName] ?? '',
        oppRatingI: iI >= 0 ? int(c[iI] ?? '') : 0,
        oppRatingN: iN >= 0 ? int(c[iN] ?? '') : 0,
        oppFed: iFed >= 0 ? c[iFed] ?? '' : '',
        oppPts: iPts >= 0 ? parseScore(c[iPts] ?? '') : null,
        color: res?.querySelector('.FarbewT') ? 'w' : res?.querySelector('.FarbesT') ? 'b' : null,
        result,
        forfeit,
      });
    }
  }
  const name = info.get('name');
  if (!name) return null;
  const num = (k: string): number | null => { const v = info.get(k); return v ? int(v) : null; };
  const pts = info.get('points');
  return {
    snr, name,
    title: info.get('title') ?? '',
    fed: info.get('federation') ?? '',
    ratingI: num('rating international') ?? 0,
    ratingN: num('rating national') ?? 0,
    perf: num('performance rating') || null,
    ratingChange: info.get('fide rtg +/-') ?? '',
    points: pts ? parseScore(pts) : null,
    rank: num('rank'),
    fideId: info.get('fide-id') && info.get('fide-id') !== '0' ? info.get('fide-id')! : '',
    birth: info.get('year of birth') ?? '',
    games,
  };
}

/** Normalised name used to match the starting list with the card numbers ("Kovalenko, Igor" = "Kovalenko Igor"). */
export const playerKey = (name: string): string => normName(name);

/**
 * Card numbers of the players (art=24, every player's games on one page). The starting list does not say
 * them, but every opponent in those games comes with its number (SNo), name and rating.
 */
export function parsePlayerNumbers(doc: Document): PlayerNumbers {
  const out: PlayerNumbers = {};
  for (const t of tables(doc)) {
    const rows = rowsOf(t);
    let cols: { snr: number; name: number; i: number; n: number } | null = null;
    for (const r of rows) {
      if (isHeaderRow(r)) {
        const h = headersOf(r);
        cols = h.includes('SNo') && h.includes('Name')
          ? { snr: h.indexOf('SNo'), name: h.indexOf('Name'), i: h.indexOf('RtgI'), n: h.indexOf('RtgN') }
          : null;
        continue;
      }
      if (!cols) continue;
      const c = cells(r).map(txt);
      const snr = int(c[cols.snr] ?? '');
      const name = c[cols.name] ?? '';
      if (!snr || !name) continue;
      const key = playerKey(name);
      const rating = ratingOf({ ratingI: cols.i >= 0 ? int(c[cols.i] ?? '') : 0, ratingN: cols.n >= 0 ? int(c[cols.n] ?? '') : 0 });
      const list = (out[key] ??= []);
      if (!list.some((x) => x.snr === snr)) list.push({ snr, rating });
    }
  }
  return out;
}

// ───────────────────────────── helpers used by the UI ─────────────────────────────

export type Outcome = 'W' | 'D' | 'L';
export function outcome(us: number | null, opp: number | null): Outcome | null {
  if (us === null || opp === null) return null;
  return us > opp ? 'W' : us < opp ? 'L' : 'D';
}

export function formatScore(n: number | null): string {
  if (n === null) return '–';
  const whole = Math.floor(n);
  const half = n - whole >= 0.5;
  if (!half) return String(whole);
  return whole === 0 ? '½' : `${whole}½`;
}
