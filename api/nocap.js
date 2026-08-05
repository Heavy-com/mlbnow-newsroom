'use strict';

const { fetchSignalPosts } = require('../lib/signal');
const {
  getFreshCache,
  normalizeSignalRequest,
  setBoundedCache,
} = require('../lib/proxy-policy');

const CACHE_DURATION_MS = 45 * 1000;
const MAX_SIGNAL_CACHE_ENTRIES = 8;
const cache = new Map();

function setEdgeCache(res) {
  res.setHeader(
    'Vercel-CDN-Cache-Control',
    'public, max-age=30, stale-while-revalidate=60'
  );
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = new URL(req.url, 'https://heavy-newsroom.local');
  const request = normalizeSignalRequest(url.searchParams);
  if (!request.ok) {
    return res.status(request.status).json({
      error: request.error,
      code: request.code,
    });
  }

  const cacheKey = JSON.stringify(request.options);
  const now = Date.now();
  const cached = getFreshCache(cache, cacheKey, CACHE_DURATION_MS, now);

  if (cached) {
    setEdgeCache(res);
    res.setHeader('X-Cache', 'HIT');
    res.setHeader(
      'X-Cache-Age',
      `${Math.floor((now - cached.timestamp) / 1000)}s`
    );
    return res.status(200).json(cached.data);
  }

  try {
    const { status, body } = await fetchSignalPosts(request.options);
    if (status !== 200 || !Array.isArray(body.items)) {
      res.setHeader('X-Cache', 'MISS');
      return res.status(status === 429 ? 503 : 502).json({
        error: 'Signal source request failed',
        source: 'signal',
        upstream_status: status || null,
        retryable: status === 429 || status >= 500,
      });
    }

    setBoundedCache(
      cache,
      cacheKey,
      { timestamp: now, data: body },
      MAX_SIGNAL_CACHE_ENTRIES
    );

    setEdgeCache(res);
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(body);
  } catch (error) {
    const missingCredential = error.code === 'SIGNAL_CREDENTIAL_MISSING';
    return res.status(missingCredential ? 503 : 502).json({
      error: missingCredential
        ? 'Signal integration is not configured'
        : 'Signal source request failed',
      source: 'signal',
      retryable: !missingCredential,
      code: missingCredential
        ? 'SIGNAL_INTEGRATION_UNAVAILABLE'
        : 'SIGNAL_UPSTREAM_FAILURE',
    });
  }
};
