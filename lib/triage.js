'use strict';

// Replays the alert decision for stored Signal posts so the dashboard can show
// not just what fired, but what did not and why. Nothing here sends anything;
// it reads the `signals` and `alert_deliveries` tables written by the alert
// engine and re-runs the same classification against them.

const {
  classifyTypes,
  matchTeams,
  matchTeamsFromText,
  shouldAlertMlbSocialPost,
  storyAnchor,
} = require('./alert-engine');

const REASON_LABELS = {
  alerted: 'Alerted',
  would_alert: 'Would alert',
  stale: 'Older than the freshness window',
  no_alert_type: 'No breaking, trade, or injury signal',
  non_breaking_usage: 'Uses "breaking" in a non-news sense',
  trade_discussion: 'Trade speculation, not a completed move',
  analysis_or_promotion: 'Analysis, recap, or promotion',
  no_team_match: 'No tracked team mentioned',
};

// Rebuild the post shape the classifier expects from a stored signals row.
function rowToPost(row) {
  let categories = [];
  let metrics = {};
  try {
    categories = JSON.parse(row.categories_json || '[]');
  } catch (error) { /* stored malformed; treat as none */ }
  try {
    metrics = JSON.parse(row.latest_metrics_json || '{}');
  } catch (error) { /* stored malformed; treat as none */ }

  return {
    id: row.id,
    post_id: row.id,
    text_preview: row.text || '',
    source_url: row.source_url || '',
    created_at: row.created_at,
    collected_at: row.collected_at,
    categories,
    latest_metrics: metrics,
    author: {
      username: row.author_username || '',
      display_name: row.author_display || row.author_username || '',
    },
  };
}

function ageMinutes(post, now) {
  const created = new Date(post.created_at).getTime();
  if (Number.isNaN(created)) return null;
  return Math.round((now - created) / 60000);
}

// Mirrors the gates in runAlertCycle, in the same order.
function evaluatePost(post, config, now) {
  const types = classifyTypes(post, config);
  const age = ageMinutes(post, now);
  const anchor = storyAnchor(post.text_preview, config);

  const base = {
    id: post.id,
    text: post.text_preview,
    author: post.author.username,
    author_display: post.author.display_name,
    url: post.source_url,
    created_at: post.created_at,
    age_minutes: age,
    types,
    anchor,
    categories: (post.categories || [])
      .map((entry) => (typeof entry === 'string' ? entry : entry?.category))
      .filter(Boolean),
    metrics: post.latest_metrics || {},
  };

  if (age === null || age * 60000 > config.freshnessMs) {
    return { ...base, verdict: 'stale', teams: [] };
  }

  if (!types.length) {
    return { ...base, verdict: 'no_alert_type', teams: [] };
  }

  const quality = shouldAlertMlbSocialPost(post, types);
  if (!quality.alert) {
    return { ...base, verdict: quality.reason, teams: [] };
  }

  const teams = config.teamScoped
    ? matchTeams(post, config)
    : matchTeamsFromText(`${post.text_preview} ${post.author.display_name}`.toLowerCase(), config);

  if (!teams.length) {
    return { ...base, verdict: 'no_team_match', teams: [] };
  }

  return { ...base, verdict: 'would_alert', teams };
}

function summarize(evaluations) {
  const counts = {};
  for (const item of evaluations) {
    counts[item.verdict] = (counts[item.verdict] || 0) + 1;
  }
  return counts;
}

async function loadTriage(client, config, options = {}) {
  const limit = Math.min(Number(options.limit) || 100, 300);
  const now = options.now || Date.now();

  const signalsResult = await client.execute(
    `SELECT id, league, source, author_username, author_display, text, source_url,
            created_at, collected_at, categories_json, latest_metrics_json
     FROM signals
     WHERE league = ?
     ORDER BY collected_at DESC
     LIMIT ?`,
    [config.id, limit]
  );

  const deliveriesResult = await client.execute(
    `SELECT delivery_key, item_type, item_id, team_id, status, created_at, sent_at, error
     FROM alert_deliveries
     WHERE league = ?
     ORDER BY created_at DESC
     LIMIT 100`,
    [config.id]
  );

  const sentItemIds = new Set(
    deliveriesResult.rows
      .filter((row) => row.status === 'sent')
      .map((row) => String(row.item_id))
  );

  const posts = signalsResult.rows.map(rowToPost);
  const evaluations = posts.map((post) => {
    const evaluation = evaluatePost(post, config, now);
    if (sentItemIds.has(String(post.id))) {
      return { ...evaluation, verdict: 'alerted' };
    }
    return evaluation;
  });

  return {
    league: config.id,
    generated_at: new Date(now).toISOString(),
    summary: summarize(evaluations),
    reason_labels: REASON_LABELS,
    signals: evaluations,
    deliveries: deliveriesResult.rows,
  };
}

module.exports = {
  REASON_LABELS,
  evaluatePost,
  loadTriage,
  rowToPost,
  summarize,
};
