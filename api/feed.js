'use strict';

const { buildDashboardFeed } = require('../lib/dashboard-feed');

const ALLOWED_PARAMS = new Set(['league']);

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
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_PARAMS.has(key)) {
      return res.status(400).json({
        error: `Unsupported feed query parameter: ${key}`,
        code: 'UNSUPPORTED_QUERY_PARAMETER',
      });
    }
  }

  const league = String(url.searchParams.get('league') || '').toLowerCase();
  if (!['mlb', 'nfl', 'nba', 'nhl'].includes(league)) {
    return res.status(400).json({
      error: 'league must be one of: mlb, nfl, nba, nhl',
      code: 'LEAGUE_NOT_ALLOWED',
    });
  }

  try {
    const result = await buildDashboardFeed(league);
    if (!result.available) {
      return res.status(502).json({
        error: 'All dashboard feed sources failed',
        ...result,
      });
    }

    if (!result.partial) setEdgeCache(res);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      error: 'Dashboard feed could not be assembled',
      code: error.code || 'FEED_BUILD_FAILURE',
    });
  }
};
