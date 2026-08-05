'use strict';

const assert = require('node:assert/strict');

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
    end() {
      return this;
    },
  };
}

const ENV_KEYS = [
  'SIGNAL_API_TOKEN',
  'NOCAP_SESSION',
  'NEWS_API_KEY',
  'GNEWS_API_KEY',
  'ALERTS_SECRET',
  'CRON_SECRET',
  'GCHAT_MLB',
  'GCHAT_NFL',
  'GCHAT_NBA',
  'GCHAT_NHL',
];

async function testConfiguredHealthIsHonestAboutScope() {
  const original = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]])
  );

  process.env.SIGNAL_API_TOKEN = 'sig_live_test';
  delete process.env.NOCAP_SESSION;
  process.env.NEWS_API_KEY = 'news-test';
  process.env.GNEWS_API_KEY = 'gnews-test';
  process.env.ALERTS_SECRET = 'alerts-test';
  delete process.env.CRON_SECRET;
  process.env.GCHAT_MLB = 'https://chat.example/mlb';
  process.env.GCHAT_NFL = 'https://chat.example/nfl';
  process.env.GCHAT_NBA = 'https://chat.example/nba';
  process.env.GCHAT_NHL = 'https://chat.example/nhl';

  const handlerPath = require.resolve('../api/health');
  delete require.cache[handlerPath];
  const handler = require('../api/health');
  const res = responseRecorder();

  try {
    await handler({ method: 'GET' }, res);
  } finally {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    delete require.cache[handlerPath];
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.status, 'configured');
  assert.equal(res.payload.check_scope, 'configuration_only');
  assert.equal(res.payload.live_dependencies_checked, false);
  assert.equal(res.payload.components.dashboard_feeds, true);
  assert.equal(res.payload.components.optional_newsapi, true);
  assert.match(res.payload.warnings[0], /Configuration-only check/u);
}

(async () => {
  await testConfiguredHealthIsHonestAboutScope();
  console.log('Health semantics tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
