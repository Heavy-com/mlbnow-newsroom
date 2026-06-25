// api/nhl-alerts.js — Vercel serverless function
const https = require('https');

const NEWS_API_KEY = process.env.NEWS_API_KEY || 'eba3bb2993124fb0b3c1117f7535afc2';
const GNEWS_KEY = process.env.GNEWS_API_KEY || '615675b7f4505dd2b4567dfa0b0c86f6';
const SLACK_WEBHOOK = process.env.SLACK_NHL;
const BASE_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://heavy-newsroom.vercel.app';

const FRESHNESS_MS = 30 * 60 * 1000;
let lastArticleIds = new Set();

const QUERIES = ['NHL trade signing free agent roster move', 'NHL injury player out', 'Rangers Bruins Maple Leafs Canadiens Penguins Capitals NHL', 'Oilers Avalanche Lightning Panthers Kings Sharks NHL'];

const BREAKING_KW = ['breaking','exclusive','just in','confirmed','fired','suspended','announces','cut','released'];
const TRADE_KW = ['trade','traded','signed','free agent','contract','extension','released','cut','waiver','claimed'];
const INJURY_KW = ['injury', 'injured', 'ltir', 'injured reserve', 'surgery', 'torn', 'strain', 'sprain', 'concussion', 'day-to-day', 'out indefinitely'];

function request(hostname, path, headers={}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: 'GET', headers: { 'Accept': 'application/json', 'User-Agent': 'HeavyOnSports/1.0', ...headers } },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch (e) { resolve({ status: res.statusCode, body: {} }); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function fetchArticles(q) {
  // Try cache first
  try {
    const url = new URL(`${BASE_URL}/api/news?q=${encodeURIComponent(q)}&pageSize=20`);
    const cached = await request(url.hostname, url.pathname + url.search);
    if (cached.body.articles?.length) return cached.body.articles;
  } catch(e) {}

  // Fall back to NewsAPI
  try {
    const { status, body } = await request('newsapi.org', `/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${NEWS_API_KEY}`);
    if (status === 200 && body.articles?.length) return body.articles;
    // Fall back to GNews if rate limited
    if (status === 429 || body.code === 'rateLimited') {
      const { status: gs, body: gb } = await request('gnews.io', `/v4/search?q=${encodeURIComponent(q)}&lang=en&max=10&token=${GNEWS_KEY}`);
      if (gs === 200 && gb.articles) return gb.articles.map(a => ({title:a.title,description:a.description,url:a.url,publishedAt:a.publishedAt,source:{name:a.source?.name}}));
    }
  } catch(e) {}
  return [];
}

function postToSlack(webhook, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(webhook);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({status:res.statusCode,body:d})); }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function classify(article) {
  const text = ((article.title||'')+' '+(article.description||'')).toLowerCase();
  if (BREAKING_KW.some(k=>text.includes(k))) return { emoji:'🚨', label:'BREAKING' };
  if (TRADE_KW.some(k=>text.includes(k))) return { emoji:'🔄', label:'TRADE/MOVE' };
  if (INJURY_KW.some(k=>text.includes(k))) return { emoji:'🏥', label:'INJURY' };
  return { emoji:'🏒', label:'NHL NEWS' };
}

function buildMessage(article) {
  const { emoji, label } = classify(article);
  const source = article.source?.name || 'Unknown';
  const time = new Date(article.publishedAt).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',timeZoneName:'short'});
  return {
    blocks: [
      { type:'section', text:{ type:'mrkdwn', text:`${emoji} *${label}*\n*<${article.url}|${article.title}>*` } },
      article.description ? { type:'section', text:{ type:'mrkdwn', text:article.description.slice(0,280) } } : null,
      { type:'context', elements:[{ type:'mrkdwn', text:`📰 ${source}  ·  🕐 ${time}` }] },
      { type:'divider' }
    ].filter(Boolean),
    unfurl_links: false
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!SLACK_WEBHOOK) return res.status(500).json({ error: 'SLACK_NHL environment variable not set' });

  const alerts = [], errors = [];
  const now = Date.now();

  try {
    const results = await Promise.all(QUERIES.map(fetchArticles));
    const seen = new Set();

    for (const articles of results) {
      for (const article of articles) {
        const id = article.url;
        if (seen.has(id) || lastArticleIds.has(id)) continue;
        seen.add(id);
        const age = now - new Date(article.publishedAt).getTime();
        if (isNaN(age) || age > FRESHNESS_MS) continue;
        if (!article.title || article.title === '[Removed]') continue;
        lastArticleIds.add(id);
        try {
          await postToSlack(SLACK_WEBHOOK, buildMessage(article));
          alerts.push({ title: article.title.slice(0,60) });
        } catch(e) { errors.push(e.message); }
      }
    }

    if (lastArticleIds.size > 500) lastArticleIds = new Set([...lastArticleIds].slice(-200));
    res.status(200).json({ success:true, alerts_sent:alerts.length, alerts, errors, debug:{ articles_checked: results.flat().length, today: new Date().toISOString() } });
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
};
