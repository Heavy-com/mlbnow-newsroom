// api/nfl-alerts.js — Vercel serverless function
// Reads from /api/news cache instead of calling NewsAPI directly
// Zero additional NewsAPI calls when cache is warm

const https = require('https');

const SLACK_WEBHOOK = process.env.SLACK_NFL;
const BASE_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://heavy-newsroom.vercel.app';

const FRESHNESS_MS = 30 * 60 * 1000; // 30 min to match workflow interval
let lastArticleIds = new Set();

const QUERIES = [
  'NFL trade signing free agent roster move',
  'NFL injury quarterback receiver',
  'Cowboys Patriots Eagles Chiefs Bears Giants NFL',
  'Rams Steelers Ravens 49ers Packers Seahawks NFL'
];

const BREAKING_KW = ['breaking','exclusive','just in','confirmed','fired','suspended','announces','cut','released'];
const TRADE_KW = ['trade','traded','signed','free agent','contract','extension','released','cut','waiver','claimed'];
const INJURY_KW = ['injury','injured','ir ','injured reserve','surgery','torn','strain','sprain','concussion','pup','nfi'];

function fetchFromCache(q) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}/api/news?q=${encodeURIComponent(q)}&pageSize=20`);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname + url.search, method: 'GET',
        headers: { 'Accept': 'application/json', 'User-Agent': 'HeavyOnSports/1.0' } },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data).articles || []); }
          catch (e) { resolve([]); }
        });
      }
    );
    req.on('error', () => resolve([]));
    req.end();
  });
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
  return { emoji:'🏈', label:'NFL NEWS' };
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
  if (!SLACK_WEBHOOK) return res.status(500).json({ error: 'SLACK_NFL environment variable not set' });

  const alerts = [], errors = [];
  const now = Date.now();

  try {
    const results = await Promise.all(QUERIES.map(fetchFromCache));
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
