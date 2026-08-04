'use strict';

const COMMON_BREAKING = ['breaking', 'exclusive', 'just in', 'confirmed', 'fired', 'suspended', 'announces', 'cut', 'released'];
const COMMON_TRADE = ['trade', 'traded', 'signed', 'free agent', 'contract', 'extension', 'released', 'cut', 'waiver', 'claimed'];

const CONFIGS = {
  mlb: {
    id: 'mlb',
    league: 'MLB',
    webhookEnv: 'GCHAT_MLB',
    freshnessMs: 30 * 60 * 1000,
    sportEmoji: '⚾',
    newsLabel: 'NEWS',
    newsProvider: 'news-proxy',
    teamScoped: true,
    includeTransactions: true,
    queries: [
      'Yankees Dodgers Mets Red Sox baseball breaking news',
      'Yankees Dodgers Mets Red Sox trade injury roster',
    ],
    breakingKeywords: ['breaking', 'exclusive', 'just in', 'confirmed', 'fired', 'resigns', 'retires', 'suspended', 'announced'],
    tradeKeywords: ['trade', 'traded', 'signed', 'free agent', 'contract', 'extension', 'released', 'designated for assignment', 'dfa', 'acquired'],
    injuryKeywords: ['injury', 'injured', 'injured list', 'il ', 'surgery', 'torn', 'strain', 'sprain', 'concussion', 'day-to-day', 'out indefinitely'],
    teams: {
      yankees: { label: 'New York Yankees', emoji: '⚾', keywords: ['new york yankees', 'yankees', 'bronx'], streams: ['Yankees'] },
      redsox: { label: 'Boston Red Sox', emoji: '🧦', keywords: ['boston red sox', 'red sox', 'fenway'], streams: ['Red Sox'] },
      mets: { label: 'New York Mets', emoji: '🔵', keywords: ['new york mets', 'mets baseball', 'citi field'], streams: ['Mets'] },
      dodgers: { label: 'Los Angeles Dodgers', emoji: '💙', keywords: ['los angeles dodgers', 'dodgers', 'ohtani'], streams: ['Dodgers'] },
    },
  },

  nfl: {
    id: 'nfl',
    league: 'NFL',
    webhookEnv: 'GCHAT_NFL',
    freshnessMs: 6 * 60 * 60 * 1000,
    sportEmoji: '🏈',
    newsLabel: 'NFL NEWS',
    newsProvider: 'gnews',
    teamScoped: false,
    includeTransactions: false,
    queries: [
      'NFL trade signing free agent roster move',
      'NFL injury quarterback receiver',
      'Cowboys Patriots Eagles Chiefs Bears Giants NFL',
      'Rams Steelers Ravens 49ers Packers Seahawks NFL',
    ],
    breakingKeywords: COMMON_BREAKING,
    tradeKeywords: COMMON_TRADE,
    injuryKeywords: ['injury', 'injured', 'ir ', 'injured reserve', 'surgery', 'torn', 'strain', 'sprain', 'concussion', 'pup', 'nfi'],
    teams: {
      bills: { keywords: ['buffalo bills', 'bills football'] },
      dolphins: { keywords: ['miami dolphins', 'dolphins football'] },
      patriots: { keywords: ['new england patriots', 'patriots football'] },
      jets: { keywords: ['new york jets', 'jets football'] },
      ravens: { keywords: ['baltimore ravens', 'ravens football'] },
      bengals: { keywords: ['cincinnati bengals', 'bengals football'] },
      browns: { keywords: ['cleveland browns', 'browns football'] },
      steelers: { keywords: ['pittsburgh steelers', 'steelers football'] },
      texans: { keywords: ['houston texans', 'texans football'] },
      colts: { keywords: ['indianapolis colts', 'colts football'] },
      jaguars: { keywords: ['jacksonville jaguars', 'jaguars football'] },
      titans: { keywords: ['tennessee titans', 'titans football'] },
      broncos: { keywords: ['denver broncos', 'broncos football'] },
      chiefs: { keywords: ['kansas city chiefs', 'chiefs football', 'mahomes'] },
      raiders: { keywords: ['las vegas raiders', 'raiders football'] },
      chargers: { keywords: ['los angeles chargers', 'chargers football'] },
      cowboys: { keywords: ['dallas cowboys', 'cowboys football'] },
      giants: { keywords: ['new york giants', 'giants football'] },
      eagles: { keywords: ['philadelphia eagles', 'eagles football'] },
      commanders: { keywords: ['washington commanders', 'commanders football'] },
      bears: { keywords: ['chicago bears', 'bears football'] },
      lions: { keywords: ['detroit lions', 'lions football'] },
      packers: { keywords: ['green bay packers', 'packers football'] },
      vikings: { keywords: ['minnesota vikings', 'vikings football'] },
      falcons: { keywords: ['atlanta falcons', 'falcons football'] },
      panthers: { keywords: ['carolina panthers', 'panthers football'] },
      saints: { keywords: ['new orleans saints', 'saints football'] },
      buccaneers: { keywords: ['tampa bay buccaneers', 'buccaneers football'] },
      cardinals: { keywords: ['arizona cardinals', 'cardinals football'] },
      rams: { keywords: ['los angeles rams', 'rams football'] },
      '49ers': { keywords: ['san francisco 49ers', '49ers', 'niners'] },
      seahawks: { keywords: ['seattle seahawks', 'seahawks football'] },
    },
  },

  nba: {
    id: 'nba',
    league: 'NBA',
    webhookEnv: 'GCHAT_NBA',
    freshnessMs: 6 * 60 * 60 * 1000,
    sportEmoji: '🏀',
    newsLabel: 'NBA NEWS',
    newsProvider: 'gnews',
    teamScoped: false,
    includeTransactions: false,
    queries: [
      'NBA trade signing free agent roster move',
      'NBA injury player out',
      'Lakers Celtics Warriors Knicks Bulls Heat NBA',
      'Bucks Nuggets Suns Mavericks Clippers Nets NBA',
    ],
    breakingKeywords: COMMON_BREAKING,
    tradeKeywords: COMMON_TRADE,
    injuryKeywords: ['injury', 'injured', 'injured reserve', 'surgery', 'torn', 'strain', 'sprain', 'concussion', 'day-to-day', 'out indefinitely'],
    teams: {
      celtics: { keywords: ['boston celtics', 'celtics basketball'] },
      nets: { keywords: ['brooklyn nets', 'nets basketball'] },
      knicks: { keywords: ['new york knicks', 'knicks basketball'] },
      sixers: { keywords: ['philadelphia 76ers', 'sixers basketball'] },
      raptors: { keywords: ['toronto raptors', 'raptors basketball'] },
      bulls: { keywords: ['chicago bulls', 'bulls basketball'] },
      cavaliers: { keywords: ['cleveland cavaliers', 'cavaliers', 'cavs'] },
      pistons: { keywords: ['detroit pistons', 'pistons basketball'] },
      pacers: { keywords: ['indiana pacers', 'pacers basketball'] },
      bucks: { keywords: ['milwaukee bucks', 'bucks basketball', 'giannis'] },
      hawks: { keywords: ['atlanta hawks', 'hawks basketball'] },
      hornets: { keywords: ['charlotte hornets', 'hornets basketball'] },
      heat: { keywords: ['miami heat', 'heat basketball'] },
      magic: { keywords: ['orlando magic', 'magic basketball'] },
      wizards: { keywords: ['washington wizards', 'wizards basketball'] },
      nuggets: { keywords: ['denver nuggets', 'nuggets basketball', 'jokic'] },
      timberwolves: { keywords: ['minnesota timberwolves', 'timberwolves'] },
      thunder: { keywords: ['oklahoma city thunder', 'thunder basketball', 'okc'] },
      blazers: { keywords: ['portland trail blazers', 'trail blazers'] },
      jazz: { keywords: ['utah jazz', 'jazz basketball'] },
      warriors: { keywords: ['golden state warriors', 'warriors basketball', 'curry'] },
      clippers: { keywords: ['la clippers', 'clippers basketball'] },
      lakers: { keywords: ['los angeles lakers', 'lakers basketball', 'lebron'] },
      suns: { keywords: ['phoenix suns', 'suns basketball'] },
      kings: { keywords: ['sacramento kings', 'kings basketball'] },
      mavericks: { keywords: ['dallas mavericks', 'mavericks', 'mavs', 'luka'] },
      rockets: { keywords: ['houston rockets', 'rockets basketball'] },
      grizzlies: { keywords: ['memphis grizzlies', 'grizzlies basketball'] },
      pelicans: { keywords: ['new orleans pelicans', 'pelicans basketball'] },
      spurs: { keywords: ['san antonio spurs', 'spurs basketball', 'wembanyama'] },
    },
  },

  nhl: {
    id: 'nhl',
    league: 'NHL',
    webhookEnv: 'GCHAT_NHL',
    freshnessMs: 6 * 60 * 60 * 1000,
    sportEmoji: '🏒',
    newsLabel: 'NHL NEWS',
    newsProvider: 'gnews',
    teamScoped: false,
    includeTransactions: false,
    queries: [
      'NHL trade signing free agent roster move',
      'NHL injury player out',
      'Rangers Bruins Maple Leafs Canadiens Penguins Capitals NHL',
      'Oilers Avalanche Lightning Panthers Kings Sharks NHL',
    ],
    breakingKeywords: COMMON_BREAKING,
    tradeKeywords: COMMON_TRADE,
    injuryKeywords: ['injury', 'injured', 'ltir', 'injured reserve', 'surgery', 'torn', 'strain', 'sprain', 'concussion', 'day-to-day', 'out indefinitely'],
    teams: {
      bruins: { keywords: ['boston bruins', 'bruins hockey'] },
      sabres: { keywords: ['buffalo sabres', 'sabres hockey'] },
      redwings: { keywords: ['detroit red wings', 'red wings hockey'] },
      panthers_nhl: { keywords: ['florida panthers', 'panthers hockey'] },
      canadiens: { keywords: ['montreal canadiens', 'canadiens hockey', 'habs'] },
      senators: { keywords: ['ottawa senators', 'senators hockey'] },
      lightning: { keywords: ['tampa bay lightning', 'lightning hockey'] },
      mapleleafs: { keywords: ['toronto maple leafs', 'maple leafs hockey'] },
      hurricanes: { keywords: ['carolina hurricanes', 'hurricanes hockey'] },
      bluejackets: { keywords: ['columbus blue jackets', 'blue jackets hockey'] },
      devils: { keywords: ['new jersey devils', 'devils hockey'] },
      islanders: { keywords: ['new york islanders', 'islanders hockey'] },
      rangers: { keywords: ['new york rangers', 'rangers hockey'] },
      flyers: { keywords: ['philadelphia flyers', 'flyers hockey'] },
      penguins: { keywords: ['pittsburgh penguins', 'penguins hockey', 'crosby'] },
      capitals: { keywords: ['washington capitals', 'capitals hockey', 'ovechkin'] },
      utah_hc: { keywords: ['utah hockey club', 'utah hc'] },
      blackhawks: { keywords: ['chicago blackhawks', 'blackhawks hockey'] },
      avalanche: { keywords: ['colorado avalanche', 'avalanche hockey'] },
      stars: { keywords: ['dallas stars', 'stars hockey'] },
      wild: { keywords: ['minnesota wild', 'wild hockey'] },
      predators: { keywords: ['nashville predators', 'predators hockey'] },
      blues: { keywords: ['st. louis blues', 'blues hockey'] },
      jets: { keywords: ['winnipeg jets', 'jets hockey'] },
      ducks: { keywords: ['anaheim ducks', 'ducks hockey'] },
      flames: { keywords: ['calgary flames', 'flames hockey'] },
      oilers: { keywords: ['edmonton oilers', 'oilers hockey', 'mcdavid'] },
      kings: { keywords: ['los angeles kings', 'kings hockey'] },
      sharks: { keywords: ['san jose sharks', 'sharks hockey'] },
      kraken: { keywords: ['seattle kraken', 'kraken hockey'] },
      canucks: { keywords: ['vancouver canucks', 'canucks hockey'] },
      goldenknights: { keywords: ['vegas golden knights', 'golden knights hockey'] },
    },
  },
};

function validateAlertConfig(config) {
  const required = ['id', 'league', 'webhookEnv', 'freshnessMs', 'sportEmoji', 'newsLabel', 'newsProvider', 'queries', 'teams'];
  for (const key of required) {
    if (config[key] === undefined || config[key] === null) {
      throw new Error(`Alert config is missing ${key}`);
    }
  }
  if (!Array.isArray(config.queries) || !config.queries.length) {
    throw new Error(`Alert config ${config.id} must include queries`);
  }
  if (!['gnews', 'news-proxy'].includes(config.newsProvider)) {
    throw new Error(`Alert config ${config.id} has an unsupported newsProvider`);
  }
  return config;
}

function getAlertConfig(id) {
  const config = CONFIGS[id];
  if (!config) throw new Error(`Unknown alert config: ${id}`);
  return validateAlertConfig(config);
}

module.exports = {
  CONFIGS,
  getAlertConfig,
  validateAlertConfig,
};
