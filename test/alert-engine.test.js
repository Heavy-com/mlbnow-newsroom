'use strict';

const assert = require('node:assert/strict');
process.env.GNEWS_API_KEY = 'test-key';
const {
  classifyTypes,
  matchTeams,
  runAlertCycle,
} = require('../lib/alert-engine');
const { getAlertConfig } = require('../lib/alert-config');

// Production disables news fetching; tests keep it on to cover that path.
const getAlertConfigWithNews = (id) => ({ ...getAlertConfig(id), includeNews: true });

for (const league of ['mlb', 'nfl', 'nba', 'nhl']) {
  const config = getAlertConfigWithNews(league);
  assert.equal(config.id, league);
  assert.ok(config.queries.length > 0);
  assert.ok(Object.keys(config.teams).length > 0);
}

const nfl = getAlertConfigWithNews('nfl');
assert.deepEqual(
  classifyTypes({ title: 'Chiefs confirmed major injury update' }, nfl),
  ['breaking', 'injury']
);
assert.deepEqual(matchTeams({ title: 'Patrick Mahomes and the Kansas City Chiefs' }, nfl), ['chiefs']);

const mlb = getAlertConfigWithNews('mlb');
assert.deepEqual(
  matchTeams({ title: 'Roster update', matched_streams: ['Yankees'] }, mlb),
  ['yankees']
);

const NOW = new Date('2026-08-04T20:00:00Z').getTime();

async function testNflCycle() {
  const sent = [];
  const state = {
    articleIds: new Set(),
    postIds: new Set(),
    transactionIds: new Set(),
  };
  const article = {
    title: 'Chiefs confirm roster move',
    description: 'Kansas City Chiefs make a move.',
    url: 'https://example.com/chiefs-move',
    publishedAt: '2026-08-04T19:30:00Z',
    source: { name: 'Example Sports' },
  };
  const post = {
    post_id: 'nfl-post-1',
    text_preview: 'Kansas City Chiefs breaking update',
    source_url: 'https://x.com/example/status/1',
    created_at: '2026-08-04T19:45:00Z',
    matched_leagues: ['NFL'],
    matched_streams: ['Breaking NFL'],
    author: { display_name: 'Reporter', username: 'reporter', followers_count: 10000 },
    latest_metrics: { likes: 10, reposts: 2, replies: 1, views: 1000 },
  };

  const deps = {
    now: () => NOW,
    webhookUrl: 'https://chat.googleapis.com/mock',
    state,
    requestJSON: async () => ({ status: 200, body: { articles: [article] } }),
    fetchSignalPosts: async () => ({ status: 200, body: { items: [post] } }),
    postToGoogleChat: async (_url, text) => { sent.push(text); return { status: 200, body: '' }; },
  };

  const first = await runAlertCycle(nfl, deps);
  assert.equal(first.alerts_sent, 2);
  assert.equal(sent.length, 2);
  assert.ok(sent[0].includes('Example Sports'));
  assert.ok(sent[1].includes('BREAKING'));

  const second = await runAlertCycle(nfl, deps);
  assert.equal(second.alerts_sent, 0);
}

async function testMlbCycle() {
  const sent = [];
  const state = {
    articleIds: new Set(),
    postIds: new Set(),
    transactionIds: new Set(),
  };
  const article = {
    title: 'Yankees announce roster move',
    description: 'The New York Yankees made a transaction.',
    url: 'https://example.com/yankees-move',
    publishedAt: '2026-08-04T19:50:00Z',
    source: { name: 'Example Baseball' },
  };
  const post = {
    post_id: 'mlb-post-1',
    text_preview: 'Breaking Yankees trade update',
    source_url: 'https://x.com/example/status/2',
    created_at: '2026-08-04T19:55:00Z',
    matched_streams: ['Breaking MLB', 'Yankees'],
    author: { display_name: 'Baseball Reporter', username: 'baseball', followers_count: 25000 },
    latest_metrics: { likes: 20, reposts: 4, replies: 2, views: 2000 },
  };
  const transaction = {
    id: 123,
    transactionType: 'Signed',
    effectiveDate: '2026-08-04',
    description: 'New York Yankees signed RHP Example Player.',
    player: { fullName: 'Example Player' },
    toTeam: { name: 'New York Yankees' },
  };

  const result = await runAlertCycle(mlb, {
    now: () => NOW,
    webhookUrl: 'https://chat.googleapis.com/mock',
    state,
    baseUrl: () => 'https://heavy-newsroom.vercel.app',
    requestJSON: async (hostname) => {
      if (hostname === 'statsapi.mlb.com') {
        return { status: 200, body: { transactions: [transaction] } };
      }
      return { status: 200, body: { articles: [article] } };
    },
    fetchSignalPosts: async () => ({ status: 200, body: { items: [post] } }),
    postToGoogleChat: async (_url, text) => { sent.push(text); return { status: 200, body: '' }; },
  });

  assert.equal(result.alerts_sent, 3);
  assert.equal(sent.length, 3);
  assert.ok(sent.every((message) => message.includes('New York Yankees')));
  assert.equal(Object.hasOwn(result.debug, 'webhook_preview'), false);
}

Promise.resolve()
  .then(testNflCycle)
  .then(testMlbCycle)
  .then(() => console.log('alert engine tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
