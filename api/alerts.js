// api/alerts.js — Vercel serverless function
// Polls NewsAPI + nocap for breaking stories and posts to team Slack channels
// Call this endpoint on a schedule (e.g. every 5 minutes via Vercel Cron)
// Deduplicates using in-memory seen set — resets on cold start but good enough for most cases

const https = require('https');

// ── CONFIGURATION ─────────────────────────────────────────────────────────────

const NEWS_API_KEY = process.env.NEWS_API_KEY || 'eba3bb2993124fb0b3c1117f7535afc2';
const NOCAP_SESSION = process.env.NOCAP_SESSION || '';

// One Slack webhook per team channel
// e.g. #heavy-on-mlb-yankees, #heavy-on-mlb-redsox, etc.
// Add more teams here as you create their Slack channels
const TEAM_WEBHOOKS = {
  yankees:  process.env.SLACK_YANKEES  || process.env.SLACK_DEFAULT,
  redsox:   process.env.SLACK_REDSOX   || process.env.SLACK_DEFAULT,
  mets:     process.env.SLACK_METS     || process.env.SLACK_DEFAULT,
  dodgers:  process.env.SLACK_DODGERS  || process.env.SLACK_DEFAULT,
  // Add more as you create channels:
  // braves:   process.env.SLACK_BRAVES   || process.env.SLACK_DEFAULT,
  // astros:   process.env.SLACK_ASTROS   || process.env.SLACK_DEFAULT,
};

const TEAM_CONFIG = {
  yankees: { label: 'New York Yankees', emoji: '⚾', color: '#003087', keywords: ['new york yankees','yankees','bronx'], streams: ['Yankees'] },
  redsox:  { label: 'Boston Red Sox',   emoji: '🧦', color: '#BD3039', keywords: ['boston red sox','red sox','fenway'],  streams: ['Red Sox'] },
  mets:    { label: 'New York Mets',    emoji: '🔵', color: '#002D72', keywords: ['new york mets','mets baseball','citi field'], streams: ['Mets'] },
  dodgers: { label: 'Los Angeles Dodgers', emoji: '💙', color: '#005A9C', keywords: ['los angeles dodgers','dodgers','ohtani'], streams: ['Dodgers'] },
};

const BREAKING_KW = ['breaking','exclusive','just in','confirmed','fired','resigns','retires','suspended','announced'];
const TRADE_KW    = ['trade','traded','signed','free agent','contract','extension','released','designated for assignment','dfa','acquired'];
const INJURY_KW   = ['injury','injured','injured list','il ','surgery','torn','strain','sprain','concussion','day-to-day','out indefinitely'];

// In-memory dedup store — keyed by story URL or post ID
const seen = new Set();

// ── HELPERS ───────────────────────────────────────────────────────────────────

function txt(a) {
  return ((a.title || a.text_preview || '') + ' ' + (a.description || '')).toLowerCase();
}

function classify(a) {
  const t = txt(a);
  const types = [];
  if (BREAKING_KW.some(k => t.includes(k)) || (a.matched_streams||[]).includes('Breaking MLB')) types.push('breaking');
  if (TRADE_KW.some(k => t.includes(k))) types.push('trade');
  if (INJURY_KW.some(k => t.includes(k))) types.push('injury');
  return types;
}

function matchTeams(a) {
  const t = txt(a);
  const streams = (a.matched_streams || []).map(s => s.toLowerCase());
  return Object.entries(TEAM_CONFIG).filter(([id, cfg]) => {
    return cfg.keywords.some(k => t.includes(k)) || cfg.streams.some(s => streams.includes(s.toLowerCase()));
  }).map(([id]) => id);
}

function typeLabel(types) {
  if (types.includes('breaking')) return { emoji: '🚨', label: 'BREAKING' };
  if (types.includes('trade'))    return { emoji: '🔄', label: 'TRADE' };
  if (types.includes('injury'))   return { emoji: '🏥', label: 'INJURY' };
  if (types.includes('transaction')) return { emoji: '🔄', label: 'TRANSACTION' };
  return { emoji: '📰', label: 'NEWS' };
}

function postToSlack(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(webhookUrl);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function fetchJSON(hostname, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname, path, method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'HeavyOnMLB/1.0', ...headers }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('JSON parse error')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── SLACK MESSAGE BUILDER ─────────────────────────────────────────────────────

function buildNewsMessage(article, teamId, types) {
  const team = TEAM_CONFIG[teamId];
  const { emoji, label } = typeLabel(types);
  const source = article.source?.name || 'Unknown';
  const time = new Date(article.publishedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *${label}* — ${team.emoji} ${team.label}\n*<${article.url}|${article.title}>*`
        }
      },
      article.description ? {
        type: 'section',
        text: { type: 'mrkdwn', text: article.description.slice(0, 280) }
      } : null,
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `📰 ${source}  ·  🕐 ${time}` }
        ]
      },
      { type: 'divider' }
    ].filter(Boolean),
    unfurl_links: false
  };
}

function buildSocialMessage(post, teamId, types) {
  const team = TEAM_CONFIG[teamId];
  const { emoji, label } = typeLabel(types);
  const author = post.author?.display_name || post.author?.username || 'Unknown';
  const handle = post.author?.username ? `@${post.author.username}` : '';
  const followers = post.author?.followers_count ? `${(post.author.followers_count / 1000).toFixed(0)}K followers` : '';
  const time = new Date(post.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  const text = (post.text_preview || '').replace(/https?:\/\/\S+/g, '').trim();
  const m = post.latest_metrics || {};
  const streams = (post.matched_streams || []).filter(s => !['MLB', 'Breaking MLB'].includes(s)).join(', ');

  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *${label}* — ${team.emoji} ${team.label}\n*<${post.source_url}|${text.slice(0, 200)}${text.length > 200 ? '…' : ''}>*`
        }
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `𝕏 *${author}* ${handle}  ·  ${followers}  ·  🕐 ${time}` },
          { type: 'mrkdwn', text: `❤️ ${m.likes||0}  🔁 ${m.reposts||0}  💬 ${m.replies||0}  👁 ${m.views||0}${streams ? `  ·  ${streams}` : ''}` }
        ]
      },
      { type: 'divider' }
    ],
    unfurl_links: false
  };
}

// ── FETCH SOURCES ─────────────────────────────────────────────────────────────

async function fetchNewsArticles() {
  const queries = [
    'Yankees Dodgers Mets Red Sox baseball breaking news',
    'Yankees Dodgers Mets Red Sox trade injury roster'
  ];
  const articles = [];
  const seen_urls = new Set();

  for (const q of queries) {
    try {
      const path = `/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=20&apiKey=${NEWS_API_KEY}`;
      const { body } = await fetchJSON('newsapi.org', path);
      if (body.articles) {
        for (const a of body.articles) {
          if (!seen_urls.has(a.url) && a.title && a.title !== '[Removed]') {
            seen_urls.add(a.url);
            articles.push(a);
          }
        }
      }
    } catch (e) { console.error('NewsAPI error:', e.message); }
  }
  return articles;
}

async function fetchSocialPosts() {
  if (!NOCAP_SESSION) return [];
  try {
    const { status, body } = await fetchJSON(
      'signal.nocap.lv',
      '/api/v1/feeds/live?limit=50&time_range=24h&sort=recency&include_low_trust=true&include_blocked=false',
      {
        'Cookie': `signalizacija_session=${NOCAP_SESSION}`,
        'Content-Type': 'application/json'
      }
    );
    return status === 200 && body.items ? body.items : [];
  } catch (e) { console.error('Nocap error:', e.message); return []; }
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const alerts = [];
  const errors = [];

  try {
    const [articles, posts, txns] = await Promise.all([fetchNewsArticles(), fetchSocialPosts(), fetchTransactions()]);

    // Process news articles
    for (const article of articles) {
      const id = article.url;
      if (seen.has(id)) continue;

      const types = classify(article);
      const teams = matchTeams(article);
      if (!teams.length) continue;
      // Alert on any team story; classify gives it a label, fallback to 'news'
      if (!types.length) types.push('news');

      seen.add(id);

      for (const teamId of teams) {
        const webhook = TEAM_WEBHOOKS[teamId];
        if (!webhook) continue;

        const message = buildNewsMessage(article, teamId, types);
        try {
          await postToSlack(webhook, message);
          alerts.push({ type: 'news', team: teamId, title: article.title });
        } catch (e) {
          errors.push({ team: teamId, error: e.message });
        }
      }
    }

    // Process social posts — only breaking MLB stream posts
    for (const post of posts) {
      const id = post.post_id;
      if (seen.has(id)) continue;

      const isBreakingStream = (post.matched_streams || []).includes('Breaking MLB');
      const types = classify(post);
      if (!isBreakingStream && !types.length) continue;
      if (!types.length) types.push('breaking');

      const teams = matchTeams(post);
      if (!teams.length) continue;

      seen.add(id);

      for (const teamId of teams) {
        const webhook = TEAM_WEBHOOKS[teamId];
        if (!webhook) continue;

        const message = buildSocialMessage(post, teamId, types);
        try {
          await postToSlack(webhook, message);
          alerts.push({ type: 'social', team: teamId, text: post.text_preview?.slice(0, 60) });
        } catch (e) {
          errors.push({ team: teamId, error: e.message });
        }
      }
    }

    // Process transactions
    for (const t of txns) {
      const id = `txn-${t.id}`;
      if (seen.has(id)) continue;

      const teamName = n => (n||'').toLowerCase();
      const matchedTeams = Object.entries(TEAM_CONFIG).filter(([tid, cfg]) => {
        return cfg.keywords.some(k => teamName(t.fromTeam?.name).includes(k) || teamName(t.toTeam?.name).includes(k));
      }).map(([tid]) => tid);

      if (!matchedTeams.length) continue;
      seen.add(id);

      for (const teamId of matchedTeams) {
        const webhook = TEAM_WEBHOOKS[teamId];
        if (!webhook) continue;
        const message = buildTransactionMessage(t, teamId);
        try {
          await postToSlack(webhook, message);
          alerts.push({ type: 'transaction', team: teamId, player: t.player?.fullName, txType: t.transactionType });
        } catch (e) {
          errors.push({ team: teamId, error: e.message });
        }
      }
    }

    res.status(200).json({
      success: true,
      alerts_sent: alerts.length,
      alerts,
      errors
    });

  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

// ── TRANSACTION ALERTS (appended) ────────────────────────────────────────────
// This is called from the main module.exports handler — see fetchAndAlertTransactions below

async function fetchTransactions() {
  return new Promise((resolve, reject) => {
    const d = new Date(); const today = d.toISOString().split('T')[0];
    d.setDate(d.getDate()-1); const yesterday = d.toISOString().split('T')[0];
    const path = `/api/v1/transactions?startDate=${yesterday}&endDate=${today}&sportId=1`;
    const options = {
      hostname: 'statsapi.mlb.com', path, method: 'GET',
      headers: { 'User-Agent': 'HeavyOnMLB/1.0', 'Accept': 'application/json' }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data).transactions || []); }
        catch(e) { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.end();
  });
}

function buildTransactionMessage(t, teamId) {
  const team = TEAM_CONFIG[teamId];
  const typeEmoji = t.transactionType?.toLowerCase().includes('il') ? '🏥' : '🔄';
  const fromTo = t.fromTeam?.name && t.toTeam?.name
    ? `${t.fromTeam.name} → ${t.toTeam.name}`
    : t.fromTeam?.name || t.toTeam?.name || '';
  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${typeEmoji} *TRANSACTION* — ${team.emoji} ${team.label}\n*${t.player?.fullName || 'Unknown'}* — ${t.transactionType}`
        }
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: t.description || fromTo || 'No description available' }
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `🏟️ MLB Official Transactions  ·  📅 ${t.effectiveDate || t.date}` }]
      },
      { type: 'divider' }
    ],
    unfurl_links: false
  };
}
