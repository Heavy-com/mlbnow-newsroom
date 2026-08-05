'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  ALLOWED_NEWS_QUERIES,
  getFreshCache,
  normalizeNewsRequest,
  normalizeSignalRequest,
  setBoundedCache,
} = require('../lib/proxy-policy');
const { getAlertConfig } = require('../lib/alert-config');

function params(value) {
  return new URLSearchParams(value);
}

function testNewsPolicy() {
  const allowed = ALLOWED_NEWS_QUERIES[0];
  const accepted = normalizeNewsRequest(
    params({ q: allowed, pageSize: '500', sortBy: 'publishedAt' })
  );

  assert.equal(accepted.ok, true);
  assert.equal(accepted.pageSize, 20);
  assert.equal(normalizeNewsRequest(params({})).code, 'NEWS_QUERY_REQUIRED');
  assert.equal(
    normalizeNewsRequest(params({ q: 'arbitrary expensive search' })).code,
    'NEWS_QUERY_NOT_ALLOWED'
  );
  assert.equal(
    normalizeNewsRequest(params({ q: allowed, sortBy: 'relevancy' })).code,
    'NEWS_SORT_NOT_ALLOWED'
  );
  assert.equal(
    normalizeNewsRequest(params({ q: allowed, apiKey: 'attacker-value' })).code,
    'UNSUPPORTED_QUERY_PARAMETER'
  );
}

function testSignalPolicy() {
  assert.deepEqual(normalizeSignalRequest(params({})), {
    ok: true,
    options: { limit: 200, metrics: 'latest' },
  });

  const clamped = normalizeSignalRequest(
    params({ limit: '999', metrics: 'latest' })
  );
  assert.equal(clamped.options.limit, 200);
  assert.equal(
    normalizeSignalRequest(params({ metrics: 'all' })).code,
    'SIGNAL_METRICS_NOT_ALLOWED'
  );
  assert.equal(
    normalizeSignalRequest(params({ source: 'x' })).code,
    'UNSUPPORTED_QUERY_PARAMETER'
  );
}

function testBoundedCache() {
  const cache = new Map();
  setBoundedCache(cache, 'one', { timestamp: 1 }, 2);
  setBoundedCache(cache, 'two', { timestamp: 2 }, 2);
  setBoundedCache(cache, 'three', { timestamp: 3 }, 2);

  assert.deepEqual([...cache.keys()], ['two', 'three']);
  assert.equal(getFreshCache(cache, 'two', 10, 12), null);
  assert.equal(cache.has('two'), false);
  assert.deepEqual(getFreshCache(cache, 'three', 10, 11), { timestamp: 3 });
}

function testApprovedQueriesStayInSync() {
  const root = path.join(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const queryBlocks = [...app.matchAll(/queries:\s*\[([\s\S]*?)\]/gu)];

  assert.equal(queryBlocks.length, 4);

  const dashboardQueries = queryBlocks.flatMap((match) =>
    [...match[1].matchAll(/'([^']+)'/gu)].map((item) => item[1])
  );

  for (const query of dashboardQueries) {
    assert.ok(
      ALLOWED_NEWS_QUERIES.includes(query),
      `Dashboard query is missing from the server allowlist: ${query}`
    );
  }

  for (const query of getAlertConfig('mlb').queries) {
    assert.ok(
      ALLOWED_NEWS_QUERIES.includes(query),
      `MLB alert query is missing from the server allowlist: ${query}`
    );
  }
}

function testRoutesUseHardeningPolicy() {
  const root = path.join(__dirname, '..');
  const news = fs.readFileSync(path.join(root, 'api', 'news.js'), 'utf8');
  const nocap = fs.readFileSync(path.join(root, 'api', 'nocap.js'), 'utf8');
  const health = fs.readFileSync(path.join(root, 'api', 'health.js'), 'utf8');
  const transactions = fs.readFileSync(
    path.join(root, 'api', 'transactions.js'),
    'utf8'
  );
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

  assert.match(news, /normalizeNewsRequest/u);
  assert.match(news, /MAX_NEWS_CACHE_ENTRIES/u);
  assert.doesNotMatch(news, /'entertainment'/u);

  assert.match(nocap, /normalizeSignalRequest/u);
  assert.match(nocap, /MAX_SIGNAL_CACHE_ENTRIES/u);
  assert.doesNotMatch(nocap, /expected_env/u);
  assert.doesNotMatch(nocap, /credential_mode/u);

  assert.doesNotMatch(health, /signal_auth_mode/u);
  assert.match(health, /alert_delivery/u);

  assert.match(transactions, /status !== 200/u);
  assert.doesNotMatch(transactions, /resolve\(\{\}\)/u);

  assert.doesNotMatch(readme, /source=x&category=/u);
  assert.doesNotMatch(readme, /Assign.*browser-only/u);
}

testNewsPolicy();
testSignalPolicy();
testBoundedCache();
testApprovedQueriesStayInSync();
testRoutesUseHardeningPolicy();

console.log('feed proxy hardening tests passed');
