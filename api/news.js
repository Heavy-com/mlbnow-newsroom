'use strict';

const { normalizeNewsRequest } = require('../lib/proxy-policy');
const { fetchNewsQuery } = require('../lib/news-source');
const { serializeSourceError } = require('../lib/source-error');

function setEdgeCache(res) {
  res.setHeader(
    'Vercel-CDN-Cache-Control',
    'public, max-age=60, stale-while-revalidate=120'
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
  const request = normalizeNewsRequest(url.searchParams);
  if (!request.ok) {
    return res.status(request.status).json({
      error: request.error,
      code: request.code,
    });
  }

  try {
    const body = await fetchNewsQuery(request.query, request.pageSize);
    setEdgeCache(res);
    return res.status(200).json(body);
  } catch (error) {
    const sourceError = serializeSourceError(error, 'newsapi');
    const status = sourceError.code === 'NEWS_INTEGRATION_UNAVAILABLE'
      ? 503
      : sourceError.status === 429
        ? 503
        : 502;
    return res.status(status).json({
      error: 'News source request failed',
      ...sourceError,
    });
  }
};
