'use strict';

const https = require('https');

const REQUEST_TIMEOUT_MS = 8 * 1000;

function setEdgeCache(res) {
  res.setHeader(
    'Vercel-CDN-Cache-Control',
    'public, max-age=30, stale-while-revalidate=60'
  );
}

function fetchTransactions(path) {
  return new Promise((resolve, reject) => {
    const upstream = https.request(
      {
        hostname: 'statsapi.mlb.com',
        path,
        method: 'GET',
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'HeavyNewsroom/2.1',
        },
      },
      (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
          try {
            resolve({
              status: response.statusCode,
              body: body ? JSON.parse(body) : {},
            });
          } catch (error) {
            reject(new Error('MLB transactions returned invalid JSON'));
          }
        });
      }
    );

    upstream.on('timeout', () => {
      upstream.destroy(new Error('MLB transactions request timed out'));
    });
    upstream.on('error', reject);
    upstream.end();
  });
}

function normalizeTransaction(transaction, today) {
  const description = transaction.description || '';
  const match = description.match(
    /\b(?:LHP|RHP|SP|RP|1B|2B|3B|SS|OF|CF|RF|LF|DH|C)\s+([A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+(?:\s+[A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+)+)/
  );
  const player = transaction.player?.fullName
    || (match ? match[1] : null)
    || transaction.fromTeam?.name
    || transaction.toTeam?.name
    || 'MLB';

  const type = String(transaction.transactionType || '').toLowerCase();
  const category = ['il', 'injur', 'disability'].some((keyword) =>
    type.includes(keyword)
  ) ? 'injury' : 'trade';

  return {
    _type: 'transaction',
    _category: category,
    id: `txn-${transaction.id}`,
    player,
    fromTeam: transaction.fromTeam?.name || null,
    toTeam: transaction.toTeam?.name || null,
    transactionType: transaction.transactionType || 'Transaction',
    description,
    date: transaction.effectiveDate || transaction.date || today,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const date = new Date();
  const today = date.toISOString().split('T')[0];
  date.setDate(date.getDate() - 1);
  const yesterday = date.toISOString().split('T')[0];

  try {
    const path =
      `/api/v1/transactions?startDate=${yesterday}&endDate=${today}&sportId=1`;
    const { status, body } = await fetchTransactions(path);

    if (status !== 200 || !Array.isArray(body.transactions)) {
      return res.status(status === 429 ? 503 : 502).json({
        error: 'MLB transactions source failed',
        source: 'mlb_stats_api',
        upstream_status: status || null,
        retryable: status === 429 || status >= 500,
      });
    }

    const transactions = body.transactions
      .map((transaction) => normalizeTransaction(transaction, today))
      .sort((left, right) => new Date(right.date) - new Date(left.date));

    setEdgeCache(res);
    return res.status(200).json({
      transactions,
      count: transactions.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(502).json({
      error: 'MLB transactions source failed',
      source: 'mlb_stats_api',
      retryable: true,
      detail: error.message,
    });
  }
};
