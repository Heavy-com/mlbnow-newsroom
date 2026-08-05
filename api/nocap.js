'use strict';

const { normalizeSignalRequest } = require('../lib/proxy-policy');
const { fetchSignalFeed } = require('../lib/signal-source');
const { serializeSourceError } = require('../lib/source-error');

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

  try {
    const body = await fetchSignalFeed(request.options);
    setEdgeCache(res);
    return res.status(200).json(body);
  } catch (error) {
    const sourceError = serializeSourceError(error, 'signal');
    const status = sourceError.code === 'SIGNAL_INTEGRATION_UNAVAILABLE'
      ? 503
      : sourceError.status === 429
        ? 503
        : 502;
    return res.status(status).json({
      error: sourceError.message,
      source: sourceError.source,
      code: sourceError.code,
      status: sourceError.status,
      retryable: sourceError.retryable,
    });
  }
};
