// api/news.js — Vercel serverless function
// Handles both /api/news (NewsAPI proxy) and /api/transactions (MLB Stats API)
// Cache: 15 min for news, 2 min for transactions

const https = require('https');

const API_KEY = process.env.NEWS_API_KEY || 'eba3bb2993124fb0b3c1117f7535afc2';
const NEWS_CACHE_MS = 15 * 60 * 1000;
const TX_CACHE_MS   =  2 * 60 * 1000;

const cache = {};

function fetchJSON(hostname, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: 'GET', headers: { 'Accept': 'application/json', 'User-Agent': 'HeavyOnMLB/1.0', ...headers } },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch (e) { reject(new Error('JSON parse error')); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function today()     { return new Date().toISOString().split('T')[0]; }
function yesterday() { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().split('T')[0]; }

function normalizeTransaction(t) {
  const type = (t.transactionType || '').toLowerCase();
  let category = 'roster';
  if (['trade','optional','recall','outrighted','selected','designated','dfa','release','signed','free agent','contract','extension','waiver'].some(k => type.includes(k))) category = 'trade';
  if (['il','injur','disability'].some(k => type.includes(k))) category = 'injury';
  return {
    _type: 'transaction',
    _category: category,
    id: `txn-${t.id || Math.random()}`,
    player: t.player?.fullName || 'Unknown Player',
    fromTeam: t.fromTeam?.name || null,
    toTeam: t.toTeam?.name || null,
    transactionType: t.transactionType || 'Transaction',
    description: t.description || `${t.player?.fullName} — ${t.transactionType}`,
    date: t.effectiveDate || t.date || today(),
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const url = require('url').parse(req.url, true);
  const isTransactions = url.pathname === '/api/transactions';
  const now = Date.now();

  // ── TRANSACTIONS ────────────────────────────────────────────────────────────
  if (isTransactions) {
    const key = 'transactions';
    if (cache[key] && (now - cache[key].timestamp) < TX_CACHE_MS) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cache[key].data);
    }
    try {
      const path = `/api/v1/transactions?startDate=${yesterday()}&endDate=${today()}&sportId=1`;
      const { status, body } = await fetchJSON('statsapi.mlb.com', path);
      if (status !== 200) return res.status(status).json({ error: 'MLB API error' });
      const transactions = (body.transactions || []).map(normalizeTransaction)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      const data = { transactions, count: transactions.length, fetchedAt: new Date().toISOString() };
      cache[key] = { timestamp: now, data };
      res.setHeader('X-Cache', 'MISS');
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── NEWS API ─────────────────────────────────────────────────────────────────
  const q        = url.query.q        || 'entertainment';
  const pageSize = url.query.pageSize || '25';
  const sortBy   = url.query.sortBy   || 'publishedAt';
  const cacheKey = `${q}__${pageSize}__${sortBy}`;

  if (cache[cacheKey] && (now - cache[cacheKey].timestamp) < NEWS_CACHE_MS) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache[cacheKey].data);
  }

  try {
    const path = `/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=${sortBy}&pageSize=${pageSize}&apiKey=${API_KEY}`;
    const { status, body } = await fetchJSON('newsapi.org', path);
    if (status === 200 && body.status === 'ok') cache[cacheKey] = { timestamp: now, data: body };
    res.setHeader('X-Cache', 'MISS');
    return res.status(status).json(body);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
