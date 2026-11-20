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
  /** One entry per round: "1", "0", "½", "+", "-" or "" when not played yet. */
  results: string[];
  points: string;
  games: number | null;
}

export interface Opponent {
  name: string;
  title: string;
  fed: string;
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
  /** Resolved team number of the followed team (null if unknown / not chosen). */
  teamSnr: number | null;
  team: TeamPage | null;
}
