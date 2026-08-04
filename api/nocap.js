// Stable Signalizacija proxy with short caching and legacy-session fallback.

const { fetchSignalPosts, getSignalCredentials } = require('../lib/signal');

const CACHE_DURATION_MS = 45 * 1000;
const cache = new Map();

function getOptions(req) {
  const url = new URL(req.url, 'https://heavy-newsroom.local');
  const allowed = [
    'limit', 'metrics', 'source', 'category', 'author', 'search',
    'created_after', 'created_before', 'collected_after', 'metric_limit', 'cursor',
  ];
  return Object.fromEntries(
    allowed
      .map((key) => [key, url.searchParams.get(key)])
      .filter(([, value]) => value !== null && value !== '')
  );
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const options = getOptions(req);
  const cacheKey = JSON.stringify(options);
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && now - cached.timestamp < CACHE_DURATION_MS) {
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('X-Cache-Age', `${Math.floor((now - cached.timestamp) / 1000)}s`);
    return res.status(200).json(cached.data);
  }

  try {
    const { status, body } = await fetchSignalPosts(options);
    if (status === 200) cache.set(cacheKey, { timestamp: now, data: body });

    res.setHeader('X-Cache', 'MISS');
    return res.status(status).json(body);
  } catch (error) {
    const credentials = getSignalCredentials();
    const status = error.code === 'SIGNAL_CREDENTIAL_MISSING' ? 503 : 500;
    return res.status(status).json({
      error: error.message,
      credential_mode: credentials.mode,
      expected_env: ['SIGNAL_API_TOKEN', 'SIGNALIZACIJA_API_TOKEN', 'NOCAP_SESSION'],
    });
  }
};
