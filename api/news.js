'use strict';

const https = require('https');
const {
  getFreshCache,
  normalizeNewsRequest,
  setBoundedCache,
} = require('../lib/proxy-policy');

const API_KEY = process.env.NEWS_API_KEY || '';
const NEWS_CACHE_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8 * 1000;
const MAX_NEWS_CACHE_ENTRIES = 24;
const cache = new Map();

function setEdgeCache(res) {
  res.setHeader(
    'Vercel-CDN-Cache-Control',
    'public, max-age=60, stale-while-revalidate=120'
  );
}

function fetchJSON(hostname, path, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const upstream = https.request(
      {
        hostname,
        path,
        method: 'GET',
        timeout: timeoutMs,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'HeavyNewsroom/2.1',
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
            reject(new Error('NewsAPI returned invalid JSON'));
          }
        });
      }
    );

    upstream.on('timeout', () => {
      upstream.destroy(new Error('NewsAPI request timed out'));
    });
    upstream.on('error', reject);
    upstream.end();
  });
}

function upstreamFailure(res, status, body = {}) {
  return res.status(status === 429 ? 503 : 502).json({
    error: 'News source request failed',
    source: 'newsapi',
    upstream_status: status || null,
    retryable: status === 429 || status >= 500,
    detail: typeof body.message === 'string' ? body.message.slice(0, 180) : undefined,
  });
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
  const request = normalizeNewsRequest(url.searchParams);
  if (!request.ok) {
    return res.status(request.status).json({
      error: request.error,
      code: request.code,
    });
  }

  if (!API_KEY) {
    return res.status(503).json({
      error: 'News integration is not configured',
      code: 'NEWS_INTEGRATION_UNAVAILABLE',
    });
  }

  const cacheKey = `${request.query}__${request.pageSize}`;
  const now = Date.now();
  const cached = getFreshCache(cache, cacheKey, NEWS_CACHE_MS, now);

  if (cached) {
    setEdgeCache(res);
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cached.data);
  }

  try {
    const from = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const path = [
      '/v2/everything',
      `?q=${encodeURIComponent(request.query)}`,
      '&language=en',
      '&sortBy=publishedAt',
      `&pageSize=${request.pageSize}`,
      `&from=${encodeURIComponent(from)}`,
      `&apiKey=${encodeURIComponent(API_KEY)}`,
    ].join('');

    const { status, body } = await fetchJSON('newsapi.org', path);
    if (status !== 200 || body.status !== 'ok' || !Array.isArray(body.articles)) {
      res.setHeader('X-Cache', 'MISS');
      return upstreamFailure(res, status, body);
    }

    setBoundedCache(
      cache,
      cacheKey,
      { timestamp: now, data: body },
      MAX_NEWS_CACHE_ENTRIES
    );

    setEdgeCache(res);
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(body);
  } catch (error) {
    return res.status(502).json({
      error: 'News source request failed',
      source: 'newsapi',
      retryable: true,
      detail: error.message,
    });
  }
};
