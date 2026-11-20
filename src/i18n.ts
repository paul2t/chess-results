const en = {
  team: 'Team', standings: 'Standings', rounds: 'Rounds', settings: 'Settings',
  refresh: 'Refresh', updated: 'Updated', source: 'chess-results upload',
  rank: 'Rank', seed: 'Seed', mp: 'Match pts', gp: 'Game pts', record: 'W-D-L',
  nextMatch: 'Next match', liveMatch: 'In progress', lastMatch: 'Last result', startsAt: 'Starts',
  round: 'Round', vs: 'vs', lineup: 'Line-up', matches: 'Matches', boards: 'Boards',
  white: 'White', black: 'Black', bye: 'Bye', notPaired: 'Not paired yet',
  noData: 'Nothing to show yet', search: 'Find a team…', myTeam: 'My team', backToMine: 'Back to my team',
  viewing: 'Viewing', chooseTeam: 'Choose your team', tournament: 'Tournament',
  tournamentHint: 'chess-results link or number', apply: 'Apply', autoRefresh: 'Auto-refresh (60 s)',
  demo: 'Demo (2025 data)', offline: 'Offline – showing saved data from', error: 'Could not load',
  loading: 'Loading…', finished: 'Final', forfeit: 'forfeit', noPlayer: 'no player',
  startingList: 'Starting list', standingsAfter: 'Standings after round', retry: 'Retry',
  win: 'Win', draw: 'Draw', loss: 'Loss', close: 'Close', scrollToMe: 'Jump to my team',
  proxyNeeded: 'chess-results does not allow direct access from this site. Set up the proxy described in the README.',
  proxyUrl: 'Proxy URL (advanced)', pts: 'Pts',
};

const fr: typeof en = {
  team: 'Équipe', standings: 'Classement', rounds: 'Rondes', settings: 'Réglages',
  refresh: 'Actualiser', updated: 'Mis à jour', source: 'mise en ligne chess-results',
  rank: 'Rang', seed: 'Tête de série', mp: 'Pts match', gp: 'Pts parties', record: 'G-N-P',
  nextMatch: 'Prochain match', liveMatch: 'En cours', lastMatch: 'Dernier résultat', startsAt: 'Début',
  round: 'Ronde', vs: 'contre', lineup: 'Composition', matches: 'Matchs', boards: 'Échiquiers',
  white: 'Blancs', black: 'Noirs', bye: 'Exempt', notPaired: 'Pas encore appariée',
  noData: 'Rien à afficher pour le moment', search: 'Chercher une équipe…', myTeam: 'Mon équipe', backToMine: 'Retour à mon équipe',
  viewing: 'Équipe affichée', chooseTeam: 'Choisissez votre équipe', tournament: 'Tournoi',
  tournamentHint: 'lien chess-results ou numéro', apply: 'Valider', autoRefresh: 'Actualisation auto (60 s)',
  demo: 'Démo (données 2025)', offline: 'Hors ligne – données enregistrées de', error: 'Chargement impossible',
  loading: 'Chargement…', finished: 'Final', forfeit: 'forfait', noPlayer: 'absent',
  startingList: 'Liste de départ', standingsAfter: 'Classement après la ronde', retry: 'Réessayer',
  win: 'Victoire', draw: 'Nul', loss: 'Défaite', close: 'Fermer', scrollToMe: 'Aller à mon équipe',
  proxyNeeded: "chess-results n'autorise pas l'accès direct depuis ce site. Configurez le proxy décrit dans le README.",
  proxyUrl: 'URL du proxy (avancé)', pts: 'Pts',
};

export type Key = keyof typeof en;
const dict = (navigator.language || 'en').toLowerCase().startsWith('fr') ? fr : en;
export const t = (k: Key): string => dict[k];
