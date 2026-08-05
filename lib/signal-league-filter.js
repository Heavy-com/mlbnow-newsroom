'use strict';

const MIN_CLASSIFICATION_SCORE = 3;

const LEAGUE_MATCHERS = Object.freeze({
  mlb: Object.freeze({
    leagueTerms: Object.freeze(['mlb', 'major league baseball']),
    sportTerms: Object.freeze(['baseball']),
    fullTeamTerms: Object.freeze([
      'arizona diamondbacks',
      'oakland athletics',
      'sacramento athletics',
      'atlanta braves',
      'baltimore orioles',
      'boston red sox',
      'chicago cubs',
      'chicago white sox',
      'cincinnati reds',
      'cleveland guardians',
      'colorado rockies',
      'detroit tigers',
      'houston astros',
      'kansas city royals',
      'los angeles angels',
      'los angeles dodgers',
      'miami marlins',
      'milwaukee brewers',
      'minnesota twins',
      'new york mets',
      'new york yankees',
      'philadelphia phillies',
      'pittsburgh pirates',
      'san diego padres',
      'san francisco giants',
      'seattle mariners',
      'st louis cardinals',
      'tampa bay rays',
      'texas rangers',
      'toronto blue jays',
      'washington nationals',
    ]),
    uniqueAliases: Object.freeze([
      'diamondbacks', 'dbacks', 'athletics', 'braves', 'orioles',
      'red sox', 'cubs', 'white sox', 'reds', 'guardians', 'rockies',
      'tigers', 'astros', 'royals', 'angels', 'dodgers', 'marlins',
      'brewers', 'twins', 'mets', 'yankees', 'phillies', 'pirates',
      'padres', 'mariners', 'rays', 'blue jays', 'nationals',
    ]),
    ambiguousAliases: Object.freeze(['giants', 'cardinals', 'rangers']),
  }),

  nfl: Object.freeze({
    leagueTerms: Object.freeze(['nfl', 'national football league']),
    sportTerms: Object.freeze(['american football']),
    fullTeamTerms: Object.freeze([
      'buffalo bills',
      'miami dolphins',
      'new england patriots',
      'new york jets',
      'baltimore ravens',
      'cincinnati bengals',
      'cleveland browns',
      'pittsburgh steelers',
      'houston texans',
      'indianapolis colts',
      'jacksonville jaguars',
      'tennessee titans',
      'denver broncos',
      'kansas city chiefs',
      'las vegas raiders',
      'los angeles chargers',
      'dallas cowboys',
      'new york giants',
      'philadelphia eagles',
      'washington commanders',
      'chicago bears',
      'detroit lions',
      'green bay packers',
      'minnesota vikings',
      'atlanta falcons',
      'carolina panthers',
      'new orleans saints',
      'tampa bay buccaneers',
      'arizona cardinals',
      'los angeles rams',
      'san francisco 49ers',
      'seattle seahawks',
    ]),
    uniqueAliases: Object.freeze([
      'bills', 'dolphins', 'patriots', 'ravens', 'bengals', 'browns',
      'steelers', 'texans', 'colts', 'jaguars', 'titans', 'broncos',
      'chiefs', 'raiders', 'chargers', 'cowboys', 'eagles', 'commanders',
      'bears', 'lions', 'packers', 'vikings', 'falcons', 'saints',
      'buccaneers', 'bucs', 'rams', '49ers', 'niners', 'seahawks',
    ]),
    ambiguousAliases: Object.freeze(['jets', 'giants', 'cardinals', 'panthers']),
  }),

  nba: Object.freeze({
    leagueTerms: Object.freeze(['nba', 'national basketball association']),
    sportTerms: Object.freeze(['basketball']),
    fullTeamTerms: Object.freeze([
      'boston celtics',
      'brooklyn nets',
      'new york knicks',
      'philadelphia 76ers',
      'toronto raptors',
      'chicago bulls',
      'cleveland cavaliers',
      'detroit pistons',
      'indiana pacers',
      'milwaukee bucks',
      'atlanta hawks',
      'charlotte hornets',
      'miami heat',
      'orlando magic',
      'washington wizards',
      'denver nuggets',
      'minnesota timberwolves',
      'oklahoma city thunder',
      'portland trail blazers',
      'utah jazz',
      'golden state warriors',
      'los angeles clippers',
      'los angeles lakers',
      'phoenix suns',
      'sacramento kings',
      'dallas mavericks',
      'houston rockets',
      'memphis grizzlies',
      'new orleans pelicans',
      'san antonio spurs',
    ]),
    uniqueAliases: Object.freeze([
      'celtics', 'nets', 'knicks', '76ers', 'sixers', 'raptors', 'bulls',
      'cavaliers', 'cavs', 'pistons', 'pacers', 'bucks', 'hawks',
      'hornets', 'heat', 'magic', 'wizards', 'nuggets', 'timberwolves',
      'wolves', 'thunder', 'trail blazers', 'blazers', 'jazz', 'warriors',
      'clippers', 'lakers', 'suns', 'mavericks', 'mavs', 'rockets',
      'grizzlies', 'pelicans', 'spurs',
    ]),
    ambiguousAliases: Object.freeze(['kings']),
  }),

  nhl: Object.freeze({
    leagueTerms: Object.freeze(['nhl', 'national hockey league']),
    sportTerms: Object.freeze(['hockey']),
    fullTeamTerms: Object.freeze([
      'anaheim ducks',
      'boston bruins',
      'buffalo sabres',
      'calgary flames',
      'carolina hurricanes',
      'chicago blackhawks',
      'colorado avalanche',
      'columbus blue jackets',
      'dallas stars',
      'detroit red wings',
      'edmonton oilers',
      'florida panthers',
      'los angeles kings',
      'minnesota wild',
      'montreal canadiens',
      'nashville predators',
      'new jersey devils',
      'new york islanders',
      'new york rangers',
      'ottawa senators',
      'philadelphia flyers',
      'pittsburgh penguins',
      'san jose sharks',
      'seattle kraken',
      'st louis blues',
      'tampa bay lightning',
      'toronto maple leafs',
      'utah mammoth',
      'utah hockey club',
      'vancouver canucks',
      'vegas golden knights',
      'washington capitals',
      'winnipeg jets',
    ]),
    uniqueAliases: Object.freeze([
      'ducks', 'bruins', 'sabres', 'flames', 'hurricanes', 'blackhawks',
      'avalanche', 'avs', 'blue jackets', 'stars', 'red wings', 'oilers',
      'wild', 'canadiens', 'habs', 'predators', 'preds', 'devils',
      'islanders', 'senators', 'flyers', 'penguins', 'pens', 'sharks',
      'kraken', 'blues', 'lightning', 'maple leafs', 'leafs', 'mammoth',
      'canucks', 'golden knights', 'capitals', 'caps',
    ]),
    ambiguousAliases: Object.freeze(['panthers', 'kings', 'rangers', 'jets']),
  }),
});

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/&/gu, ' and ')
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function itemText(item) {
  const categoryValues = Array.isArray(item?.categories)
    ? item.categories.map((entry) => (
      typeof entry === 'string' ? entry : entry?.category
    ))
    : [];

  const tagValues = Array.isArray(item?.tags)
    ? item.tags.map((entry) => (
      typeof entry === 'string' ? entry : entry?.name
    ))
    : [];

  return normalizeText([
    item?.text,
    item?.title,
    item?.author_username,
    item?.author_display_name,
    item?.category,
    item?.editorial_category,
    item?.url,
    item?.permalink,
    ...categoryValues,
    ...tagValues,
  ].filter(Boolean).join(' '));
}

function containsTerm(normalizedHaystack, term) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedHaystack || !normalizedTerm) return false;
  return ` ${normalizedHaystack} `.includes(` ${normalizedTerm} `);
}

function scoreLeague(normalizedHaystack, matcher) {
  let score = 0;

  for (const term of matcher.leagueTerms) {
    if (containsTerm(normalizedHaystack, term)) score += 8;
  }
  for (const term of matcher.fullTeamTerms) {
    if (containsTerm(normalizedHaystack, term)) score += 6;
  }
  for (const term of matcher.uniqueAliases) {
    if (containsTerm(normalizedHaystack, term)) score += 3;
  }
  for (const term of matcher.sportTerms) {
    if (containsTerm(normalizedHaystack, term)) score += 1;
  }
  for (const term of matcher.ambiguousAliases) {
    if (containsTerm(normalizedHaystack, term)) score += 1;
  }

  return score;
}

function classifySignalItem(item) {
  const normalizedHaystack = itemText(item);
  const scores = Object.fromEntries(
    Object.entries(LEAGUE_MATCHERS).map(([league, matcher]) => [
      league,
      scoreLeague(normalizedHaystack, matcher),
    ])
  );

  const highestScore = Math.max(...Object.values(scores));
  const winners = Object.entries(scores)
    .filter(([, score]) => score === highestScore)
    .map(([league]) => league);

  if (highestScore > 0 && winners.length !== 1) {
    return {
      league: null,
      reason: 'ambiguous',
      score: highestScore,
      scores,
    };
  }

  if (highestScore < MIN_CLASSIFICATION_SCORE) {
    return {
      league: null,
      reason: 'unmatched',
      score: highestScore,
      scores,
    };
  }

  return {
    league: winners[0],
    reason: 'classified',
    score: highestScore,
    scores,
  };
}

function filterSignalItemsByLeague(items, leagueId) {
  if (!Object.hasOwn(LEAGUE_MATCHERS, leagueId)) {
    const error = new Error(`Unsupported Signal league filter: ${leagueId}`);
    error.code = 'LEAGUE_NOT_ALLOWED';
    throw error;
  }

  const sourceItems = Array.isArray(items) ? items : [];
  const matchedItems = [];
  let ambiguous = 0;
  let unmatched = 0;

  for (const item of sourceItems) {
    const classification = classifySignalItem(item);
    if (classification.league === leagueId) {
      matchedItems.push(item);
    } else if (classification.reason === 'ambiguous') {
      ambiguous += 1;
    } else if (classification.reason === 'unmatched') {
      unmatched += 1;
    }
  }

  return {
    items: matchedItems,
    stats: {
      mode: 'local_league_classifier_v1',
      fetched: sourceItems.length,
      matched: matchedItems.length,
      excluded: sourceItems.length - matchedItems.length,
      ambiguous,
      unmatched,
    },
  };
}

module.exports = {
  LEAGUE_MATCHERS,
  classifySignalItem,
  filterSignalItemsByLeague,
};
