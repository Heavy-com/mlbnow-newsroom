'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { evaluatePost, loadTriage, rowToPost, summarize } = require('../lib/triage');
const { getAlertConfig } = require('../lib/alert-config');

const NOW = new Date('2026-08-05T20:00:00Z').getTime();
const mlb = getAlertConfig('mlb');

function signalRow(overrides = {}) {
  return {
    id: overrides.id || 'sig-1',
    league: 'mlb',
    source: 'x',
    author_username: overrides.author_username || 'reporter',
    author_display: overrides.author_display || 'Reporter',
    text: overrides.text || '',
    source_url: 'https://x.com/example/status/1',
    created_at: overrides.created_at || '2026-08-05T19:50:00Z',
    collected_at: '2026-08-05T19:51:00Z',
    categories_json: overrides.categories_json || '[{"category":"other"}]',
    latest_metrics_json: overrides.latest_metrics_json || '{"likes":4,"reposts":1,"views":300}',
  };
}

function testRowConversionHandlesBadJson() {
  const post = rowToPost(signalRow({
    text: 'Test post',
    categories_json: 'not json',
    latest_metrics_json: '{{',
  }));
  assert.equal(post.text_preview, 'Test post');
  assert.deepEqual(post.categories, []);
  assert.deepEqual(post.latest_metrics, {});
  assert.equal(post.author.username, 'reporter');
}

function testVerdictsMatchTheAlertGates() {
  const cases = [
    {
      label: 'real injury news for a tracked team',
      row: signalRow({ text: 'Boston Red Sox place Garrett Crochet on the injured list with elbow strain' }),
      expect: 'would_alert',
    },
    {
      label: 'team marketing post',
      row: signalRow({ text: 'Hometown reppin today at the ballpark' }),
      expect: 'no_alert_type',
    },
    {
      label: 'speculation caught before the quality gate',
      row: signalRow({ text: 'Breaking down the New York Yankees trade deadline reaction' }),
      expect: 'no_alert_type',
    },
    {
      label: 'real move wrapped in analysis and promotion',
      row: signalRow({ text: 'New York Yankees acquired a reliever. Full reaction and recap on our podcast' }),
      expect: 'analysis_or_promotion',
    },
    {
      label: 'news about an untracked entity',
      row: signalRow({ text: 'Duke University fired its pitching coach after an injury report' }),
      expect: 'no_team_match',
    },
    {
      label: 'older than the freshness window',
      row: signalRow({
        text: 'Los Angeles Dodgers designated Chuckie Robinson for assignment',
        created_at: '2026-08-05T12:00:00Z',
      }),
      expect: 'stale',
    },
  ];

  for (const { label, row, expect } of cases) {
    const verdict = evaluatePost(rowToPost(row), mlb, NOW).verdict;
    assert.equal(verdict, expect, `${label}: expected ${expect}, got ${verdict}`);
  }
}

function testEvaluationCarriesTriageDetail() {
  const evaluation = evaluatePost(
    rowToPost(signalRow({ text: 'Boston Red Sox place Garrett Crochet on the injured list with elbow strain' })),
    mlb,
    NOW
  );
  assert.equal(evaluation.anchor, 'garrett crochet');
  assert.deepEqual(evaluation.teams, ['redsox']);
  assert.ok(evaluation.types.includes('injury'));
  assert.equal(evaluation.age_minutes, 10);
  assert.equal(evaluation.metrics.likes, 4);
}

function testSummaryCounts() {
  const counts = summarize([
    { verdict: 'alerted' },
    { verdict: 'alerted' },
    { verdict: 'no_alert_type' },
  ]);
  assert.deepEqual(counts, { alerted: 2, no_alert_type: 1 });
}

async function testLoadTriageMarksDeliveredPosts() {
  const queries = [];
  const client = {
    async execute(sql, args) {
      queries.push({ sql, args });
      if (/FROM signals/u.test(sql)) {
        return {
          rows: [
            signalRow({ id: 'sent-1', text: 'Boston Red Sox place Garrett Crochet on the injured list' }),
            signalRow({ id: 'quiet-1', text: 'Lets get it' }),
          ],
        };
      }
      return {
        rows: [
          {
            delivery_key: 'story::garrett crochet::2026-08-05::redsox',
            item_type: 'social',
            item_id: 'sent-1',
            team_id: 'redsox',
            status: 'sent',
            created_at: '2026-08-05T19:52:00Z',
            sent_at: '2026-08-05T19:52:01Z',
            error: null,
          },
        ],
      };
    },
  };

  const payload = await loadTriage(client, mlb, { now: NOW, limit: 50 });

  assert.equal(payload.league, 'mlb');
  assert.equal(payload.signals.length, 2);
  assert.equal(payload.signals[0].verdict, 'alerted', 'delivered posts are marked as alerted');
  assert.equal(payload.signals[1].verdict, 'no_alert_type');
  assert.deepEqual(payload.summary, { alerted: 1, no_alert_type: 1 });
  assert.equal(payload.deliveries.length, 1);
  assert.equal(queries.length, 2);
  assert.equal(queries[0].args[0], 'mlb');
  assert.equal(queries[0].args[1], 50);
}

function testTriagePageFollowsDashboardConventions() {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'public', 'triage.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'public', 'triage.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');

  assert.match(html, /<link rel="stylesheet" href="\/styles\.css">/);
  assert.match(html, /<script src="\/triage\.js"><\/script>/);
  assert.doesNotMatch(html, /<style(?:\s|>)/i);
  assert.doesNotMatch(html, /<script>(?:.|\n)*?<\/script>/i);
  assert.match(css, /\.triage-row\{/);
  assert.match(js, /function loadTriage\(/);
  // User-supplied post text must never be injected raw.
  assert.match(js, /function escapeHtml\(/);
  assert.doesNotMatch(js, /innerHTML\s*=\s*`[^`]*\$\{item\.text\}/);
}

Promise.resolve()
  .then(testRowConversionHandlesBadJson)
  .then(testVerdictsMatchTheAlertGates)
  .then(testEvaluationCarriesTriageDetail)
  .then(testSummaryCounts)
  .then(testLoadTriageMarksDeliveredPosts)
  .then(testTriagePageFollowsDashboardConventions)
  .then(() => console.log('triage tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
