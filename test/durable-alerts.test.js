'use strict';

const assert = require('node:assert/strict');
process.env.GNEWS_API_KEY = 'test-key';
const { runAlertCycle, createAlertHandler } = require('../lib/alert-engine');
const { getAlertConfig } = require('../lib/alert-config');
const { createMemoryStore, createTursoStore } = require('../lib/alert-store');

const NOW = new Date('2026-08-04T20:00:00Z').getTime();
const nfl = getAlertConfig('nfl');

// ---------- store-level ----------

async function testMemoryStoreKeepsLegacySemantics() {
  const state = { articleIds: new Set(), postIds: new Set(), transactionIds: new Set() };
  const store = createMemoryStore(state);
  const meta = { itemType: 'social' };

  assert.equal(store.mode, 'memory');
  assert.equal(await store.claim('p1', meta), true);
  // Legacy behavior: nothing recorded until the send succeeds.
  assert.equal(await store.claim('p1', meta), true);
  await store.markSent('p1', null, meta);
  assert.equal(await store.claim('p1', meta), false);
  assert.ok(state.postIds.has('p1'));

  for (let i = 0; i < 501; i += 1) state.postIds.add(`fill-${i}`);
  store.trim();
  assert.equal(state.postIds.size, 200);
}

function fakeClient(program = {}) {
  const calls = { execute: [], batchSizes: [] };
  return {
    calls,
    client: {
      async execute(sql, args) {
        calls.execute.push({ sql, args });
        return program.execute ? program.execute(sql, args) : { rows: [], rowsAffected: 0 };
      },
      async batch(statements) {
        calls.batchSizes.push(statements.length);
        return statements.map(() => ({ rows: [], rowsAffected: 1 }));
      },
    },
  };
}

async function testTursoClaimIsTheDedupeGate() {
  const won = fakeClient({ execute: () => ({ rows: [{ delivery_key: 'k1' }] }) });
  const store = createTursoStore({ client: won.client });
  assert.equal(store.mode, 'turso');

  const claimed = await store.claim(
    'k1',
    { league: 'nfl', itemType: 'social', itemId: 'p9', teamId: null },
    '2026-08-04T20:00:00Z',
    '2026-08-04T19:50:00Z'
  );
  assert.equal(claimed, true);
  assert.match(won.calls.execute[0].sql, /ON CONFLICT\(delivery_key\)/u);
  assert.match(won.calls.execute[0].sql, /RETURNING delivery_key/u);

  const lost = fakeClient({ execute: () => ({ rows: [] }) });
  const lostStore = createTursoStore({ client: lost.client });
  assert.equal(
    await lostStore.claim('k1', { league: 'nfl', itemType: 'social', itemId: 'p9' }, 'now', 'stale'),
    false
  );
}

async function testSignalUpsertChunks() {
  const { calls, client } = fakeClient();
  const store = createTursoStore({ client });
  const posts = Array.from({ length: 85 }, (_, i) => ({
    id: `post-${i}`,
    text_preview: `Post ${i}`,
    author: { username: 'reporter', display_name: 'Reporter' },
  }));
  assert.equal(await store.upsertSignals('nfl', posts, 'now'), 85);
  assert.deepEqual(calls.batchSizes, [15, 15, 15, 15, 15, 10]);
}

// ---------- engine-level ----------

function post(id) {
  return {
    id,
    post_id: id,
    text_preview: `Kansas City Chiefs breaking update ${id}`,
    source_url: `https://x.com/example/status/${id}`,
    created_at: '2026-08-04T19:45:00Z',
    collected_at: '2026-08-04T19:50:00Z',
    matched_leagues: ['NFL'],
    matched_streams: ['Breaking NFL'],
    author: { display_name: 'Reporter', username: 'reporter', followers_count: 10000 },
    latest_metrics: { likes: 10, reposts: 2, replies: 1, views: 1000 },
  };
}

function fakeStore(overrides = {}) {
  const calls = { claim: [], markSent: [], release: [], upsert: [] };
  return {
    calls,
    store: {
      mode: 'turso',
      async claim(key, meta) {
        calls.claim.push({ key, meta });
        return overrides.claim ? overrides.claim(key) : true;
      },
      async isDelivered(key) {
        return overrides.delivered ? overrides.delivered(key) : false;
      },
      async markSent(key) { calls.markSent.push(key); },
      async release(key, error) { calls.release.push({ key, error }); },
      async upsertSignals(_l, posts) { calls.upsert.push(posts.length); return posts.length; },
    },
  };
}

function deps(store, sent, items) {
  return {
    now: () => NOW,
    webhookUrl: 'https://chat.googleapis.com/mock',
    store,
    requestJSON: async () => ({ status: 200, body: { articles: [] } }),
    fetchSignalPosts: async () => ({ status: 200, body: { items } }),
    postToGoogleChat: async (_url, text) => {
      sent.push(text);
      return { status: 200, body: '' };
    },
  };
}

async function testClaimBlocksDuplicateSends() {
  const { calls, store } = fakeStore({ claim: (key) => key !== 'p2' });
  const sent = [];
  const result = await runAlertCycle(nfl, deps(store, sent, [post('p1'), post('p2')]));

  assert.equal(calls.claim.length, 2);
  assert.equal(result.alerts_sent, 1);
  assert.equal(sent.length, 1);
  assert.deepEqual(calls.markSent, ['p1']);
  assert.equal(result.errors.length, 0);
  assert.equal(result.debug.store_mode, 'turso');
  assert.deepEqual(calls.upsert, [2]);
}

async function testFailedSendReleasesTheClaim() {
  const { calls, store } = fakeStore();
  const sent = [];
  const d = deps(store, sent, [post('p1')]);
  d.postToGoogleChat = async () => ({ status: 429, body: 'RESOURCE_EXHAUSTED' });

  const result = await runAlertCycle(nfl, d);

  assert.equal(result.alerts_sent, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(calls.release.length, 1);
  assert.equal(calls.release[0].key, 'p1');
  assert.equal(calls.markSent.length, 0);
}

async function testSendsArePacedApart() {
  const { store } = fakeStore();
  const stamps = [];
  const d = deps(store, [], [post('p1'), post('p2')]);
  d.postToGoogleChat = async () => {
    stamps.push(Date.now());
    return { status: 200, body: '' };
  };

  await runAlertCycle(nfl, d);

  assert.equal(stamps.length, 2);
  assert.ok(
    stamps[1] - stamps[0] >= 1000,
    `expected >=1000ms between sends, saw ${stamps[1] - stamps[0]}ms`
  );
}

async function testCycleSendCapDefersRatherThanClaims() {
  const { calls, store } = fakeStore();
  const sent = [];
  const many = Array.from({ length: 23 }, (_, i) => post(`p${i}`));
  const d = deps(store, sent, many);
  d.postToGoogleChat = async (_url, text) => { sent.push(text); return { status: 200, body: '' }; };

  const result = await runAlertCycle(nfl, d);

  assert.equal(result.alerts_sent, 20);
  assert.equal(calls.claim.length, 20, 'deferred alerts must not be claimed');
  assert.equal(result.debug.deferred_to_next_cycle, 3);
}

async function testDryRunWritesNothing() {
  const { calls, store } = fakeStore();
  const sent = [];
  const d = deps(store, sent, [post('p1')]);
  d.dryRun = true;

  const result = await runAlertCycle(nfl, d);

  assert.equal(result.alerts_sent, 0);
  assert.equal(sent.length, 0);
  assert.equal(calls.claim.length, 0);
  assert.equal(calls.markSent.length, 0);
  assert.equal(calls.upsert.length, 0);
  assert.equal(result.debug.dry_run, true);
  assert.equal(result.debug.would_fire.length, 1);
  assert.equal(result.debug.would_fire[0].key, 'p1');
}

async function testHandlerReadsDryRunFromQuery() {
  const original = process.env.ALERTS_SECRET;
  process.env.ALERTS_SECRET = 'test-secret';
  const { calls, store } = fakeStore();
  const sent = [];
  const handler = createAlertHandler(nfl, deps(store, sent, [post('p1')]));
  const res = {
    statusCode: null,
    payload: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };

  try {
    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer test-secret' },
      url: '/api/nfl-alerts?dryRun=1',
    }, res);
  } finally {
    if (original === undefined) delete process.env.ALERTS_SECRET;
    else process.env.ALERTS_SECRET = original;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.debug.dry_run, true);
  assert.equal(calls.claim.length, 0);
  assert.equal(sent.length, 0);
}

async function testMemoryModeStillWorksWithoutTurso() {
  const state = { articleIds: new Set(), postIds: new Set(), transactionIds: new Set() };
  const sent = [];
  const result = await runAlertCycle(nfl, {
    now: () => NOW,
    webhookUrl: 'https://chat.googleapis.com/mock',
    state,
    requestJSON: async () => ({ status: 200, body: { articles: [] } }),
    fetchSignalPosts: async () => ({ status: 200, body: { items: [post('p1')] } }),
    postToGoogleChat: async (_url, text) => { sent.push(text); return { status: 200, body: '' }; },
  });

  assert.equal(result.debug.store_mode, 'memory');
  assert.equal(result.alerts_sent, 1);
  assert.ok(state.postIds.has('p1'));
}

Promise.resolve()
  .then(testMemoryStoreKeepsLegacySemantics)
  .then(testTursoClaimIsTheDedupeGate)
  .then(testSignalUpsertChunks)
  .then(testClaimBlocksDuplicateSends)
  .then(testFailedSendReleasesTheClaim)
  .then(testSendsArePacedApart)
  .then(testCycleSendCapDefersRatherThanClaims)
  .then(testDryRunWritesNothing)
  .then(testHandlerReadsDryRunFromQuery)
  .then(testMemoryModeStillWorksWithoutTurso)
  .then(() => console.log('durable alert tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
