// api/transactions.js — Vercel serverless function
// Fetches real-time MLB transactions from the official MLB Stats API
// No API key required — completely free and public
// Cache: 2 minutes (transactions update frequently throughout the day)

const https = require('https');

const CACHE_DURATION_MS = 2 * 60 * 1000; // 2 minutes
let cache = null;

function today() {
  return new Date().toISOString().split('T')[0];
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function fetchTransactions() {
  return new Promise((resolve, reject) => {
    const start = yesterday();
    const end = today();
    const path = `/api/v1/transactions?startDate=${start}&endDate=${end}&sportId=1`;

    const options = {
      hostname: 'statsapi.mlb.com',
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'HeavyOnMLB/1.0',
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Failed to parse MLB transactions response')); }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Normalize transaction into a clean card-ready object
function normalize(t) {
  const player = t.player?.fullName || 'Unknown Player';
  const fromTeam = t.fromTeam?.name || null;
  const toTeam = t.toTeam?.name || null;
  const type = t.transactionType || 'TRANSACTION';
  const date = t.effectiveDate || t.date || today();
  const description = t.description || buildDescription(type, player, fromTeam, toTeam);

  // Map transaction type to a category
  let category = 'roster';
  const typeLower = type.toLowerCase();
  if (['trade','optional assignment','recall','outrighted','selected','designated'].some(k => typeLower.includes(k))) category = 'trade';
  if (['il','injured','disability'].some(k => typeLower.includes(k))) category = 'injury';
  if (['signed','contract','extension','free agent'].some(k => typeLower.includes(k))) category = 'trade';
  if (['release','released','dfa','designated for assignment'].some(k => typeLower.includes(k))) category = 'trade';

  return {
    _type: 'transaction',
    _category: category,
    id: `txn-${t.id || Math.random()}`,
    player,
    fromTeam,
    toTeam,
    transactionType: type,
    description,
    date,
    fromTeamId: t.fromTeam?.id || null,
    toTeamId: t.toTeam?.id || null,
  };
}

function buildDescription(type, player, fromTeam, toTeam) {
  if (fromTeam && toTeam) return `${player} traded from ${fromTeam} to ${toTeam}`;
  if (fromTeam) return `${fromTeam} ${type.toLowerCase()} ${player}`;
  if (toTeam) return `${toTeam} ${type.toLowerCase()} ${player}`;
  return `${player} — ${type}`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const now = Date.now();

  if (cache && (now - cache.timestamp) < CACHE_DURATION_MS) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache.data);
  }

  try {
    const { status, body } = await fetchTransactions();

    if (status !== 200) {
      return res.status(status).json({ error: 'MLB API error', status });
    }

    const transactions = (body.transactions || [])
      .map(normalize)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const response = { transactions, count: transactions.length, fetchedAt: new Date().toISOString() };

    cache = { timestamp: now, data: response };
    res.setHeader('X-Cache', 'MISS');
    res.status(200).json(response);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
