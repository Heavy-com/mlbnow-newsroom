// api/nocap.js — Vercel serverless function
// Proxies signal.nocap.lv live feed with 5-minute caching

const https = require('https');

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
let cache = null;

function fetchNocap() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'signal.nocap.lv',
      path: '/api/v1/feeds/live?limit=50&time_range=24h&sort=recency&include_low_trust=true&include_blocked=false',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MLBNowNewsroom/1.0)',
        'Accept': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Failed to parse nocap response')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const now = Date.now();

  if (cache && (now - cache.timestamp) < CACHE_DURATION_MS) {
    const age = Math.floor((now - cache.timestamp) / 1000);
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('X-Cache-Age', `${age}s`);
    return res.status(200).json(cache.data);
  }

  try {
    const { status, body } = await fetchNocap();
    if (status === 200 && body.items) {
      cache = { timestamp: now, data: body };
    }
    res.setHeader('X-Cache', 'MISS');
    res.status(status).json(body);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
