'use strict';

const { createTursoClient, isTursoConfigured } = require('../lib/turso');
const { getAlertConfig } = require('../lib/alert-config');
const { loadTriage } = require('../lib/triage');

const LEAGUES = new Set(['mlb', 'nfl', 'nba', 'nhl']);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isTursoConfigured()) {
    return res.status(503).json({
      error: 'Durable alert state is not configured',
      detail: 'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to enable triage.',
    });
  }

  const url = new URL(req.url, 'https://heavy-newsroom.local');
  const league = (url.searchParams.get('league') || 'mlb').toLowerCase();
  const limit = Number(url.searchParams.get('limit') || 100);

  if (!LEAGUES.has(league)) {
    return res.status(400).json({ error: 'Unknown league' });
  }

  try {
    const client = createTursoClient();
    const payload = await loadTriage(client, getAlertConfig(league), { limit });
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(502).json({
      error: 'Triage query failed',
      detail: String(error.message || error).slice(0, 200),
    });
  }
};
