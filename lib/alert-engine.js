'use strict';

const https = require('https');
const { fetchSignalPosts } = require('./signal');
const { authorizeAlertRequest } = require('./alert-auth');
const { validateAlertConfig } = require('./alert-config');

const REQUEST_TIMEOUT_MS = 12 * 1000;
const MAX_SEEN_IDS = 500;
const TRIMMED_SEEN_IDS = 200;
const DEFAULT_BASE_URL = 'https://heavy-newsroom.vercel.app';

const stateByLeague = new Map();

function stateFor(config) {
  if (!stateByLeague.has(config.id)) {
    stateByLeague.set(config.id, {
      articleIds: new Set(),
      postIds: new Set(),
      transactionIds: new Set(),
    });
  }
  return stateByLeague.get(config.id);
}

function trimSet(set) {
  if (set.size <= MAX_SEEN_IDS) return set;
  return new Set([...set].slice(-TRIMMED_SEEN_IDS));
}

function requestText({ hostname, path, method = 'GET', headers = {}, body = '', timeoutMs = REQUEST_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path,
      method,
      headers,
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });

    req.on('timeout', () => req.destroy(new Error('Upstream request timed out')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function requestJSON(hostname, path, headers = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const response = await requestText({
    hostname,
    path,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'HeavyOnSports/2.0',
      ...headers,
    },
    timeoutMs,
  });

  try {
    return {
      status: response.status,
      body: response.body ? JSON.parse(response.body) : {},
    };
  } catch (error) {
    return { status: response.status, body: {} };
  }
}

async function postToGoogleChat(webhookUrl, text) {
  const body = JSON.stringify({ text });
  const url = new URL(webhookUrl);
  return requestText({
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  });
}

function itemText(item) {
  return `${item.title || item.text_preview || item.text || ''} ${item.description || ''}`.toLowerCase();
}

function socialMatchText(post) {
  return `${post.text_preview || post.text || ''} ${post.author?.display_name || ''}`.toLowerCase();
}

function categoryText(post) {
  const categories = Array.isArray(post.categories) ? post.categories : [];
  return categories
    .map((entry) => typeof entry === 'string' ? entry : entry?.category)
    .filter(Boolean)
    .join(' ');
}

function classifyTypes(item, config) {
  const text = itemText(item);
  const types = [];
  const streams = Array.isArray(item.matched_streams) ? item.matched_streams : [];

  if (
    config.breakingKeywords.some((keyword) => text.includes(keyword)) ||
    streams.some((stream) => String(stream).toLowerCase().includes('breaking'))
  ) {
    types.push('breaking');
  }
  if (config.tradeKeywords.some((keyword) => text.includes(keyword))) types.push('trade');
  if (config.injuryKeywords.some((keyword) => text.includes(keyword))) types.push('injury');
  return types;
}

function primaryType(types, config) {
  if (types.includes('breaking')) return { emoji: '🚨', label: 'BREAKING' };
  if (types.includes('trade')) return { emoji: '🔄', label: config.teamScoped ? 'TRADE' : 'TRADE/MOVE' };
  if (types.includes('injury')) return { emoji: '🏥', label: 'INJURY' };
  return { emoji: config.sportEmoji, label: config.newsLabel };
}

function matchTeamsFromText(text, config, streams = []) {
  const normalized = String(text || '').toLowerCase();
  const normalizedStreams = streams.map((stream) => String(stream).toLowerCase());

  return Object.entries(config.teams)
    .filter(([, team]) => {
      const keywordMatch = (team.keywords || []).some((keyword) => normalized.includes(keyword));
      const streamMatch = (team.streams || []).some((stream) => normalizedStreams.includes(stream.toLowerCase()));
      return keywordMatch || streamMatch;
    })
    .map(([id]) => id);
}

function matchTeams(item, config) {
  return matchTeamsFromText(
    itemText(item),
    config,
    Array.isArray(item.matched_streams) ? item.matched_streams : []
  );
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function buildNewsText(article, config, teamId = null) {
  const types = classifyTypes(article, config);
  const { emoji, label } = primaryType(types, config);
  const source = article.source?.name || 'Unknown';
  const time = formatTime(article.publishedAt);
  const description = article.description ? `\n${article.description.slice(0, 280)}` : '';
  const teamPrefix = teamId
    ? ` — ${config.teams[teamId].emoji} ${config.teams[teamId].label}`
    : '';

  return `${emoji} *${label}*${teamPrefix}\n*<${article.url}|${article.title}>*${description}\n📰 ${source}  ·  🕐 ${time}`;
}

function buildSocialText(post, config, teamId = null, forcedTypes = null) {
  const types = forcedTypes || classifyTypes(post, config);
  const author = post.author?.display_name || post.author?.username || 'Unknown';
  const handle = post.author?.username ? `@${post.author.username}` : '';
  const followers = post.author?.followers_count
    ? `${(post.author.followers_count / 1000).toFixed(0)}K followers`
    : '';
  const time = formatTime(post.created_at);
  const text = (post.text_preview || '').replace(/https?:\/\/\S+/g, '').trim();
  const metrics = post.latest_metrics || {};

  let tag;
  if (config.teamScoped) {
    const type = primaryType(types.length ? types : ['breaking'], config);
    const team = config.teams[teamId];
    tag = `${type.emoji} *${type.label}* — ${team.emoji} ${team.label}`;
  } else {
    const isBreaking = types.includes('breaking');
    tag = isBreaking ? '🚨 *BREAKING*' : '𝕏 *X POST*';
  }

  return `${tag}\n*<${post.source_url}|${text.slice(0, 200)}${text.length > 200 ? '…' : ''}>*\n𝕏 *${author}* ${handle}  ·  ${followers}  ·  🕐 ${time}\n❤️ ${metrics.likes || 0}  🔁 ${metrics.reposts || 0}  💬 ${metrics.replies || 0}  👁 ${metrics.views || 0}`;
}

function buildTransactionText(transaction, config, teamId) {
  const team = config.teams[teamId];
  const transactionType = transaction.transactionType || 'Transaction';
  const typeEmoji = transactionType.toLowerCase().includes('il') ? '🏥' : '🔄';
  const fromName = transaction.fromTeam?.name || transaction.fromTeam || '';
  const toName = transaction.toTeam?.name || transaction.toTeam || '';
  const fromTo = fromName && toName ? `${fromName} → ${toName}` : fromName || toName;
  const description = transaction.description || fromTo || 'No description available';
  const player = transaction.player?.fullName || transaction.player || 'Unknown';

  return `${typeEmoji} *TRANSACTION* — ${team.emoji} ${team.label}\n*${player}* — ${transactionType}\n${description}\n🏟️ MLB Official Transactions  ·  📅 ${transaction.effectiveDate || transaction.date}`;
}

function baseUrl() {
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : DEFAULT_BASE_URL;
}

async function fetchNewsFromProxy(query, deps) {
  const url = new URL(`${deps.baseUrl()}/api/news?q=${encodeURIComponent(query)}&pageSize=20`);
  const { body } = await deps.requestJSON(url.hostname, url.pathname + url.search);
  return Array.isArray(body.articles) ? body.articles : [];
}

async function fetchNewsFromGNews(query, deps) {
  const apiKey = process.env.GNEWS_API_KEY || '';
  if (!apiKey) return [];
  const path = `/v4/search?q=${encodeURIComponent(query)}&lang=en&max=10&token=${apiKey}&sortby=publishedAt`;
  const { status, body } = await deps.requestJSON('gnews.io', path);
  if (status !== 200 || !Array.isArray(body.articles)) return [];
  return body.articles.map((article) => ({
    title: article.title,
    description: article.description,
    url: article.url,
    publishedAt: article.publishedAt,
    source: { name: article.source?.name },
  }));
}

async function fetchArticles(config, deps) {
  const fetchOne = config.newsProvider === 'gnews'
    ? (query) => fetchNewsFromGNews(query, deps)
    : (query) => fetchNewsFromProxy(query, deps);

  return Promise.all(config.queries.map(async (query) => {
    try {
      return await fetchOne(query);
    } catch (error) {
      return [];
    }
  }));
}

async function fetchSocialPosts(config, deps, now) {
  try {
    const createdAfter = new Date(now - config.freshnessMs).toISOString();
    const { status, body } = await deps.fetchSignalPosts({
      limit: 200,
      metrics: 'latest',
      created_after: createdAfter,
    });
    if (status !== 200 || !Array.isArray(body.items)) return [];

    if (config.teamScoped) return body.items;

    return body.items.filter((post) => {
      const leagues = [
        ...(post.matched_leagues || []),
        ...(post.matched_streams || []),
      ].map((value) => String(value).toUpperCase());
      const text = `${post.text_preview || ''} ${categoryText(post)}`.toLowerCase();
      return leagues.includes(config.league) || matchTeamsFromText(text, config).length > 0;
    });
  } catch (error) {
    return [];
  }
}

async function fetchTransactions(deps, now) {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 1);
  const endDate = end.toISOString().split('T')[0];
  const startDate = start.toISOString().split('T')[0];
  const path = `/api/v1/transactions?startDate=${startDate}&endDate=${endDate}&sportId=1`;

  try {
    const { body } = await deps.requestJSON('statsapi.mlb.com', path);
    return Array.isArray(body.transactions) ? body.transactions : [];
  } catch (error) {
    return [];
  }
}

function articleAgeIsFresh(article, now, freshnessMs) {
  const age = now - new Date(article.publishedAt).getTime();
  return !Number.isNaN(age) && age <= freshnessMs;
}

function postAgeIsFresh(post, now, freshnessMs) {
  const age = now - new Date(post.created_at).getTime();
  return !Number.isNaN(age) && age <= freshnessMs;
}

function dedupeArticles(newsResults) {
  const seenUrls = new Set();
  const articles = [];
  for (const result of newsResults) {
    for (const article of result) {
      if (!article?.url || seenUrls.has(article.url)) continue;
      seenUrls.add(article.url);
      articles.push(article);
    }
  }
  return articles;
}

function isBreakingStream(post, config) {
  const streams = Array.isArray(post.matched_streams) ? post.matched_streams : [];
  if (config.id === 'mlb') return streams.includes('Breaking MLB');
  return streams.some((stream) => String(stream).toLowerCase().includes('breaking'));
}

function transactionTeams(transaction, config) {
  const fromName = String(transaction.fromTeam?.name || transaction.fromTeam || '').toLowerCase();
  const toName = String(transaction.toTeam?.name || transaction.toTeam || '').toLowerCase();
  const description = String(transaction.description || '').toLowerCase();
  return Object.entries(config.teams)
    .filter(([, team]) => (team.keywords || []).some((keyword) => (
      fromName.includes(keyword) || toName.includes(keyword) || description.includes(keyword)
    )))
    .map(([id]) => id);
}

async function runAlertCycle(config, deps = {}) {
  validateAlertConfig(config);
  const runtime = {
    requestJSON,
    fetchSignalPosts,
    postToGoogleChat,
    baseUrl,
    now: () => Date.now(),
    ...deps,
  };
  const now = runtime.now();
  const state = deps.state || stateFor(config);
  const webhookUrl = deps.webhookUrl || process.env[config.webhookEnv] || '';
  if (!webhookUrl) {
    const error = new Error(`${config.webhookEnv} environment variable not set`);
    error.code = 'WEBHOOK_MISSING';
    throw error;
  }

  const [newsResults, posts, transactions] = await Promise.all([
    fetchArticles(config, runtime),
    fetchSocialPosts(config, runtime, now),
    config.includeTransactions ? fetchTransactions(runtime, now) : Promise.resolve([]),
  ]);

  const articles = dedupeArticles(newsResults);
  const alerts = [];
  const errors = [];

  for (const article of articles) {
    if (!article.title || article.title === '[Removed]') continue;
    if (state.articleIds.has(article.url)) continue;
    if (!articleAgeIsFresh(article, now, config.freshnessMs)) continue;

    if (config.teamScoped) {
      const teams = matchTeams(article, config);
      if (!teams.length) continue;
      state.articleIds.add(article.url);
      for (const teamId of teams) {
        try {
          await runtime.postToGoogleChat(webhookUrl, buildNewsText(article, config, teamId));
          alerts.push({ type: 'news', team: teamId, title: article.title });
        } catch (error) {
          errors.push({ team: teamId, error: error.message });
        }
      }
    } else {
      state.articleIds.add(article.url);
      try {
        await runtime.postToGoogleChat(webhookUrl, buildNewsText(article, config));
        alerts.push({ type: 'news', title: article.title.slice(0, 60) });
      } catch (error) {
        errors.push(error.message);
      }
    }
  }

  for (const post of posts) {
    const id = post.post_id || post.id;
    if (!id || state.postIds.has(id)) continue;
    if (!postAgeIsFresh(post, now, config.freshnessMs)) continue;

    const types = classifyTypes(post, config);
    const breaking = isBreakingStream(post, config);

    if (config.teamScoped) {
      if (!breaking && !types.length) continue;
      const teams = matchTeams(post, config);
      if (!teams.length) continue;
      if (!types.length) types.push('breaking');
      state.postIds.add(id);
      for (const teamId of teams) {
        try {
          await runtime.postToGoogleChat(webhookUrl, buildSocialText(post, config, teamId, types));
          alerts.push({ type: 'social', team: teamId, text: post.text_preview?.slice(0, 60) });
        } catch (error) {
          errors.push({ team: teamId, error: error.message });
        }
      }
    } else {
      const teams = matchTeamsFromText(socialMatchText(post), config);
      if (!breaking && !teams.length) continue;
      state.postIds.add(id);
      try {
        await runtime.postToGoogleChat(webhookUrl, buildSocialText(post, config, null, types));
        alerts.push({ type: 'social', text: post.text_preview?.slice(0, 60) });
      } catch (error) {
        errors.push(error.message);
      }
    }
  }

  if (config.includeTransactions) {
    const today = new Date(now).toISOString().split('T')[0];
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split('T')[0];

    for (const transaction of transactions) {
      const id = `txn-${transaction.id}`;
      if (state.transactionIds.has(id)) continue;
      const transactionDate = transaction.effectiveDate || transaction.date || '';
      if (!transactionDate.startsWith(today) && !transactionDate.startsWith(yesterday)) continue;
      const teams = transactionTeams(transaction, config);
      if (!teams.length) continue;
      state.transactionIds.add(id);

      for (const teamId of teams) {
        try {
          await runtime.postToGoogleChat(webhookUrl, buildTransactionText(transaction, config, teamId));
          alerts.push({
            type: 'transaction',
            team: teamId,
            player: transaction.player?.fullName || transaction.player,
          });
        } catch (error) {
          errors.push({ team: teamId, error: error.message });
        }
      }
    }
  }

  state.articleIds = trimSet(state.articleIds);
  state.postIds = trimSet(state.postIds);
  state.transactionIds = trimSet(state.transactionIds);
  if (!deps.state) stateByLeague.set(config.id, state);

  return {
    success: true,
    alerts_sent: alerts.length,
    alerts,
    errors,
    debug: config.teamScoped
      ? {
          articles_fetched: articles.length,
          transactions_fetched: transactions.length,
          posts_fetched: posts.length,
          today: new Date(now).toISOString().split('T')[0],
        }
      : {
          articles_checked: articles.length,
          posts_checked: posts.length,
          today: new Date(now).toISOString(),
        },
  };
}

function createAlertHandler(config, deps = {}) {
  validateAlertConfig(config);

  return async function alertHandler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    if (!authorizeAlertRequest(req, res)) return;

    try {
      const result = await runAlertCycle(config, deps);
      res.status(200).json(result);
    } catch (error) {
      if (error.code === 'WEBHOOK_MISSING') {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(500).json({ success: false, error: error.message });
    }
  };
}

module.exports = {
  buildNewsText,
  buildSocialText,
  buildTransactionText,
  classifyTypes,
  createAlertHandler,
  matchTeams,
  matchTeamsFromText,
  primaryType,
  runAlertCycle,
};
