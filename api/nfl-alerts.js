// api/nfl-alerts.js — Vercel serverless function
// GNews + nocap social posts for NFL alerts
const https = require('https');

const GNEWS_KEY = process.env.GNEWS_API_KEY || '615675b7f4505dd2b4567dfa0b0c86f6';
const SLACK_WEBHOOK = process.env.SLACK_NFL;
const NOCAP_SESSION = process.env.NOCAP_SESSION || '';

const FRESHNESS_MS = 6 * 60 * 60 * 1000; // 6 hours
let lastArticleIds = new Set();
let lastPostIds = new Set();

const QUERIES = [
  "NFL trade signing free agent roster move",
  "NFL injury quarterback receiver",
  "Cowboys Patriots Eagles Chiefs Bears Giants NFL",
  "Rams Steelers Ravens 49ers Packers Seahawks NFL"
];
const BREAKING_KW = ['breaking','exclusive','just in','confirmed','fired','suspended','announces','cut','released'];
const TRADE_KW = ['trade','traded','signed','free agent','contract','extension','released','cut','waiver','claimed'];
const INJURY_KW = ["injury", "injured", "ir ", "injured reserve", "surgery", "torn", "strain", "sprain", "concussion", "pup", "nfi"];

const TEAM_KEYWORDS = {
  "bills": [
    "buffalo bills",
    "bills football"
  ],
  "dolphins": [
    "miami dolphins",
    "dolphins football"
  ],
  "patriots": [
    "new england patriots",
    "patriots football"
  ],
  "jets": [
    "new york jets",
    "jets football"
  ],
  "ravens": [
    "baltimore ravens",
    "ravens football"
  ],
  "bengals": [
    "cincinnati bengals",
    "bengals football"
  ],
  "browns": [
    "cleveland browns",
    "browns football"
  ],
  "steelers": [
    "pittsburgh steelers",
    "steelers football"
  ],
  "texans": [
    "houston texans",
    "texans football"
  ],
  "colts": [
    "indianapolis colts",
    "colts football"
  ],
  "jaguars": [
    "jacksonville jaguars",
    "jaguars football"
  ],
  "titans": [
    "tennessee titans",
    "titans football"
  ],
  "broncos": [
    "denver broncos",
    "broncos football"
  ],
  "chiefs": [
    "kansas city chiefs",
    "chiefs football",
    "mahomes"
  ],
  "raiders": [
    "las vegas raiders",
    "raiders football"
  ],
  "chargers": [
    "los angeles chargers",
    "chargers football"
  ],
  "cowboys": [
    "dallas cowboys",
    "cowboys football"
  ],
  "giants": [
    "new york giants",
    "giants football"
  ],
  "eagles": [
    "philadelphia eagles",
    "eagles football"
  ],
  "commanders": [
    "washington commanders",
    "commanders football"
  ],
  "bears": [
    "chicago bears",
    "bears football"
  ],
  "lions": [
    "detroit lions",
    "lions football"
  ],
  "packers": [
    "green bay packers",
    "packers football"
  ],
  "vikings": [
    "minnesota vikings",
    "vikings football"
  ],
  "falcons": [
    "atlanta falcons",
    "falcons football"
  ],
  "panthers": [
    "carolina panthers",
    "panthers football"
  ],
  "saints": [
    "new orleans saints",
    "saints football"
  ],
  "buccaneers": [
    "tampa bay buccaneers",
    "buccaneers football"
  ],
  "cardinals": [
    "arizona cardinals",
    "cardinals football"
  ],
  "rams": [
    "los angeles rams",
    "rams football"
  ],
  "49ers": [
    "san francisco 49ers",
    "49ers",
    "niners"
  ],
  "seahawks": [
    "seattle seahawks",
    "seahawks football"
  ]
};

function matchTeams(text) {
  const t = text.toLowerCase();
  return Object.entries(TEAM_KEYWORDS).filter(([id, kws]) => kws.some(k => t.includes(k))).map(([id]) => id);
}

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
  try {
    const { status, body } = await request('gnews.io', `/v4/search?q=${encodeURIComponent(q)}&lang=en&max=10&token=${GNEWS_KEY}&sortby=publishedAt`);
    if (status === 200 && body.articles?.length) {
      return body.articles.map(a => ({ title:a.title, description:a.description, url:a.url, publishedAt:a.publishedAt, source:{name:a.source?.name} }));
    }
  } catch(e) {}
  return [];
}

async function fetchNocap() {
  if (!NOCAP_SESSION) return [];
  try {
    const { status, body } = await request('signal.nocap.lv',
      '/api/v1/feeds/live?limit=50&time_range=24h&sort=recency&include_low_trust=true&include_blocked=false',
      { 'Cookie': `signalizacija_session=${NOCAP_SESSION}`, 'Content-Type': 'application/json' }
    );
    if (status !== 200 || !body.items) return [];
    return body.items.filter(p => {
      const leagues = [...(p.matched_leagues||[]), ...(p.matched_streams||[])].map(s => s.toUpperCase());
      return leagues.includes('NFL');
    });
  } catch(e) { return []; }
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

function classifyArticle(article) {
  const text = ((article.title||'')+' '+(article.description||'')).toLowerCase();
  if (BREAKING_KW.some(k=>text.includes(k))) return { emoji:'🚨', label:'BREAKING' };
  if (TRADE_KW.some(k=>text.includes(k))) return { emoji:'🔄', label:'TRADE/MOVE' };
  if (INJURY_KW.some(k=>text.includes(k))) return { emoji:'🏥', label:'INJURY' };
  return { emoji:'🏈', label:'NFL NEWS' };
}

function buildNewsMessage(article) {
  const { emoji, label } = classifyArticle(article);
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

function buildSocialMessage(post) {
  const author = post.author?.display_name || post.author?.username || 'Unknown';
  const handle = post.author?.username ? `@${post.author.username}` : '';
  const followers = post.author?.followers_count ? `${(post.author.followers_count/1000).toFixed(0)}K followers` : '';
  const time = new Date(post.created_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',timeZoneName:'short'});
  const text = (post.text_preview||'').replace(/https?:\/\/\S+/g,'').trim();
  const m = post.latest_metrics||{};
  const isBreaking = (post.matched_streams||[]).some(s=>s.toLowerCase().includes('breaking'));
  return {
    blocks: [
      { type:'section', text:{ type:'mrkdwn', text:`${isBreaking?'🚨':'𝕏'} *${isBreaking?'BREAKING':'X POST'}*\n*<${post.source_url}|${text.slice(0,200)}${text.length>200?'…':''}>*` } },
      { type:'context', elements:[
        { type:'mrkdwn', text:`𝕏 *${author}* ${handle}  ·  ${followers}  ·  🕐 ${time}` },
        { type:'mrkdwn', text:`❤️ ${m.likes||0}  🔁 ${m.reposts||0}  💬 ${m.replies||0}  👁 ${m.views||0}` }
      ]},
      { type:'divider' }
    ],
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
    const [newsResults, posts] = await Promise.all([
      Promise.all(QUERIES.map(fetchArticles)),
      fetchNocap()
    ]);

    // Process news
    const seenUrls = new Set();
    for (const articles of newsResults) {
      for (const article of articles) {
        const id = article.url;
        if (seenUrls.has(id) || lastArticleIds.has(id)) continue;
        seenUrls.add(id);
        const age = now - new Date(article.publishedAt).getTime();
        if (isNaN(age) || age > FRESHNESS_MS) continue;
        if (!article.title || article.title === '[Removed]') continue;
        lastArticleIds.add(id);
        try {
          await postToSlack(SLACK_WEBHOOK, buildNewsMessage(article));
          alerts.push({ type:'news', title:article.title.slice(0,60) });
        } catch(e) { errors.push(e.message); }
      }
    }

    // Process nocap posts
    for (const post of posts) {
      const id = post.post_id;
      if (lastPostIds.has(id)) continue;
      const age = now - new Date(post.created_at).getTime();
      if (isNaN(age) || age > FRESHNESS_MS) continue;
      const text = ((post.text_preview||'')+' '+(post.author?.display_name||'')).toLowerCase();
      const teams = matchTeams(text);
      const isBreaking = (post.matched_streams||[]).some(s=>s.toLowerCase().includes('breaking'));
      if (!isBreaking && !teams.length) continue;
      lastPostIds.add(id);
      try {
        await postToSlack(SLACK_WEBHOOK, buildSocialMessage(post));
        alerts.push({ type:'social', text:post.text_preview?.slice(0,60) });
      } catch(e) { errors.push(e.message); }
    }

    if (lastArticleIds.size > 500) lastArticleIds = new Set([...lastArticleIds].slice(-200));
    if (lastPostIds.size > 500) lastPostIds = new Set([...lastPostIds].slice(-200));

    res.status(200).json({ success:true, alerts_sent:alerts.length, alerts, errors,
      debug:{ articles_checked:newsResults.flat().length, posts_checked:posts.length, today:new Date().toISOString() } });
  } catch(e) {
    res.status(500).json({ success:false, error:e.message });
  }
};
