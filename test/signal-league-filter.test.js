'use strict';

const assert = require('node:assert/strict');

const { buildDashboardFeed } = require('../lib/dashboard-feed');
const {
  classifySignalItem,
  filterSignalItemsByLeague,
} = require('../lib/signal-league-filter');

const ITEMS = [
  {
    id: 'mlb-1',
    text: 'The Yankees are expected to make a roster move today.',
    author_username: 'baseball_reporter',
    categories: [{ category: 'breaking_news' }],
  },
  {
    id: 'nfl-1',
    text: 'The Kansas City Chiefs have announced a signing.',
    author_username: 'football_reporter',
    categories: [{ category: 'breaking_news' }],
  },
  {
    id: 'nba-1',
    text: 'The Lakers provided an injury update after practice.',
    author_username: 'basketball_reporter',
    categories: [{ category: 'breaking_news' }],
  },
  {
    id: 'nhl-1',
    text: 'The Toronto Maple Leafs completed a trade.',
    author_username: 'hockey_reporter',
    categories: [{ category: 'breaking_news' }],
  },
  {
    id: 'ambiguous-1',
    text: 'The Giants made a move today.',
    author_username: 'sports_reporter',
    categories: [{ category: 'breaking_news' }],
  },
  {
    id: 'category-mlb',
    text: 'A star player is expected to return tonight.',
    author_username: 'league_insider',
    categories: [{ category: 'mlb' }],
  },
];

function testClassifier() {
  assert.equal(classifySignalItem(ITEMS[0]).league, 'mlb');
  assert.equal(classifySignalItem(ITEMS[1]).league, 'nfl');
  assert.equal(classifySignalItem(ITEMS[2]).league, 'nba');
  assert.equal(classifySignalItem(ITEMS[3]).league, 'nhl');
  assert.equal(classifySignalItem(ITEMS[4]).league, null);
  assert.equal(classifySignalItem(ITEMS[4]).reason, 'ambiguous');
  assert.equal(classifySignalItem(ITEMS[5]).league, 'mlb');
}

function testFilterStats() {
  const result = filterSignalItemsByLeague(ITEMS, 'mlb');
  assert.deepEqual(result.items.map((item) => item.id), ['mlb-1', 'category-mlb']);
  assert.equal(result.stats.fetched, 6);
  assert.equal(result.stats.matched, 2);
  assert.equal(result.stats.excluded, 4);
  assert.equal(result.stats.ambiguous, 1);
  assert.equal(result.stats.mode, 'local_league_classifier_v1');
}

async function testDashboardIntegration() {
  const result = await buildDashboardFeed('nfl', {
    now: () => new Date('2026-08-05T01:00:00Z').getTime(),
    fetchNewsQuery: async () => ({ status: 'ok', articles: [] }),
    fetchSignalFeed: async () => ({ items: ITEMS }),
  });

  assert.equal(result.available, true);
  assert.equal(result.source_status.signal, 'ok');
  assert.deepEqual(result.social.map((item) => item.id), ['nfl-1']);
  assert.equal(result.social_filter.fetched, 6);
  assert.equal(result.social_filter.matched, 1);
}

(async () => {
  testClassifier();
  testFilterStats();
  await testDashboardIntegration();
  console.log('Signal league filtering tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
