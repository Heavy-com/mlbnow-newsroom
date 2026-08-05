'use strict';

const https = require('https');
const {
  ALLOWED_NEWS_QUERIES,
  getFreshCache,
  setBoundedCache,
} = require('./proxy-policy');
const { createSourceError } = require('./source-error');

const REQUEST_TIMEOUT_MS = 8 * 1000;
const CACHE_DURATION_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 24;
const cache = new Map();
const allowedQueries = new Set(ALLOWED_NEWS_QUERIES);

function requestJSON(hostname, path, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const upstream = https.request(
      {
        hostname,
        path,
        method: 'GET',
        timeout: timeoutMs,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'HeavyNewsroom/2.2',
        },
      },
      (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          try {
            resolve({
              status: response.statusCode,
              body: data ? JSON.parse(data) : {},
            });
          } catch (error) {
            reject(createSourceError(
              'newsapi',
              'NewsAPI returned invalid JSON',
              {
                code: 'UPSTREAM_INVALID_JSON',
                status: response.statusCode,
                retryable: true,
              }
            ));
          }
        });
      }
    );

    upstream.on('timeout', () => {
      upstream.destroy(createSourceError(
        'newsapi',
        'NewsAPI request timed out',
        { code: 'UPSTREAM_TIMEOUT', retryable: true }
      ));
    });
    upstream.on('error', reject);
    upstream.end();
  });
}

async function fetchNewsQuery(query, pageSize = 20, deps = {}) {
  if (!allowedQueries.has(query)) {
    throw createSourceError(
      'newsapi',
      'News query is not approved',
      { code: 'NEWS_QUERY_NOT_ALLOWED', retryable: false, query }
    );
  }

  const apiKey = deps.apiKey ?? process.env.NEWS_API_KEY ?? '';
  if (!apiKey) {
    throw createSourceError(
      'newsapi',
      'News integration is not configured',
      { code: 'NEWS_INTEGRATION_UNAVAILABLE', retryable: false, query }
    );
  }

  const safePageSize = Math.max(1, Math.min(20, Number.parseInt(pageSize, 10) || 20));
  const cacheKey = `${query}__${safePageSize}`;
  const now = deps.now ? deps.now() : Date.now();
  const cached = getFreshCache(cache, cacheKey, CACHE_DURATION_MS, now);
  if (cached) return cached.data;

  const from = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const path = [
    '/v2/everything',
    `?q=${encodeURIComponent(query)}`,
    '&language=en',
    '&sortBy=publishedAt',
    `&pageSize=${safePageSize}`,
    `&from=${encodeURIComponent(from)}`,
    `&apiKey=${encodeURIComponent(apiKey)}`,
  ].join('');

  const requester = deps.requestJSON || requestJSON;
  const { status, body } = await requester('newsapi.org', path);

  if (status !== 200 || body?.status !== 'ok' || !Array.isArray(body?.articles)) {
    throw createSourceError(
      'newsapi',
      typeof body?.message === 'string'
        ? body.message.slice(0, 180)
        : 'NewsAPI request failed',
      {
        code: status === 429 ? 'UPSTREAM_RATE_LIMIT' : 'UPSTREAM_FAILURE',
        status,
        retryable: status === 429 || status >= 500,
        query,
      }
    );
  }

  setBoundedCache(
    cache,
    cacheKey,
    { timestamp: now, data: body },
    MAX_CACHE_ENTRIES
  );

  return body;
}

module.exports = {
  fetchNewsQuery,
};
