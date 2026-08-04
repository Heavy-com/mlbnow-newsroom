'use strict';

const assert = require('node:assert/strict');
const { normalizeSignalPost } = require('../lib/signal');

const post = normalizeSignalPost({
  id: 'abc-123',
  source: 'x',
  source_post_id: '999',
  author_username: 'JeffPassan',
  text: 'MLB breaking trade update',
  created_at: '2026-08-03T20:00:00Z',
  categories: [{ category: 'breaking_news', confidence: '0.95' }],
  metrics: [{
    captured_at: '2026-08-03T20:05:00Z',
    like_count: 450,
    repost_count: 80,
    reply_count: 20,
    view_count: 25000,
  }],
});

assert.equal(post.post_id, 'abc-123');
assert.equal(post.text_preview, 'MLB breaking trade update');
assert.equal(post.author.username, 'JeffPassan');
assert.equal(post.latest_metrics.likes, 450);
assert.equal(post.latest_metrics.views, 25000);
assert.ok(post.matched_streams.includes('breaking_news'));
assert.ok(post.matched_leagues.includes('MLB'));
assert.equal(post.source_url, 'https://x.com/JeffPassan/status/999');

console.log('signal adapter tests passed');
