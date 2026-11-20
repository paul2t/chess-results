// Turns chess-results pages into a Snapshot. Pages that cannot change any more (finished
// rounds) are reused from the previous snapshot to keep the number of requests low.
import type { Fetcher } from './api';
import {
  isPlayed, normName, parseDetails, parseHome, parsePairings, parseSchedule, parseTeamPage,
} from './parse';
import type { Details, RoundPairings, Snapshot, TeamPage } from './types';

const toDoc = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');

const roundDone = (r: RoundPairings): boolean => r.matches.length > 0 && r.matches.every(isPlayed);

/** Finds a team by number or by (partial, accent-insensitive) name. */
export function resolveTeam(teams: { snr: number; name: string }[], query: string | number | null): number | null {
  if (query === null || query === '') return null;
  const asNum = typeof query === 'number' ? query : /^\d+$/.test(query) ? parseInt(query, 10) : NaN;
  if (Number.isFinite(asNum)) return teams.some((t) => t.snr === asNum) ? asNum : null;
  const q = normName(String(query));
  const exact = teams.find((t) => normName(t.name) === q);
  if (exact) return exact.snr;
  // "dassault systemes 1" must match "Dassault Systemes 1 (France) Industry" but not "... 10"
  const starts = teams.filter((t) => {
    const n = normName(t.name);
    return n === q || n.startsWith(q + ' ');
  });
  if (starts.length === 1) return starts[0]!.snr;
  return null;
}

export async function loadTeamPage(f: Fetcher, tnr: number, snr: number): Promise<TeamPage | null> {
  // art=20 has the results; before the first round it carries no lineup, art=8 does.
  const results = parseTeamPage(toDoc(await f.get(tnr, { art: 20, snr })), snr);
  if (results && results.lineup.length > 0) return results;
  const lineup = parseTeamPage(toDoc(await f.get(tnr, { art: 8, snr })), snr);
  if (!lineup) return results;
  return { ...lineup, matches: results?.matches ?? lineup.matches };
}

export async function loadSnapshot(
  f: Fetcher,
  tnr: number,
  teamRef: string | number | null,
  prev: Snapshot | null,
): Promise<Snapshot> {
  const [homeHtml, scheduleHtml, detailsHtml] = await Promise.all([
    f.get(tnr, {}),
    f.get(tnr, { art: 14 }).catch(() => ''),
    prev?.details ? Promise.resolve('') : f.get(tnr, { turdet: 'YES' }).catch(() => ''),
  ]);
  const home = parseHome(toDoc(homeHtml));
  if (home.teams.length === 0) throw new Error('No team list found on the tournament page');
  const schedule = scheduleHtml ? parseSchedule(toDoc(scheduleHtml)) : prev?.schedule ?? [];
  const details: Details | null = prev?.details ?? (detailsHtml ? parseDetails(toDoc(detailsHtml)) : null);

  const totalRounds = details?.rounds ?? (schedule.length || home.roundsPlayed);
  const upTo = Math.min(totalRounds, home.roundsPlayed + 1); // the next round may already be paired

  const prevRounds = new Map((prev?.rounds ?? []).map((r) => [r.round, r]));
  const wanted = Array.from({ length: upTo }, (_, i) => i + 1);
  const fetched = await Promise.all(
    wanted.map(async (n): Promise<RoundPairings | null> => {
      const cached = prevRounds.get(n);
      if (cached && roundDone(cached) && n <= home.roundsPlayed) return cached;
      try {
        return parsePairings(toDoc(await f.get(tnr, { art: 2, rd: n })));
      } catch {
        return cached ?? null;
      }
    }),
  );
  const rounds = fetched.filter((r): r is RoundPairings => r !== null);

  const teamSnr = resolveTeam(home.teams, teamRef);
  const team = teamSnr === null ? null : await loadTeamPage(f, tnr, teamSnr).catch(() => prev?.team ?? null);

  return { tnr, fetchedAt: Date.now(), home, schedule, details, totalRounds, rounds, teamSnr, team };
}
