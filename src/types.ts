// Data model shared by the parser, the loader and the UI.

export interface TeamRow {
  snr: number;
  name: string;
  fed: string;
  group: string;
  /** Rank in the standings (position in the list when chess-results leaves it blank for ties). */
  rank: number | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** Tie-break columns TB1..TB4 as displayed (strings, e.g. "15,5"). Empty before round 1. */
  tb: string[];
  /** Average rating (starting list only). */
  rating: number | null;
}

export interface HomePage {
  tournamentName: string;
  listTitle: string;
  lastUpdate: string;
  /** "ranking" once at least one round is played, "start" for the starting-rank list. */
  kind: 'ranking' | 'start';
  roundsPlayed: number;
  tbLabels: Record<number, string>;
  teams: TeamRow[];
}

export interface ScheduleRound {
  round: number;
  date: string; // 2026/11/27
  time: string; // 15:00
}

export interface Details {
  rounds: number | null;
  dates: string;
  location: string;
  timeControl: string;
}

export interface Pairing {
  no: number;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  bye: boolean;
}

export interface RoundPairings {
  round: number;
  date: string;
  time: string;
  matches: Pairing[];
}

export interface Player {
  board: number;
  title: string;
  name: string;
  rating: number | null;
  fed: string;
  fideId: string;
  /** Card number of the player, when the page links to it (before the event it does). */
  snr: number | null;
  /** One entry per round: "1", "0", "½", "+", "-" or "" when not played yet. */
  results: string[];
  points: string;
  games: number | null;
}

export interface Opponent {
  name: string;
  title: string;
  fed: string;
  /** International rating, else national; null when unrated or not on the page (e.g. before the round). */
  rating?: number | null;
}

export interface BoardGame {
  board: number;
  /** Colour of OUR player. */
  color: 'w' | 'b' | null;
  us: Opponent;
  opp: Opponent;
  usPts: number | null;
  oppPts: number | null;
  forfeit: boolean;
  noPlayer: boolean;
}

export interface TeamMatch {
  round: number;
  date: string;
  time: string;
  usSnr: number;
  usName: string;
  oppSnr: number;
  oppName: string;
  usScore: number | null;
  oppScore: number | null;
  /** True when both scores are known. */
  played: boolean;
  /** The table the match is played at: the part before the dot of its board numbers ("18.1"). Null when unknown. */
  table?: number | null;
  boards: BoardGame[];
}

export interface TeamPage {
  snr: number;
  name: string;
  captain: string;
  avgRating: number | null;
  tb1: string;
  tb2: string;
  lineup: Player[];
  matches: TeamMatch[];
  /** Number of rounds that have a result column in the composition table. */
  roundColumns: number;
}

export interface Snapshot {
  tnr: number;
  fetchedAt: number;
  home: HomePage;
  schedule: ScheduleRound[];
  details: Details | null;
  totalRounds: number;
  rounds: RoundPairings[];
}

/** A tournament as listed by the chess-results search (and kept as a favorite). */
export interface Tournament {
  tnr: number;
  name: string;
  fed: string;
  /** yyyy/mm/dd, as chess-results shows them (may be empty). */
  from: string;
  to: string;
  location: string;
}

// ── players ──

/** A row of the players' starting list (sorted by rating). */
export interface PlayerRow {
  /** Position in the list, 1 = highest rated (not the number the card page is addressed by). */
  no: number;
  title: string;
  name: string;
  fideId: string;
  ratingI: number;
  ratingN: number;
  fed: string;
  team: string;
  board: number | null;
  /** Card number, when the list links to it (it does before the event); else it is found by name. */
  snr: number | null;
}

/** One game on a player's card. */
export interface PlayerGame {
  round: number;
  board: number | null;
  /** Number of the opponent: the card page of that player is addressed by it (0 when there is none, e.g. a bye). */
  oppSnr: number;
  oppTitle: string;
  oppName: string;
  oppRatingI: number;
  oppRatingN: number;
  oppFed: string;
  /** The opponent's points, as shown by chess-results (after the round). */
  oppPts: number | null;
  color: 'w' | 'b' | null;
  /** 1, 0.5 or 0 for this player; null when not played yet. */
  result: number | null;
  forfeit: boolean;
}

/** A player's card: details and one game per round. */
export interface PlayerPage {
  snr: number;
  name: string;
  title: string;
  fed: string;
  ratingI: number;
  ratingN: number;
  perf: number | null;
  /** FIDE rating change of the event, as shown ("1,9"). */
  ratingChange: string;
  points: number | null;
  rank: number | null;
  fideId: string;
  birth: string;
  games: PlayerGame[];
}

/** Who has which card number: name -> candidates (several players can share a name). */
export type PlayerNumbers = Record<string, { snr: number; rating: number }[]>;
