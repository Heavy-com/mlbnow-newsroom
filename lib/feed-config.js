'use strict';

const FEED_CONFIGS = Object.freeze({
  mlb: Object.freeze({
    id: 'mlb',
    league: 'MLB',
    hasTransactions: true,
    hasSocial: true,
    queries: Object.freeze([
      'MLB trade roster move baseball',
      'MLB injury baseball player',
      'Yankees Dodgers Mets Red Sox Astros Cubs Braves baseball news',
      'Phillies Padres Mariners Orioles Cardinals Rangers Blue Jays baseball news',
    ]),
  }),
  nfl: Object.freeze({
    id: 'nfl',
    league: 'NFL',
    hasTransactions: false,
    hasSocial: true,
    queries: Object.freeze([
      'NFL trade signing free agent roster move',
      'NFL injury quarterback receiver',
      'Cowboys Patriots Eagles Chiefs Bears Giants NFL news',
      'Rams Steelers Ravens 49ers Packers Seahawks NFL news',
    ]),
  }),
  nba: Object.freeze({
    id: 'nba',
    league: 'NBA',
    hasTransactions: false,
    hasSocial: true,
    queries: Object.freeze([
      'NBA trade signing free agent roster move',
      'NBA injury player out',
      'Lakers Celtics Warriors Knicks Bulls Heat NBA news',
      'Bucks Suns Nuggets Clippers Nets Mavericks NBA news',
    ]),
  }),
  nhl: Object.freeze({
    id: 'nhl',
    league: 'NHL',
    hasTransactions: false,
    hasSocial: true,
    queries: Object.freeze([
      'NHL trade signing free agent roster move',
      'NHL injury player out',
      'Rangers Bruins Maple Leafs Canadiens Penguins Capitals NHL news',
      'Oilers Avalanche Lightning Panthers Kings Sharks NHL news',
    ]),
  }),
});

function getFeedConfig(id) {
  const config = FEED_CONFIGS[id];
  if (!config) {
    const error = new Error(`Unsupported league: ${id}`);
    error.code = 'LEAGUE_NOT_ALLOWED';
    throw error;
  }
  return config;
}

module.exports = {
  FEED_CONFIGS,
  getFeedConfig,
};
