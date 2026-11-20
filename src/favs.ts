// Favorite tournaments: a small list kept in localStorage, with enough metadata to be shown
// on the dashboard without any network request.
import type { Tournament } from './types';

export const FAVS_KEY = 'cr:favs';

/** Parses the stored JSON, dropping anything that is not a usable entry. */
export function parseFavs(raw: string | null): Tournament[] {
  if (!raw) return [];
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(data)) return [];
  const out: Tournament[] = [];
  for (const x of data as Partial<Tournament>[]) {
    if (!x || !Number.isInteger(x.tnr) || (x.tnr as number) <= 0) continue;
    if (out.some((o) => o.tnr === x.tnr)) continue;
    out.push({
      tnr: x.tnr as number,
      name: typeof x.name === 'string' && x.name ? x.name : `Tournament ${x.tnr}`,
      fed: typeof x.fed === 'string' ? x.fed : '',
      from: typeof x.from === 'string' ? x.from : '',
      to: typeof x.to === 'string' ? x.to : '',
      location: typeof x.location === 'string' ? x.location : '',
    });
  }
  return out;
}

export const isFav = (favs: Tournament[], tnr: number): boolean => favs.some((f) => f.tnr === tnr);

/** Adds the tournament at the top of the list, or removes it when already there. */
export function toggleFav(favs: Tournament[], tour: Tournament): Tournament[] {
  return isFav(favs, tour.tnr) ? favs.filter((f) => f.tnr !== tour.tnr) : [tour, ...favs];
}

export type Phase = 'upcoming' | 'live' | 'finished' | 'unknown';

/** Where a tournament stands today, from its "yyyy/mm/dd" dates (compared as strings). */
export function phaseOf(from: string, to: string, today: string): Phase {
  const re = /^\d{4}\/\d{2}\/\d{2}$/;
  if (!re.test(from)) return 'unknown';
  const end = re.test(to) ? to : from;
  if (today < from) return 'upcoming';
  if (today > end) return 'finished';
  return 'live';
}

export const todayStamp = (d = new Date()): string =>
  `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;

/** Favorites first by phase (live, upcoming, finished), then most recent start first. */
export function sortFavs(favs: Tournament[], today: string): Tournament[] {
  const rank: Record<Phase, number> = { live: 0, upcoming: 1, unknown: 2, finished: 3 };
  return [...favs].sort((a, b) => {
    const pa = rank[phaseOf(a.from, a.to, today)], pb = rank[phaseOf(b.from, b.to, today)];
    if (pa !== pb) return pa - pb;
    // upcoming: soonest first; others: latest first
    return pa === 1 ? a.from.localeCompare(b.from) : b.from.localeCompare(a.from);
  });
}

// ── favorite teams (per tournament, kept by name: team numbers can move before the event starts) ──

export const favTeamsKey = (tnr: number): string => `cr:favteams:${tnr}`;

export function parseNames(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? [...new Set((data as unknown[]).filter((x): x is string => typeof x === 'string' && x !== ''))] : [];
  } catch {
    return [];
  }
}

/** Adds the name, or removes it when already present (compared with `same`). */
export function toggleName(names: string[], name: string, same: (a: string, b: string) => boolean): string[] {
  return names.some((n) => same(n, name)) ? names.filter((n) => !same(n, name)) : [...names, name];
}

// ── recently opened tournaments ──

export const RECENT_KEY = 'cr:recent';
export const RECENT_MAX = 8;

/** Puts the tournament first, drops duplicates and keeps details a newer entry lacks (federation, dates…). */
export function pushRecent(list: Tournament[], tour: Tournament, max = RECENT_MAX): Tournament[] {
  const old = list.find((x) => x.tnr === tour.tnr);
  const merged: Tournament = old
    ? {
        tnr: tour.tnr, name: tour.name || old.name, fed: tour.fed || old.fed,
        from: tour.from || old.from, to: tour.to || old.to, location: tour.location || old.location,
      }
    : tour;
  return [merged, ...list.filter((x) => x.tnr !== tour.tnr)].slice(0, max);
}
