'use strict';

const { fetchSignalPosts } = require('./signal');
const {
  getFreshCache,
  setBoundedCache,
} = require('./proxy-policy');
const { createSourceError } = require('./source-error');

const CACHE_DURATION_MS = 45 * 1000;
const MAX_CACHE_ENTRIES = 8;
const cache = new Map();

async function fetchSignalFeed(options = {}, deps = {}) {
  const normalized = {
    limit: Math.max(1, Math.min(200, Number.parseInt(options.limit, 10) || 200)),
    metrics: 'latest',
  };
  const cacheKey = JSON.stringify(normalized);
  const now = deps.now ? deps.now() : Date.now();
  const cached = getFreshCache(cache, cacheKey, CACHE_DURATION_MS, now);
  if (cached) return cached.data;

  const fetcher = deps.fetchSignalPosts || fetchSignalPosts;
  let response;

  try {
    response = await fetcher(normalized);
  } catch (error) {
    if (error.code === 'SIGNAL_CREDENTIAL_MISSING') {
      throw createSourceError(
        'signal',
        'Signal integration is not configured',
        {
          code: 'SIGNAL_INTEGRATION_UNAVAILABLE',
          retryable: false,
        }
      );
    }
    throw createSourceError(
      'signal',
      'Signal source request failed',
      {
        code: error.code || 'SIGNAL_UPSTREAM_FAILURE',
        retryable: true,
      }
    );
  }

  if (response.status !== 200 || !Array.isArray(response.body?.items)) {
    throw createSourceError(
      'signal',
      'Signal source request failed',
      {
        code: response.status === 429
          ? 'UPSTREAM_RATE_LIMIT'
          : 'SIGNAL_UPSTREAM_FAILURE',
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
      }
    );
  }

  setBoundedCache(
    cache,
    cacheKey,
    { timestamp: now, data: response.body },
    MAX_CACHE_ENTRIES
  );

  return response.body;
}

module.exports = {
  fetchSignalFeed,
};
