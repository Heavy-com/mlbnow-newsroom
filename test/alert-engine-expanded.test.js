'use strict';

const assert = require('node:assert/strict');

process.env.GNEWS_API_KEY = 'test-key';

const {
  CONFIGS,
  getAlertConfig,
} = require('../lib/alert-config');
const {
  runAlertCycle,
} = require('../lib/alert-engine');

const NOW = new Date('2026-08-04T20:00:00Z').getTime();

function emptyState() {
  return {
    articleIds: new Set(),
    postIds: new Set(),
    transactionIds: new Set(),
  };
}

function freshArticle(overrides = {}) {
  return {
    title: 'Fresh sports update',
    description: 'A fresh sports update.',
    url: 'https://example.com/fresh-update',
    publishedAt: '2026-08-04T19:30:00Z',
    source: { name: 'Example Sports' },
    ...overrides,
  };
}

function freshPost(overrides = {}) {
  return {
    post_id: 'post-1',
    text_preview: 'Fresh sports update',
    source_url: 'https://x.com/example/status/1',
    created_at: '2026-08-04T19:45:00Z',
    matched_leagues: [],
    matched_streams: [],
    author: {
      display_name: 'Example Reporter',
      username: 'example',
      followers_count: 10000,
    },
    latest_metrics: {
      likes: 10,
      reposts: 2,
      replies: 1,
      views: 1000,
    },
    ...overrides,
  };
}

function testLeagueConfigurationCoverage() {
  const expected = {
    mlb: { teams: 4, webhook: 'GCHAT_MLB', provider: 'news-proxy' },
    nfl: { teams: 32, webhook: 'GCHAT_NFL', provider: 'gnews' },
    nba: { teams: 30, webhook: 'GCHAT_NBA', provider: 'gnews' },
    nhl: { teams: 32, webhook: 'GCHAT_NHL', provider: 'gnews' },
  };

  assert.deepEqual(Object.keys(CONFIGS).sort(), Object.keys(expected).sort());

  for (const [league, details] of Object.entries(expected)) {
    const config = getAlertConfig(league);
    const teamIds = Object.keys(config.teams);

    assert.equal(config.id, league);
    assert.equal(config.webhookEnv, details.webhook);
    assert.equal(config.newsProvider, details.provider);
    assert.equal(teamIds.length, details.teams);
    assert.equal(new Set(teamIds).size, teamIds.length);
    assert.ok(config.freshnessMs > 0);
    assert.ok(config.queries.length >= 2);
    assert.ok(config.breakingKeywords.length > 0);
    assert.ok(config.tradeKeywords.length > 0);
    assert.ok(config.injuryKeywords.length > 0);

    for (const team of Object.values(config.teams)) {
      assert.ok(Array.isArray(team.keywords));
      assert.ok(team.keywords.length > 0);
    }
  }

  assert.throws(() => getAlertConfig('wnba'), /Unknown alert config/);
}

function testAllAlertRoutesLoad() {
  const handlers = [
    require('../api/alerts'),
    require('../api/nfl-alerts'),
    require('../api/nba-alerts'),
    require('../api/nhl-alerts'),
  ];

  for (const handler of handlers) {
    assert.equal(typeof handler, 'function');
  }
}

async function testFreshnessLeagueFilteringAndDeduplication() {
  const config = getAlertConfig('nba');
  const state = emptyState();
  const sent = [];

  const fresh = freshArticle({
    title: 'NBA schedule update',
    description: 'The league published a schedule update.',
    url: 'https://example.com/nba-fresh',
  });
  const stale = freshArticle({
    title: 'Old NBA report',
    url: 'https://example.com/nba-stale',
    publishedAt: '2026-08-04T12:00:00Z',
  });
  const removed = freshArticle({
    title: '[Removed]',
    url: 'https://example.com/removed',
  });

  const posts = [
    freshPost({
      post_id: 'nba-breaking',
      text_preview: 'League-wide breaking NBA update',
      matched_leagues: ['NBA'],
      matched_streams: ['Breaking NBA'],
    }),
    freshPost({
      post_id: 'nba-team',
      text_preview: 'Los Angeles Lakers roster update',
      source_url: 'https://x.com/example/status/2',
      matched_leagues: ['NBA'],
      matched_streams: [],
    }),
    freshPost({
      post_id: 'nba-stale',
      text_preview: 'Old breaking NBA update',
      source_url: 'https://x.com/example/status/3',
      created_at: '2026-08-04T12:00:00Z',
      matched_leagues: ['NBA'],
      matched_streams: ['Breaking NBA'],
    }),
    freshPost({
      post_id: 'wrong-league',
      text_preview: 'Hockey league update',
      source_url: 'https://x.com/example/status/4',
      matched_leagues: ['NHL'],
      matched_streams: ['Breaking NHL'],
    }),
    freshPost({
      post_id: 'nba-nonbreaking-no-team',
      text_preview: 'General league note',
      source_url: 'https://x.com/example/status/5',
      matched_leagues: ['NBA'],
      matched_streams: [],
    }),
  ];

  const deps = {
    now: () => NOW,
    webhookUrl: 'https://chat.googleapis.com/mock',
    state,
    requestJSON: async () => ({
      status: 200,
      body: { articles: [fresh, fresh, stale, removed] },
    }),
    fetchSignalPosts: async () => ({
      status: 200,
      body: { items: posts },
    }),
    postToGoogleChat: async (_url, text) => {
      sent.push(text);
      return { status: 200, body: '' };
    },
  };

  const first = await runAlertCycle(config, deps);

  assert.equal(first.alerts_sent, 3);
  assert.equal(first.errors.length, 0);
  assert.equal(sent.length, 3);
  assert.equal(first.debug.articles_checked, 3);
  assert.ok(sent.some((message) => message.includes('NBA NEWS')));
  assert.ok(sent.some((message) => message.includes('BREAKING')));
  assert.ok(sent.some((message) => message.includes('X POST')));
  assert.equal(state.articleIds.size, 1);
  assert.equal(state.postIds.size, 2);

  const second = await runAlertCycle(config, deps);
  assert.equal(second.alerts_sent, 0);
  assert.equal(sent.length, 3);
}

async function testWebhookFailureIsReported() {
  const config = getAlertConfig('nfl');
  const state = emptyState();

  const article = freshArticle({
    title: 'NFL confirms roster update',
    description: 'The NFL confirmed the move.',
    url: 'https://example.com/nfl-webhook-failure',
  });

  const result = await runAlertCycle(config, {
    now: () => NOW,
    webhookUrl: 'https://chat.googleapis.com/mock',
    state,
    requestJSON: async () => ({
      status: 200,
      body: { articles: [article] },
    }),
    fetchSignalPosts: async () => ({
      status: 200,
      body: { items: [] },
    }),
    postToGoogleChat: async () => {
      throw new Error('Mock Google Chat failure');
    },
  });

  assert.equal(result.alerts_sent, 0);
  assert.equal(result.errors.length, 1);
  assert.match(String(result.errors[0]), /Mock Google Chat failure/);
}

async function testMlbTeamScopingAndTransactionDates() {
  const config = getAlertConfig('mlb');
  const state = emptyState();
  const sent = [];

  const article = freshArticle({
    title: 'Yankees and Dodgers announce trade',
    description: 'The New York Yankees and Los Angeles Dodgers completed a deal.',
    url: 'https://example.com/yankees-dodgers',
    publishedAt: '2026-08-04T19:50:00Z',
  });

  const post = freshPost({
    post_id: 'mlb-yankees-breaking',
    text_preview: 'Breaking Yankees roster update',
    source_url: 'https://x.com/example/status/10',
    created_at: '2026-08-04T19:55:00Z',
    matched_leagues: ['MLB'],
    matched_streams: ['Breaking MLB', 'Yankees'],
  });

  const currentTransaction = {
    id: 100,
    transactionType: 'Signed',
    effectiveDate: '2026-08-04',
    description: 'New York Yankees signed RHP Current Player.',
    player: { fullName: 'Current Player' },
    toTeam: { name: 'New York Yankees' },
  };
  const oldTransaction = {
    id: 101,
    transactionType: 'Signed',
    effectiveDate: '2026-08-02',
    description: 'New York Yankees signed RHP Old Player.',
    player: { fullName: 'Old Player' },
    toTeam: { name: 'New York Yankees' },
  };
  const unmatchedTransaction = {
    id: 102,
    transactionType: 'Signed',
    effectiveDate: '2026-08-04',
    description: 'A different club signed RHP Other Player.',
    player: { fullName: 'Other Player' },
    toTeam: { name: 'Different Club' },
  };

  const deps = {
    now: () => NOW,
    webhookUrl: 'https://chat.googleapis.com/mock',
    state,
    baseUrl: () => 'https://heavy-newsroom.vercel.app',
    requestJSON: async (hostname) => {
      if (hostname === 'statsapi.mlb.com') {
        return {
          status: 200,
          body: {
            transactions: [
              currentTransaction,
              oldTransaction,
              unmatchedTransaction,
            ],
          },
        };
      }
      return { status: 200, body: { articles: [article] } };
    },
    fetchSignalPosts: async () => ({
      status: 200,
      body: { items: [post] },
    }),
    postToGoogleChat: async (_url, text) => {
      sent.push(text);
      return { status: 200, body: '' };
    },
  };

  const first = await runAlertCycle(config, deps);

  assert.equal(first.alerts_sent, 4);
  assert.deepEqual(
    first.alerts.map((alert) => alert.type).sort(),
    ['news', 'news', 'social', 'transaction'].sort()
  );
  assert.equal(
    first.alerts.filter((alert) => alert.type === 'news').length,
    2
  );
  assert.ok(sent.some((message) => message.includes('New York Yankees')));
  assert.ok(sent.some((message) => message.includes('Los Angeles Dodgers')));
  assert.ok(sent.some((message) => message.includes('Current Player')));
  assert.equal(sent.some((message) => message.includes('Old Player')), false);
  assert.equal(sent.some((message) => message.includes('Other Player')), false);

  const second = await runAlertCycle(config, deps);
  assert.equal(second.alerts_sent, 0);
}

async function testMissingWebhookFailsBeforeFetching() {
  const config = getAlertConfig('nhl');
  const original = process.env[config.webhookEnv];
  delete process.env[config.webhookEnv];

  let fetched = false;
  try {
    await assert.rejects(
      runAlertCycle(config, {
        now: () => NOW,
        state: emptyState(),
        requestJSON: async () => {
          fetched = true;
          return { status: 200, body: { articles: [] } };
        },
        fetchSignalPosts: async () => {
          fetched = true;
          return { status: 200, body: { items: [] } };
        },
      }),
      (error) => error && error.code === 'WEBHOOK_MISSING'
    );
  } finally {
    if (original === undefined) {
      delete process.env[config.webhookEnv];
    } else {
      process.env[config.webhookEnv] = original;
    }
  }

  assert.equal(fetched, false);
}

Promise.resolve()
  .then(testLeagueConfigurationCoverage)
  .then(testAllAlertRoutesLoad)
  .then(testFreshnessLeagueFilteringAndDeduplication)
  .then(testWebhookFailureIsReported)
  .then(testMlbTeamScopingAndTransactionDates)
  .then(testMissingWebhookFailsBeforeFetching)
  .then(() => console.log('expanded alert tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
