// api/nocap.js — Vercel serverless function
// Proxies signal.nocap.lv live feed with 5-minute caching
// Requires NOCAP_SESSION environment variable (session cookie from browser)

const https = require('https');

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
let cache = null;

function fetchNocap() {
  return new Promise((resolve, reject) => {
    const session = process.env.NOCAP_SESSION;
    if (!session) {
      return reject(new Error('NOCAP_SESSION environment variable not set'));
    }

    const options = {
      hostname: 'signal.nocap.lv',
      path: '/api/v1/feeds/live?limit=50&time_range=24h&sort=recency&include_low_trust=true&include_blocked=false',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/json',
        'Cookie': `signalizacija_session=${session}`,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const body = JSON.parse(data);
          resolve({ status: res.statusCode, body });
        } catch (e) {
          reject(new Error(`Failed to parse nocap response: ${data.slice(0, 200)}`));
        }
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

  // Return cached result if still fresh
  if (cache && (now - cache.timestamp) < CACHE_DURATION_MS) {
    const age = Math.floor((now - cache.timestamp) / 1000);
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('X-Cache-Age', `${age}s`);
    return res.status(200).json(cache.data);
  }

  try {
    const { status, body } = await fetchNocap();

    if (status === 401) {
      return res.status(401).json({ 
        error: 'Session expired. Update NOCAP_SESSION in Vercel environment variables.',
        detail: body.detail || 'authentication required'
      });
    }

    if (status === 200 && body.items) {
      cache = { timestamp: now, data: body };
    }

    res.setHeader('X-Cache', 'MISS');
    res.status(status).json(body);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
