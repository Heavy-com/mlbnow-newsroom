// api/nba-alerts.js — Vercel serverless function
// GNews + nocap social posts for NBA alerts, posted to Google Chat
const https = require('https');

const GNEWS_KEY = process.env.GNEWS_API_KEY || '615675b7f4505dd2b4567dfa0b0c86f6';
const GCHAT_WEBHOOK = process.env.GCHAT_NBA;
const NOCAP_SESSION = process.env.NOCAP_SESSION || '';

const FRESHNESS_MS = 6 * 60 * 60 * 1000;
let lastArticleIds = new Set();
let lastPostIds = new Set();

const QUERIES = [
  "NBA trade signing free agent roster move",
  "NBA injury player out",
  "Lakers Celtics Warriors Knicks Bulls Heat NBA",
  "Bucks Nuggets Suns Mavericks Clippers Nets NBA"
];
const BREAKING_KW = ['breaking','exclusive','just in','confirmed','fired','suspended','announces','cut','released'];
const TRADE_KW = ['trade','traded','signed','free agent','contract','extension','released','cut','waiver','claimed'];
const INJURY_KW = ["injury", "injured", "injured reserve", "surgery", "torn", "strain", "sprain", "concussion", "day-to-day", "out indefinitely"];
const TEAM_KEYWORDS = {
  "celtics": [
    "boston celtics",
    "celtics basketball"
  ],
  "nets": [
    "brooklyn nets",
    "nets basketball"
  ],
  "knicks": [
    "new york knicks",
    "knicks basketball"
  ],
  "sixers": [
    "philadelphia 76ers",
    "sixers basketball"
  ],
  "raptors": [
    "toronto raptors",
    "raptors basketball"
  ],
  "bulls": [
    "chicago bulls",
    "bulls basketball"
  ],
  "cavaliers": [
    "cleveland cavaliers",
    "cavaliers",
    "cavs"
  ],
  "pistons": [
    "detroit pistons",
    "pistons basketball"
  ],
  "pacers": [
    "indiana pacers",
    "pacers basketball"
  ],
  "bucks": [
    "milwaukee bucks",
    "bucks basketball",
    "giannis"
  ],
  "hawks": [
    "atlanta hawks",
    "hawks basketball"
  ],
  "hornets": [
    "charlotte hornets",
    "hornets basketball"
  ],
  "heat": [
    "miami heat",
    "heat basketball"
  ],
  "magic": [
    "orlando magic",
    "magic basketball"
  ],
  "wizards": [
    "washington wizards",
    "wizards basketball"
  ],
  "nuggets": [
    "denver nuggets",
    "nuggets basketball",
    "jokic"
  ],
  "timberwolves": [
    "minnesota timberwolves",
    "timberwolves"
  ],
  "thunder": [
    "oklahoma city thunder",
    "thunder basketball",
    "okc"
  ],
  "blazers": [
    "portland trail blazers",
    "trail blazers"
  ],
  "jazz": [
    "utah jazz",
    "jazz basketball"
  ],
  "warriors": [
    "golden state warriors",
    "warriors basketball",
    "curry"
  ],
  "clippers": [
    "la clippers",
    "clippers basketball"
  ],
  "lakers": [
    "los angeles lakers",
    "lakers basketball",
    "lebron"
  ],
  "suns": [
    "phoenix suns",
    "suns basketball"
  ],
  "kings": [
    "sacramento kings",
    "kings basketball"
  ],
  "mavericks": [
    "dallas mavericks",
    "mavericks",
    "mavs",
    "luka"
  ],
  "rockets": [
    "houston rockets",
    "rockets basketball"
  ],
  "grizzlies": [
    "memphis grizzlies",
    "grizzlies basketball"
  ],
  "pelicans": [
    "new orleans pelicans",
    "pelicans basketball"
  ],
  "spurs": [
    "san antonio spurs",
    "spurs basketball",
    "wembanyama"
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
      return leagues.includes('NBA');
    });
  } catch(e) { return []; }
}

function postToGoogleChat(webhookUrl, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ text });
    const url = new URL(webhookUrl);
    const req = https.request(
      { hostname: url.hostname, path: url.pathname + url.search, method: 'POST',
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
  return { emoji:'🏀', label:'NBA NEWS' };
}

function buildNewsText(article) {
  const { emoji, label } = classifyArticle(article);
  const source = article.source?.name || 'Unknown';
  const time = new Date(article.publishedAt).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',timeZoneName:'short'});
  const desc = article.description ? `\n${article.description.slice(0,280)}` : '';
  return `${emoji} *${label}*\n*<${article.url}|${article.title}>*${desc}\n📰 ${source}  ·  🕐 ${time}`;
}

function buildSocialText(post) {
  const author = post.author?.display_name || post.author?.username || 'Unknown';
  const handle = post.author?.username ? `@${post.author.username}` : '';
  const followers = post.author?.followers_count ? `${(post.author.followers_count/1000).toFixed(0)}K followers` : '';
  const time = new Date(post.created_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',timeZoneName:'short'});
  const text = (post.text_preview||'').replace(/https?:\/\/\S+/g,'').trim();
  const m = post.latest_metrics||{};
  const isBreaking = (post.matched_streams||[]).some(s=>s.toLowerCase().includes('breaking'));
  const tag = isBreaking ? '🚨 *BREAKING*' : '𝕏 *X POST*';
  return `${tag}\n*<${post.source_url}|${text.slice(0,200)}${text.length>200?'…':''}>*\n𝕏 *${author}* ${handle}  ·  ${followers}  ·  🕐 ${time}\n❤️ ${m.likes||0}  🔁 ${m.reposts||0}  💬 ${m.replies||0}  👁 ${m.views||0}`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!GCHAT_WEBHOOK) return res.status(500).json({ error: 'GCHAT_NBA environment variable not set' });

  const alerts = [], errors = [];
  const now = Date.now();

  try {
    const [newsResults, posts] = await Promise.all([
      Promise.all(QUERIES.map(fetchArticles)),
      fetchNocap()
    ]);

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
          await postToGoogleChat(GCHAT_WEBHOOK, buildNewsText(article));
          alerts.push({ type:'news', title:article.title.slice(0,60) });
        } catch(e) { errors.push(e.message); }
      }
    }

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
        await postToGoogleChat(GCHAT_WEBHOOK, buildSocialText(post));
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
