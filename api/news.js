// api/news.js — Vercel serverless function with caching + entertainmentnow category support
// Cache: 15 minutes per query key. ~6 API calls/day regardless of team size.

const https = require('https');

const API_KEY = process.env.NEWS_API_KEY || 'eba3bb2993124fb0b3c1117f7535afc2';
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const cache = {};

function fetchFromNewsAPI(q, pageSize, sortBy) {
  return new Promise((resolve, reject) => {
    const apiPath = `/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=${sortBy}&pageSize=${pageSize}&apiKey=${API_KEY}`;
    const options = {
      hostname: 'newsapi.org',
      path: apiPath,
      method: 'GET',
      headers: { 'User-Agent': 'EntertainmentNow/1.0' }
    };
    const proxyReq = https.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        try { resolve({ status: proxyRes.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Failed to parse NewsAPI response')); }
      });
    });
    proxyReq.on('error', reject);
    proxyReq.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const q = req.query.q || 'entertainment';
  const pageSize = req.query.pageSize || '25';
  const sortBy = req.query.sortBy || 'publishedAt';
  const cacheKey = `${q}__${pageSize}__${sortBy}`;
  const now = Date.now();

  if (cache[cacheKey] && (now - cache[cacheKey].timestamp) < CACHE_DURATION_MS) {
    const ageSeconds = Math.floor((now - cache[cacheKey].timestamp) / 1000);
    const expiresIn = Math.floor((CACHE_DURATION_MS - (now - cache[cacheKey].timestamp)) / 1000 / 60);
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('X-Cache-Age', `${ageSeconds}s`);
    res.setHeader('X-Cache-Expires-In', `${expiresIn}m`);
    return res.status(200).json(cache[cacheKey].data);
  }

  try {
    const { status, body } = await fetchFromNewsAPI(q, pageSize, sortBy);
    if (status === 200 && body.status === 'ok') {
      cache[cacheKey] = { timestamp: now, data: body };
    }
    res.setHeader('X-Cache', 'MISS');
    res.status(status).json(body);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
