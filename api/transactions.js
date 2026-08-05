'use strict';

const { fetchTransactionsFeed } = require('../lib/transactions-source');
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
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = await fetchTransactionsFeed();
    setEdgeCache(res);
    return res.status(200).json(body);
  } catch (error) {
    const sourceError = serializeSourceError(error, 'mlb_transactions');
    return res.status(sourceError.status === 429 ? 503 : 502).json({
      error: sourceError.message,
      source: sourceError.source,
      code: sourceError.code,
      status: sourceError.status,
      retryable: sourceError.retryable,
    });
  }
};
