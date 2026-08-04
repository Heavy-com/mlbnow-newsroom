'use strict';

const https = require('https');

const SIGNAL_HOST = 'signal.nocap.lv';
const DEFAULT_LIMIT = 200;
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

function envValue(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function getSignalCredentials() {
  const explicitToken = envValue(
    'SIGNAL_API_TOKEN',
    'SIGNALIZACIJA_API_TOKEN',
    'signal_api_token'
  );
  const nocapValue = envValue('NOCAP_SESSION', 'nocap_Session', 'nocap_session');

  if (explicitToken) return { mode: 'bearer', value: explicitToken };
  if (nocapValue.startsWith('sig_')) return { mode: 'bearer', value: nocapValue };
  if (nocapValue) return { mode: 'legacy_session', value: nocapValue };
  return { mode: 'missing', value: '' };
}

function requestJSON(hostname, path, headers = {}, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'HeavyNewsroom/2.0',
        ...headers,
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let body = {};
        try {
          body = data ? JSON.parse(data) : {};
        } catch (error) {
          return reject(new Error(`Signal returned invalid JSON (${res.statusCode}): ${data.slice(0, 180)}`));
        }
        resolve({ status: res.statusCode, body });
      });
    });

    req.on('timeout', () => req.destroy(new Error('Signal request timed out')));
    req.on('error', reject);
    req.end();
  });
}

function categoryNames(post) {
  const categories = Array.isArray(post.categories) ? post.categories : [];
  return categories
    .map((entry) => typeof entry === 'string' ? entry : entry && entry.category)
    .filter(Boolean);
}

function latestMetric(metrics) {
  if (!Array.isArray(metrics) || !metrics.length) return {};
  return [...metrics].sort((a, b) => {
    const left = new Date(a.captured_at || 0).getTime();
    const right = new Date(b.captured_at || 0).getTime();
    return right - left;
  })[0] || {};
}

function inferLeagues(post, categories) {
  const existing = [
    ...(Array.isArray(post.matched_leagues) ? post.matched_leagues : []),
    ...(Array.isArray(post.leagues) ? post.leagues : []),
  ].map(String);
  const haystack = `${categories.join(' ')} ${post.text || post.text_preview || ''}`.toLowerCase();
  const inferred = [];

  if (/\bmlb\b|major league baseball|baseball/.test(haystack)) inferred.push('MLB');
  if (/\bnfl\b|national football league|football/.test(haystack)) inferred.push('NFL');
  if (/\bnba\b|national basketball association|basketball/.test(haystack)) inferred.push('NBA');
  if (/\bnhl\b|national hockey league|hockey/.test(haystack)) inferred.push('NHL');

  return [...new Set([...existing, ...inferred].map((value) => value.toUpperCase()))];
}

function buildSourceUrl(post, username) {
  if (post.source_url) return post.source_url;
  if (post.url) return post.url;
  const source = String(post.source || '').toLowerCase();
  const sourcePostId = post.source_post_id || post.post_id;
  if (source === 'x' && username && sourcePostId) {
    return `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(sourcePostId)}`;
  }
  if (source === 'instagram' && sourcePostId) {
    return `https://www.instagram.com/p/${encodeURIComponent(sourcePostId)}/`;
  }
  return '';
}

function normalizeSignalPost(post) {
  const categories = categoryNames(post);
  const metric = post.latest_metrics || latestMetric(post.metrics);
  const username = post.author_username || post.author?.username || '';
  const displayName = post.author_display_name || post.author?.display_name || username || 'Unknown';
  const id = post.id || post.post_id || post.source_post_id;
  const source = String(post.source || 'x').toLowerCase();
  const text = post.text || post.text_preview || '';

  return {
    ...post,
    id,
    post_id: id,
    source,
    source_post_id: post.source_post_id || post.post_id || id,
    source_url: buildSourceUrl(post, username),
    text,
    text_preview: text,
    created_at: post.created_at,
    collected_at: post.collected_at || post.created_at,
    author: {
      ...(post.author || {}),
      username,
      display_name: displayName,
      followers_count: post.author_followers_count || post.author?.followers_count || null,
    },
    categories: Array.isArray(post.categories) ? post.categories : [],
    matched_streams: [...new Set([
      ...(Array.isArray(post.matched_streams) ? post.matched_streams : []),
      ...categories,
    ])],
    matched_leagues: inferLeagues(post, categories),
    latest_metrics: {
      captured_at: metric.captured_at || null,
      likes: metric.likes ?? metric.like_count ?? 0,
      reposts: metric.reposts ?? metric.repost_count ?? 0,
      replies: metric.replies ?? metric.reply_count ?? 0,
      quotes: metric.quotes ?? metric.quote_count ?? 0,
      views: metric.views ?? metric.view_count ?? 0,
      bookmarks: metric.bookmarks ?? metric.bookmark_count ?? 0,
    },
  };
}

function clampLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(200, parsed));
}

async function fetchSignalPosts(options = {}) {
  const credentials = getSignalCredentials();
  if (credentials.mode === 'missing') {
    const error = new Error('Signal credential is not configured');
    error.code = 'SIGNAL_CREDENTIAL_MISSING';
    throw error;
  }

  let response;
  if (credentials.mode === 'bearer') {
    const params = new URLSearchParams();
    params.set('limit', String(clampLimit(options.limit)));
    params.set('metrics', ['latest', 'all', 'none'].includes(options.metrics) ? options.metrics : 'latest');

    const createdAfter = options.created_after || options.createdAfter || new Date(Date.now() - DEFAULT_WINDOW_MS).toISOString();
    if (createdAfter) params.set('created_after', createdAfter);

    const passthrough = {
      source: options.source,
      category: options.category,
      author: options.author,
      search: options.search,
      created_before: options.created_before || options.createdBefore,
      collected_after: options.collected_after || options.collectedAfter,
      metric_limit: options.metric_limit || options.metricLimit,
      cursor: options.cursor,
    };
    for (const [key, value] of Object.entries(passthrough)) {
      if (value !== undefined && value !== null && String(value) !== '') params.set(key, String(value));
    }

    response = await requestJSON(
      SIGNAL_HOST,
      `/api/v1/external/posts?${params.toString()}`,
      { Authorization: `Bearer ${credentials.value}` }
    );
  } else {
    const params = new URLSearchParams({
      limit: String(Math.min(clampLimit(options.limit), 50)),
      time_range: '24h',
      sort: 'recency',
      include_low_trust: 'true',
      include_blocked: 'false',
    });
    response = await requestJSON(
      SIGNAL_HOST,
      `/api/v1/feeds/live?${params.toString()}`,
      { Cookie: `signalizacija_session=${credentials.value}` }
    );
  }

  const items = Array.isArray(response.body?.items)
    ? response.body.items.map(normalizeSignalPost).filter((post) => post.id)
    : [];

  return {
    status: response.status,
    body: {
      ...response.body,
      items,
      auth_mode: credentials.mode,
    },
  };
}

module.exports = {
  fetchSignalPosts,
  getSignalCredentials,
  normalizeSignalPost,
};
