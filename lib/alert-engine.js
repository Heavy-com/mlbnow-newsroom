'use strict';

const https = require('https');
const { fetchSignalPosts } = require('./signal');
const { authorizeAlertRequest } = require('./alert-auth');
const { validateAlertConfig } = require('./alert-config');
const {
  createMemoryStore,
  createTursoStore,
  getDefaultMemoryStore,
} = require('./alert-store');
const { isTursoConfigured } = require('./turso');
const { createSourceError, serializeSourceError } = require('./source-error');

const REQUEST_TIMEOUT_MS = 12 * 1000;
const DEFAULT_BASE_URL = 'https://heavy-newsroom.vercel.app';
// Google Chat accepts roughly one webhook message per second per space before
// returning 429 RESOURCE_EXHAUSTED. Pace sends and cap how many go out in a
// single cycle; anything skipped is simply picked up on the next run because
// it was never claimed.
const SEND_SPACING_MS = 1100;
const MAX_SENDS_PER_CYCLE = 20;
const CLAIM_STALE_MS = 10 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveStore(config, deps) {
  if (deps.store) return deps.store;
  if (deps.state) return createMemoryStore(deps.state);
  if (isTursoConfigured()) {
    try {
      return createTursoStore();
    } catch (error) {
      // Falling back to memory is safe, but never silently: surface why so a
      // misconfigured database URL or token is visible in the debug output.
      const fallback = getDefaultMemoryStore(config.id);
      fallback.setupError = `${error.code || 'TURSO_INIT_FAILED'}: ${error.message}`;
      return fallback;
    }
  }
  return getDefaultMemoryStore(config.id);
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
      'User-Agent': 'HeavyOnSports/2.2',
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
    throw createSourceError(
      hostname,
      `Upstream returned invalid JSON (${response.status || 'unknown status'})`,
      {
        code: 'UPSTREAM_INVALID_JSON',
        status: response.status,
        retryable: true,
      }
    );
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

// --- story clustering ---------------------------------------------------
// Several accounts report the same story with different wording, which used to
// produce one alert per account. The anchor is the first personal name in the
// post (two consecutive capitalised words that are not team or city terms).
// Posts sharing an anchor on the same day collapse to a single alert. When no
// name is found the post keeps its own key, so clustering never hides a story
// it cannot confidently identify.
const ANCHOR_STOPWORDS = new Set([
  'los', 'angeles', 'new', 'york', 'san', 'francisco', 'diego', 'kansas', 'city',
  'tampa', 'bay', 'st', 'saint', 'louis', 'las', 'vegas', 'red', 'sox', 'white',
  'blue', 'jays', 'major', 'league', 'baseball', 'football', 'basketball',
  'hockey', 'the', 'this', 'that', 'what', 'why', 'how', 'who', 'when', 'where',
  'breaking', 'injury', 'update', 'report', 'sources', 'source', 'per', 'via',
  'official', 'officially', 'just', 'now', 'today', 'tonight', 'first', 'last',
  'free', 'agent', 'trade', 'deal', 'news', 'watch', 'read', 'more', 'day',
  'hall', 'fame', 'pro', 'photos', 'video', 'game', 'series', 'world',
]);

function teamWordSet(config) {
  const words = new Set();
  for (const team of Object.values(config.teams || {})) {
    for (const keyword of team.keywords || []) {
      for (const word of String(keyword).toLowerCase().split(/\s+/)) {
        if (word) words.add(word);
      }
    }
    for (const word of String(team.label || '').toLowerCase().split(/\s+/)) {
      if (word) words.add(word);
    }
  }
  return words;
}

function storyAnchor(text, config) {
  const cleaned = String(text || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[@#]\w+/g, ' ')
    .replace(/^RT\b:?/i, ' ')
    .replace(/[^A-Za-z\s'.-]/g, ' ');

  const words = cleaned.split(/\s+/).filter(Boolean);
  const teamWords = teamWordSet(config);

  const isName = (word) => {
    const bare = word.replace(/[^A-Za-z'-]/g, '');
    if (bare.length < 3) return false;
    if (bare === bare.toUpperCase()) return false;
    if (!/^[A-Z]/.test(bare)) return false;
    const lower = bare.toLowerCase();
    return !ANCHOR_STOPWORDS.has(lower) && !teamWords.has(lower);
  };

  for (let i = 0; i < words.length - 1; i += 1) {
    if (isName(words[i]) && isName(words[i + 1])) {
      return `${words[i]} ${words[i + 1]}`
        .toLowerCase()
        .replace(/[^a-z\s'-]/g, '')
        .trim();
    }
  }
  return null;
}

function socialDeliveryKey(post, config, now, teamId) {
  const anchor = storyAnchor(post.text_preview || post.text, config);
  if (!anchor) return deliveryKey(post.post_id || post.id, teamId);
  const day = new Date(now).toISOString().split('T')[0];
  return `story::${anchor}::${day}${teamId ? `::${teamId}` : ''}`;
}

function deliveryKey(itemId, teamId = null) {
  return teamId ? `${itemId}::${teamId}` : String(itemId);
}

function assertSuccessfulGoogleChatResponse(response) {
  const status = Number(response?.status);
  if (Number.isInteger(status) && status >= 200 && status < 300) {
    return response;
  }

  const statusText = Number.isInteger(status) ? `HTTP ${status}` : 'missing HTTP status';
  const detail = String(response?.body || '').trim().slice(0, 180);
  const error = new Error(
    `Google Chat webhook failed (${statusText})${detail ? `: ${detail}` : ''}`
  );
  error.code = 'GOOGLE_CHAT_DELIVERY_FAILED';
  error.status = Number.isInteger(status) ? status : 0;
  throw error;
}

async function deliverToGoogleChat(runtime, webhookUrl, text) {
  const response = await runtime.postToGoogleChat(webhookUrl, text);
  return assertSuccessfulGoogleChatResponse(response);
}

function itemText(item) {
  return `${item.title || item.text_preview || item.text || ''} ${item.description || ''}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function socialMatchText(post) {
  return `${post.text_preview || post.text || ''} ${post.author?.display_name || ''}`.toLowerCase();
}

function categoryNames(post) {
  const categories = Array.isArray(post.categories) ? post.categories : [];
  return categories
    .map((entry) => typeof entry === 'string' ? entry : entry?.category)
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
}

function categoryText(post) {
  return categoryNames(post).join(' ');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordMatches(text, keyword) {
  const normalizedKeyword = String(keyword || '').trim().toLowerCase();
  if (!normalizedKeyword) return false;

  const pattern = normalizedKeyword
    .split(/\s+/)
    .map(escapeRegExp)
    .join('\\s+');
  return new RegExp(`(?:^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`, 'i').test(text);
}

const NON_BREAKING_USES = [
  /\bbreaking down\b/i,
  /\bbreaks down\b/i,
  /\bbreakdown\b/i,
  /\bnews of (?:the )?.{0,80}\bbreaking\b/i,
  /\bafter (?:the )?news.{0,80}\bbroke\b/i,
];

const TRADE_DISCUSSION_USES = [
  /\btrade deadline\b/i,
  /\bpotential (?:.+ )?trade\b/i,
  /\btrade possibility\b/i,
  /\btrade destination\b/i,
  /\bcould be traded\b/i,
  /\bshould (?:.+ )?trade\b/i,
  /\bwould (?:.+ )?trade\b/i,
  /\bno other trades?\b/i,
  /\bdid not acquire\b/i,
  /\bdeadline (?:grade|recap|review|reaction|analysis)\b/i,
  /\bnews of (?:the )?.{0,80}\btrade breaking\b/i,
];

const MLB_SOCIAL_NOISE = [
  /\breaction\b/i,
  /\brecap(?:ping)?\b/i,
  /\bpreview(?:s|ing)?\b/i,
  /\bwhat grade would you give\b/i,
  /\bweighs? in\b/i,
  /\bthoughts? on\b/i,
  /\bbreaking down\b/i,
  /\bbreaks down\b/i,
  /\bpodcast\b/i,
  /\btune in\b/i,
  /\bwatch and stream\b/i,
  /\bstream live\b/i,
  /\bfree to read\b/i,
  /\bupdated story\b/i,
  /\bicymi\b/i,
];

const HIGH_CONFIDENCE_NEWS_LANGUAGE = [
  /(?:^|[.!?]\s*)breaking:/i,
  /\bsource confirms?\b/i,
  /\bmade it official\b/i,
  /\bhas been traded\b/i,
  /\bare acquiring\b/i,
  /\bis acquiring\b/i,
  /\bhave acquired\b/i,
  /\bhas acquired\b/i,
  /\bagreed to (?:a )?(?:trade|deal|contract)\b/i,
  /\bplaced .{0,60} on (?:the )?(?:injured list|il)\b/i,
  /\bwill miss (?:the )?remainder\b/i,
  /\bout for (?:the )?season\b/i,
  /\bannounced (?:that )?.{0,80}(?:traded|acquired|signed|released|fired|hired)\b/i,
];

function upstreamMessage(value, fallback) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object') {
    const nested = value.message || value.detail || value.error;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
    try {
      return JSON.stringify(value).slice(0, 200);
    } catch (error) {
      return fallback;
    }
  }
  return fallback;
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function isNonBreakingUsage(text) {
  return matchesAny(text, NON_BREAKING_USES);
}

function isTradeDiscussionOnly(text) {
  return matchesAny(text, TRADE_DISCUSSION_USES);
}

function hasHighConfidenceNewsLanguage(text) {
  return matchesAny(text, HIGH_CONFIDENCE_NEWS_LANGUAGE);
}

function classifyTypes(item, config) {
  const text = itemText(item);
  const categories = new Set(categoryNames(item));
  const types = [];
  const streams = Array.isArray(item.matched_streams) ? item.matched_streams : [];

  const categoryBreaking = ['breaking', 'breaking_news', 'newsbreaker']
    .some((value) => categories.has(value));
  const categoryTrade = ['trade', 'trades', 'transaction', 'signing', 'free_agency']
    .some((value) => categories.has(value));
  const categoryInjury = ['injury', 'injured', 'injury_update']
    .some((value) => categories.has(value));

  const breakingKeyword = config.breakingKeywords.some((keyword) => keywordMatches(text, keyword));
  const tradeKeyword = config.tradeKeywords.some((keyword) => keywordMatches(text, keyword));
  const injuryKeyword = config.injuryKeywords.some((keyword) => keywordMatches(text, keyword));
  const streamBreaking = streams.some((stream) => String(stream).toLowerCase().includes('breaking'));

  if (
    categoryBreaking
    || (breakingKeyword && !isNonBreakingUsage(text))
    || (config.id !== 'mlb' && streamBreaking && !isNonBreakingUsage(text))
  ) {
    types.push('breaking');
  }
  if (categoryTrade || (tradeKeyword && !isTradeDiscussionOnly(text))) types.push('trade');
  if (categoryInjury || injuryKeyword) types.push('injury');
  return types;
}

function shouldAlertMlbSocialPost(post, types) {
  if (!types.length) return { alert: false, reason: 'no_alert_type' };

  const text = itemText(post);
  const highConfidence = hasHighConfidenceNewsLanguage(text);

  if (types.includes('breaking') && isNonBreakingUsage(text) && !highConfidence) {
    return { alert: false, reason: 'non_breaking_usage' };
  }
  if (types.includes('trade') && isTradeDiscussionOnly(text) && !highConfidence) {
    return { alert: false, reason: 'trade_discussion' };
  }
  if (matchesAny(text, MLB_SOCIAL_NOISE) && !highConfidence) {
    return { alert: false, reason: 'analysis_or_promotion' };
  }

  return { alert: true, reason: 'qualified' };
}

function cleanTransactionType(transaction) {
  const supplied = String(transaction?.transactionType || '').trim();
  if (supplied && !['undefined', 'null', 'n/a'].includes(supplied.toLowerCase())) {
    return supplied;
  }

  const description = String(transaction?.description || '').toLowerCase();
  const inferred = [
    ['traded', 'Trade'],
    ['acquired', 'Acquired'],
    ['designated', 'Designated for Assignment'],
    ['released', 'Released'],
    ['signed', 'Signed'],
    ['claimed', 'Claimed'],
    ['placed', 'Placed on Injured List'],
    ['activated', 'Activated'],
    ['recalled', 'Recalled'],
    ['optioned', 'Optioned'],
    ['rehab assignment', 'Rehab Assignment'],
  ].find(([phrase]) => description.includes(phrase));

  return inferred ? inferred[1] : 'Transaction';
}

function shouldAlertTransaction(transaction, config) {
  if (config.id !== 'mlb') return true;

  const text = `${cleanTransactionType(transaction)} ${transaction?.description || ''}`.toLowerCase();
  const routine = [
    /\brecalled\b/,
    /\boptioned\b/,
    /\brehab assignment\b/,
    /\boutrighted\b/,
    /\bassigned to\b/,
    /\bminor league contract\b/,
    /\bpaternity list\b/,
    /\bbereavement list\b/,
  ].some((pattern) => pattern.test(text));
  if (routine) return false;

  return [
    /\btraded\b/,
    /\bacquired\b/,
    /\bsigned\b/,
    /\bdesignated for assignment\b/,
    /\breleased\b/,
    /\bclaimed\b/,
    /\bwaiver\b/,
    /\bsuspended\b/,
    /\binjured list\b/,
    /(?:^|\s)il(?:\s|$)/,
  ].some((pattern) => pattern.test(text));
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';

  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/New_York',
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
  const followerCount = Number(post.author?.followers_count || 0);
  const followers = followerCount >= 1000
    ? `${(followerCount / 1000).toFixed(followerCount >= 10000 ? 0 : 1)}K followers`
    : followerCount > 0 ? `${followerCount} followers` : '';
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

  const excerpt = `${text.slice(0, 200)}${text.length > 200 ? '…' : ''}` || 'View source post';
  const linkedText = post.source_url ? `*<${post.source_url}|${excerpt}>*` : `*${excerpt}*`;
  const attribution = [
    `𝕏 *${author}*`,
    handle,
    followers,
    `🕐 ${time}`,
  ].filter(Boolean).join('  ·  ');

  return `${tag}\n${linkedText}\n${attribution}\n❤️ ${metrics.likes || 0}  🔁 ${metrics.reposts || 0}  💬 ${metrics.replies || 0}  👁 ${metrics.views || 0}`;
}

function buildTransactionText(transaction, config, teamIds) {
  const ids = Array.isArray(teamIds) ? teamIds : [teamIds];
  const teamLabel = ids
    .map((teamId) => config.teams[teamId])
    .filter(Boolean)
    .map((team) => `${team.emoji} ${team.label}`)
    .join(' + ') || config.league;
  const transactionType = cleanTransactionType(transaction);
  const typeEmoji = /injured list|\bil\b/i.test(transactionType) ? '🏥' : '🔄';
  const fromName = transaction.fromTeam?.name || transaction.fromTeam || '';
  const toName = transaction.toTeam?.name || transaction.toTeam || '';
  const fromTo = fromName && toName ? `${fromName} → ${toName}` : fromName || toName;
  const description = transaction.description || fromTo || 'No description available';
  const player = transaction.person?.fullName || transaction.player?.fullName || transaction.player || 'Multiple players';

  return `${typeEmoji} *TRANSACTION* — ${teamLabel}\n*${player}* — ${transactionType}\n${description}\n🏟️ MLB Official Transactions  ·  📅 ${transaction.effectiveDate || transaction.date}`;
}

function baseUrl() {
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : DEFAULT_BASE_URL;
}

async function fetchNewsFromProxy(query, deps) {
  const url = new URL(
    `${deps.baseUrl()}/api/news?q=${encodeURIComponent(query)}&pageSize=20`
  );
  const { status, body } = await deps.requestJSON(
    url.hostname,
    url.pathname + url.search
  );

  if (status !== 200 || !Array.isArray(body?.articles)) {
    throw createSourceError(
      'newsapi',
      upstreamMessage(body?.message || body?.error, 'News proxy request failed'),
      {
        code: 'NEWS_PROXY_FAILURE',
        status,
        retryable: status === 429 || status >= 500,
        query,
      }
    );
  }

  return body.articles;
}

async function fetchNewsFromGNews(query, deps) {
  const apiKey = process.env.GNEWS_API_KEY || '';
  if (!apiKey) {
    throw createSourceError(
      'gnews',
      'GNews integration is not configured',
      {
        code: 'GNEWS_INTEGRATION_UNAVAILABLE',
        retryable: false,
        query,
      }
    );
  }

  const path =
    `/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=10`
    + `&apikey=${encodeURIComponent(apiKey)}&sortby=publishedAt`;
  const { status, body } = await deps.requestJSON('gnews.io', path);

  if (status !== 200 || !Array.isArray(body?.articles)) {
    throw createSourceError(
      'gnews',
      upstreamMessage(body?.errors?.[0] || body?.message, 'GNews request failed'),
      {
        code: status === 429 ? 'UPSTREAM_RATE_LIMIT' : 'GNEWS_FAILURE',
        status,
        retryable: status === 429 || status >= 500,
        query,
      }
    );
  }

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

  const settled = await Promise.allSettled(
    config.queries.map((query) => fetchOne(query))
  );

  const results = [];
  const errors = [];

  settled.forEach((result, index) => {
    const query = config.queries[index];
    if (result.status === 'fulfilled') {
      results.push(result.value);
      return;
    }

    results.push([]);
    errors.push(serializeSourceError(
      result.reason,
      config.newsProvider === 'gnews' ? 'gnews' : 'newsapi',
      { query }
    ));
  });

  return { results, errors };
}

async function fetchSocialPosts(config, deps, now) {
  try {
    const createdAfter = new Date(now - config.freshnessMs).toISOString();
    const { status, body } = await deps.fetchSignalPosts({
      limit: 200,
      metrics: 'latest',
      created_after: createdAfter,
    });

    if (status !== 200 || !Array.isArray(body?.items)) {
      throw createSourceError(
        'signal',
        'Signal source request failed',
        {
          code: status === 429
            ? 'UPSTREAM_RATE_LIMIT'
            : 'SIGNAL_UPSTREAM_FAILURE',
          status,
          retryable: status === 429 || status >= 500,
        }
      );
    }

    const items = config.teamScoped
      ? body.items
      : body.items.filter((post) => {
          const leagues = [
            ...(post.matched_leagues || []),
            ...(post.matched_streams || []),
          ].map((value) => String(value).toUpperCase());
          const text =
            `${post.text_preview || ''} ${categoryText(post)}`.toLowerCase();
          return (
            leagues.includes(config.league)
            || matchTeamsFromText(text, config).length > 0
          );
        });

    return { items, errors: [] };
  } catch (error) {
    return {
      items: [],
      errors: [serializeSourceError(error, 'signal')],
    };
  }
}

async function fetchTransactions(deps, now) {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 1);
  const endDate = end.toISOString().split('T')[0];
  const startDate = start.toISOString().split('T')[0];
  const path =
    `/api/v1/transactions?startDate=${startDate}`
    + `&endDate=${endDate}&sportId=1`;

  try {
    const { status, body } = await deps.requestJSON(
      'statsapi.mlb.com',
      path
    );

    if (status !== 200 || !Array.isArray(body?.transactions)) {
      throw createSourceError(
        'mlb_transactions',
        'MLB transactions source failed',
        {
          code: status === 429
            ? 'UPSTREAM_RATE_LIMIT'
            : 'UPSTREAM_FAILURE',
          status,
          retryable: status === 429 || status >= 500,
        }
      );
    }

    return { items: body.transactions, errors: [] };
  } catch (error) {
    return {
      items: [],
      errors: [serializeSourceError(error, 'mlb_transactions')],
    };
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
  const dryRun = Boolean(deps.dryRun);
  const store = resolveStore(config, deps);
  const nowIso = new Date(now).toISOString();
  const staleBeforeIso = new Date(now - CLAIM_STALE_MS).toISOString();
  const wouldFire = [];
  let sentThisCycle = 0;
  let deferred = 0;
  let lastSendAt = 0;

  // One path for every alert: claim it (the database refuses duplicates),
  // send it, then record the result. On failure the claim is released so the
  // next cycle can retry it.
  async function dispatch(key, meta, text) {
    if (dryRun) {
      let delivered = false;
      try {
        delivered = await store.isDelivered(key, meta);
      } catch (error) {
        delivered = false;
      }
      if (delivered) return { status: 'skipped' };
      wouldFire.push({
        key,
        type: meta.itemType,
        team: meta.teamId || null,
        summary: String(meta.summary || '').slice(0, 100),
      });
      return { status: 'would_fire' };
    }

    if (sentThisCycle >= MAX_SENDS_PER_CYCLE) {
      deferred += 1;
      return { status: 'deferred' };
    }

    let claimed = false;
    try {
      claimed = await store.claim(
        key,
        {
          league: config.id,
          itemType: meta.itemType,
          itemId: meta.itemId,
          teamId: meta.teamId || null,
        },
        nowIso,
        staleBeforeIso
      );
    } catch (error) {
      return { status: 'error', error: `Delivery state unavailable: ${error.message}` };
    }
    if (!claimed) return { status: 'skipped' };

    const sinceLast = Date.now() - lastSendAt;
    if (lastSendAt && sinceLast < SEND_SPACING_MS) {
      await sleep(SEND_SPACING_MS - sinceLast);
    }

    try {
      await deliverToGoogleChat(runtime, webhookUrl, text);
      lastSendAt = Date.now();
    } catch (error) {
      try {
        await store.release(key, error.message, meta);
      } catch (releaseError) { /* audit is best-effort */ }
      return { status: 'error', error: error.message };
    }

    try {
      await store.markSent(key, nowIso, meta);
    } catch (error) { /* already delivered; audit is best-effort */ }
    sentThisCycle += 1;
    return { status: 'sent' };
  }
  const webhookUrl = deps.webhookUrl || process.env[config.webhookEnv] || '';
  if (!webhookUrl) {
    const error = new Error(`${config.webhookEnv} environment variable not set`);
    error.code = 'WEBHOOK_MISSING';
    throw error;
  }

  const [newsSource, socialSource, transactionSource] = await Promise.all([
    config.includeNews === false
      ? Promise.resolve({ results: [], errors: [] })
      : fetchArticles(config, runtime),
    fetchSocialPosts(config, runtime, now),
    config.includeTransactions
      ? fetchTransactions(runtime, now)
      : Promise.resolve({ items: [], errors: [] }),
  ]);

  const newsResults = newsSource.results;
  const posts = socialSource.items;
  const transactions = transactionSource.items;
  const sourceErrors = [
    ...newsSource.errors,
    ...socialSource.errors,
    ...transactionSource.errors,
  ];

  const articles = dedupeArticles(newsResults);
  const alerts = [];
  const errors = [];
  const suppressed = {
    social_no_alert_type: 0,
    social_quality: 0,
    routine_transactions: 0,
  };

  for (const article of articles) {
    if (!article.title || article.title === '[Removed]') continue;
    if (!articleAgeIsFresh(article, now, config.freshnessMs)) continue;

    if (config.teamScoped) {
      const teams = matchTeams(article, config);
      if (!teams.length) continue;

      for (const teamId of teams) {
        const key = deliveryKey(article.url, teamId);
        const outcome = await dispatch(
          key,
          { itemType: 'article', itemId: article.url, teamId, summary: article.title },
          buildNewsText(article, config, teamId)
        );
        if (outcome.status === 'sent') {
          alerts.push({ type: 'news', team: teamId, title: article.title });
        } else if (outcome.status === 'error') {
          errors.push({ team: teamId, error: outcome.error });
        }
      }
    } else {
      const key = deliveryKey(article.url);
      const outcome = await dispatch(
        key,
        { itemType: 'article', itemId: article.url, summary: article.title },
        buildNewsText(article, config)
      );
      if (outcome.status === 'sent') {
        alerts.push({ type: 'news', title: article.title.slice(0, 60) });
      } else if (outcome.status === 'error') {
        errors.push(outcome.error);
      }
    }
  }

  for (const post of posts) {
    const id = post.post_id || post.id;
    if (!id) continue;
    if (!postAgeIsFresh(post, now, config.freshnessMs)) continue;

    const types = classifyTypes(post, config);
    const breaking = isBreakingStream(post, config);

    if (config.teamScoped) {
      if (!types.length) {
        suppressed.social_no_alert_type += 1;
        continue;
      }
      const quality = shouldAlertMlbSocialPost(post, types);
      if (!quality.alert) {
        suppressed.social_quality += 1;
        continue;
      }
      const teams = matchTeams(post, config);
      if (!teams.length) continue;

      for (const teamId of teams) {
        const key = socialDeliveryKey(post, config, now, teamId);
        const outcome = await dispatch(
          key,
          { itemType: 'social', itemId: id, teamId, summary: post.text_preview },
          buildSocialText(post, config, teamId, types)
        );
        if (outcome.status === 'sent') {
          alerts.push({
            type: 'social',
            team: teamId,
            text: post.text_preview?.slice(0, 60),
          });
        } else if (outcome.status === 'error') {
          errors.push({ team: teamId, error: outcome.error });
        }
      }
    } else {
      const teams = matchTeamsFromText(socialMatchText(post), config);
      if (!breaking && !teams.length) continue;
      if (!types.length) {
        suppressed.social_no_alert_type += 1;
        continue;
      }
      const quality = shouldAlertMlbSocialPost(post, types);
      if (!quality.alert) {
        suppressed.social_quality += 1;
        continue;
      }

      const key = socialDeliveryKey(post, config, now, null);
      const outcome = await dispatch(
        key,
        { itemType: 'social', itemId: id, summary: post.text_preview },
        buildSocialText(post, config, null, types)
      );
      if (outcome.status === 'sent') {
        alerts.push({ type: 'social', text: post.text_preview?.slice(0, 60) });
      } else if (outcome.status === 'error') {
        errors.push(outcome.error);
      }
    }
  }

  if (config.includeTransactions) {
    const today = new Date(now).toISOString().split('T')[0];

    for (const transaction of transactions) {
      const id = `txn-${transaction.id}`;
      const transactionDate = transaction.effectiveDate || transaction.date || '';
      if (!transactionDate.startsWith(today)) continue;
      if (!shouldAlertTransaction(transaction, config)) {
        suppressed.routine_transactions += 1;
        continue;
      }
      const teams = transactionTeams(transaction, config);
      if (!teams.length) continue;

      const key = deliveryKey(id);
      const outcome = await dispatch(
        key,
        {
          itemType: 'transaction',
          itemId: id,
          summary: transaction.description || cleanTransactionType(transaction),
        },
        buildTransactionText(transaction, config, teams)
      );
      if (outcome.status === 'sent') {
        alerts.push({
          type: 'transaction',
          team: teams[0],
          teams,
          player: transaction.person?.fullName || transaction.player?.fullName || transaction.player,
        });
      } else if (outcome.status === 'error') {
        errors.push({ teams, error: outcome.error });
      }
    }
  }

  if (typeof store.trim === 'function') store.trim();

  let signalsStored = 0;
  let signalsStoreError = null;
  if (store.mode === 'turso' && !dryRun && posts.length) {
    try {
      signalsStored = await store.upsertSignals(config.id, posts, nowIso);
    } catch (error) {
      signalsStoreError = error.message;
    }
  }

  const success = errors.length === 0 && sourceErrors.length === 0;

  return {
    success,
    status: success ? 'ok' : alerts.length > 0 ? 'degraded' : 'failed',
    alerts_sent: alerts.length,
    alerts,
    errors,
    source_errors: sourceErrors,
    debug: config.teamScoped
      ? {
          articles_fetched: articles.length,
          transactions_fetched: transactions.length,
          posts_fetched: posts.length,
          suppressed,
          store_mode: store.mode,
          ...(store.setupError ? { store_setup_error: store.setupError } : {}),
          dry_run: dryRun,
          deferred_to_next_cycle: deferred,
          ...(signalsStoreError ? { signals_store_error: signalsStoreError } : {}),
          ...(store.mode === 'turso' && !dryRun ? { signals_stored: signalsStored } : {}),
          ...(dryRun ? { would_fire: wouldFire } : {}),
          today: new Date(now).toISOString().split('T')[0],
        }
      : {
          store_mode: store.mode,
          ...(store.setupError ? { store_setup_error: store.setupError } : {}),
          dry_run: dryRun,
          deferred_to_next_cycle: deferred,
          ...(signalsStoreError ? { signals_store_error: signalsStoreError } : {}),
          ...(store.mode === 'turso' && !dryRun ? { signals_stored: signalsStored } : {}),
          ...(dryRun ? { would_fire: wouldFire } : {}),
          articles_checked: articles.length,
          posts_checked: posts.length,
          suppressed,
          today: new Date(now).toISOString(),
        },
  };

}

function requestDryRun(req) {
  let value = req?.query
    ? (req.query.dryRun !== undefined ? req.query.dryRun : req.query.dry_run)
    : undefined;
  if (value === undefined && req?.url) {
    try {
      const parsed = new URL(req.url, 'https://newsroom.local');
      const fromUrl = parsed.searchParams.get('dryRun') ?? parsed.searchParams.get('dry_run');
      if (fromUrl !== null) value = fromUrl;
    } catch (error) {
      value = undefined;
    }
  }
  return value === '1' || value === 'true' || value === true;
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
      const result = await runAlertCycle(config, {
        ...deps,
        dryRun: deps.dryRun !== undefined ? deps.dryRun : requestDryRun(req),
      });
      res.status(result.success ? 200 : 502).json(result);
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
  cleanTransactionType,
  createAlertHandler,
  formatTime,
  matchTeams,
  matchTeamsFromText,
  primaryType,
  requestDryRun,
  runAlertCycle,
  shouldAlertMlbSocialPost,
  shouldAlertTransaction,
  storyAnchor,
};
