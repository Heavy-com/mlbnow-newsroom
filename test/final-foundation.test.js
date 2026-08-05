'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.GNEWS_API_KEY = 'test-key';

const { buildDashboardFeed } = require('../lib/dashboard-feed');
const { createSourceError } = require('../lib/source-error');
const { getAlertConfig } = require('../lib/alert-config');

// Production disables news fetching; tests keep it on to cover that path.
const getAlertConfigWithNews = (id) => ({ ...getAlertConfig(id), includeNews: true });
const {
  createAlertHandler,
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

function responseRecorder() {
  return {
    statusCode: null,
    payload: null,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

async function testCombinedFeedKeepsPartialResults() {
  let newsCalls = 0;
  const result = await buildDashboardFeed('mlb', {
    now: () => NOW,
    fetchNewsQuery: async (query) => {
      newsCalls += 1;
      if (newsCalls === 1) {
        throw createSourceError(
          'newsapi',
          'Temporary news failure',
          { status: 503, retryable: true, query }
        );
      }
      return {
        status: 'ok',
        articles: [{
          title: `Article ${newsCalls}`,
          url: `https://example.com/article-${newsCalls}`,
          publishedAt: '2026-08-04T19:30:00Z',
          source: { name: 'Example' },
        }],
      };
    },
    fetchSignalFeed: async () => ({ items: [] }),
    fetchTransactionsFeed: async () => ({ transactions: [] }),
  });

  assert.equal(result.available, true);
  assert.equal(result.partial, true);
  assert.equal(result.news.length, 3);
  assert.equal(result.source_errors.length, 1);
  assert.equal(result.source_status.news, 'partial');
  assert.equal(result.source_status.signal, 'ok');
  assert.equal(result.source_status.transactions, 'ok');
}

async function testCombinedFeedReportsTotalFailure() {
  const failure = createSourceError(
    'test',
    'Source unavailable',
    { status: 503, retryable: true }
  );

  const result = await buildDashboardFeed('nfl', {
    now: () => NOW,
    fetchNewsQuery: async () => { throw failure; },
    fetchSignalFeed: async () => { throw failure; },
  });

  assert.equal(result.available, false);
  assert.equal(result.partial, true);
  assert.equal(result.successful_sources, 0);
  assert.equal(result.source_status.news, 'error');
  assert.equal(result.source_status.signal, 'error');
  assert.equal(result.source_status.transactions, 'skipped');
}

async function testAlertCycleReportsPartialSourceFailure() {
  const config = getAlertConfigWithNews('nfl');
  let newsCalls = 0;
  const sent = [];

  const result = await runAlertCycle(config, {
    now: () => NOW,
    webhookUrl: 'https://chat.googleapis.com/mock',
    state: emptyState(),
    requestJSON: async () => {
      newsCalls += 1;
      if (newsCalls === 1) {
        return {
          status: 503,
          body: { message: 'Temporary GNews outage' },
        };
      }

      return {
        status: 200,
        body: {
          articles: [{
            title: `NFL confirms roster update ${newsCalls}`,
            description: 'The NFL confirmed a roster update.',
            url: `https://example.com/nfl-${newsCalls}`,
            publishedAt: '2026-08-04T19:30:00Z',
            source: { name: 'Example Sports' },
          }],
        },
      };
    },
    fetchSignalPosts: async () => ({
      status: 200,
      body: { items: [] },
    }),
    postToGoogleChat: async (_url, text) => {
      sent.push(text);
      return { status: 200, body: '' };
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 'degraded');
  assert.equal(result.errors.length, 0);
  assert.equal(result.source_errors.length, 1);
  assert.equal(result.source_errors[0].source, 'gnews');
  assert.equal(result.alerts_sent, 3);
  assert.equal(sent.length, 3);
}

async function testAlertHandlerReturnsBadGatewayForSourceFailure() {
  const originalSecret = process.env.ALERTS_SECRET;
  process.env.ALERTS_SECRET = 'test-secret';

  const handler = createAlertHandler(getAlertConfigWithNews('nfl'), {
    now: () => NOW,
    webhookUrl: 'https://chat.googleapis.com/mock',
    state: emptyState(),
    requestJSON: async () => ({
      status: 503,
      body: { message: 'GNews unavailable' },
    }),
    fetchSignalPosts: async () => ({
      status: 200,
      body: { items: [] },
    }),
    postToGoogleChat: async () => ({ status: 200, body: '' }),
  });

  const req = {
    method: 'GET',
    headers: { authorization: 'Bearer test-secret' },
  };
  const res = responseRecorder();

  try {
    await handler(req, res);
  } finally {
    if (originalSecret === undefined) delete process.env.ALERTS_SECRET;
    else process.env.ALERTS_SECRET = originalSecret;
  }

  assert.equal(res.statusCode, 502);
  assert.equal(res.payload.success, false);
  assert.equal(res.payload.source_errors.length, 4);
}

function testFrontendUsesCombinedEndpoint() {
  const root = path.join(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

  assert.match(app, /\/api\/feed\?league=/u);
  assert.doesNotMatch(app, /fetch\(`\/api\/news/u);
  assert.doesNotMatch(app, /fetch\('\/api\/nocap/u);
  assert.doesNotMatch(app, /TX_ENDPOINTS/u);
  assert.match(app, /Partial ·/u);
}

function testCombinedRouteLoads() {
  const handler = require('../api/feed');
  assert.equal(typeof handler, 'function');
}

(async () => {
  await testCombinedFeedKeepsPartialResults();
  await testCombinedFeedReportsTotalFailure();
  await testAlertCycleReportsPartialSourceFailure();
  await testAlertHandlerReturnsBadGatewayForSourceFailure();
  testFrontendUsesCombinedEndpoint();
  testCombinedRouteLoads();
  console.log('pre-database foundation tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
