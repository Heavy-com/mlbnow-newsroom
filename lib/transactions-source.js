'use strict';

const https = require('https');
const { createSourceError } = require('./source-error');
const {
  getFreshCache,
  setBoundedCache,
} = require('./proxy-policy');

const REQUEST_TIMEOUT_MS = 8 * 1000;
const CACHE_DURATION_MS = 2 * 60 * 1000;
const MAX_CACHE_ENTRIES = 2;
const cache = new Map();

function requestJSON(hostname, path, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const upstream = https.request(
      {
        hostname,
        path,
        method: 'GET',
        timeout: timeoutMs,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'HeavyNewsroom/2.2',
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
            reject(createSourceError(
              'mlb_transactions',
              'MLB transactions returned invalid JSON',
              {
                code: 'UPSTREAM_INVALID_JSON',
                status: response.statusCode,
                retryable: true,
              }
            ));
          }
        });
      }
    );

    upstream.on('timeout', () => {
      upstream.destroy(createSourceError(
        'mlb_transactions',
        'MLB transactions request timed out',
        { code: 'UPSTREAM_TIMEOUT', retryable: true }
      ));
    });
    upstream.on('error', reject);
    upstream.end();
  });
}

function extractPlayer(description) {
  const match = String(description || '').match(
    /\b(?:LHP|RHP|SP|RP|1B|2B|3B|SS|OF|CF|RF|LF|DH|C)\s+([A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+(?:\s+[A-Z\u00C0-\u024F][a-z\u00C0-\u024F]+)+)/
  );
  return match ? match[1] : null;
}

function normalizeTransaction(transaction, today) {
  const description = transaction.description || '';
  const player = transaction.player?.fullName
    || extractPlayer(description)
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

async function fetchTransactionsFeed(deps = {}) {
  const now = deps.now ? deps.now() : Date.now();
  const cached = getFreshCache(cache, 'mlb', CACHE_DURATION_MS, now);
  if (cached) return cached.data;

  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 1);
  const today = end.toISOString().split('T')[0];
  const yesterday = start.toISOString().split('T')[0];
  const path =
    `/api/v1/transactions?startDate=${yesterday}&endDate=${today}&sportId=1`;

  const requester = deps.requestJSON || requestJSON;
  const { status, body } = await requester('statsapi.mlb.com', path);

  if (status !== 200 || !Array.isArray(body?.transactions)) {
    throw createSourceError(
      'mlb_transactions',
      'MLB transactions source failed',
      {
        code: status === 429 ? 'UPSTREAM_RATE_LIMIT' : 'UPSTREAM_FAILURE',
        status,
        retryable: status === 429 || status >= 500,
      }
    );
  }

  const transactions = body.transactions
    .map((transaction) => normalizeTransaction(transaction, today))
    .sort((left, right) => new Date(right.date) - new Date(left.date));

  const data = {
    transactions,
    count: transactions.length,
    fetchedAt: new Date(now).toISOString(),
  };

  setBoundedCache(
    cache,
    'mlb',
    { timestamp: now, data },
    MAX_CACHE_ENTRIES
  );

  return data;
}

module.exports = {
  fetchTransactionsFeed,
};
