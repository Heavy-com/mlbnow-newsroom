'use strict';

const ALLOWED_NEWS_QUERIES = Object.freeze([
  'MLB trade roster move baseball',
  'MLB injury baseball player',
  'Yankees Dodgers Mets Red Sox Astros Cubs Braves baseball news',
  'Phillies Padres Mariners Orioles Cardinals Rangers Blue Jays baseball news',
  'NFL trade signing free agent roster move',
  'NFL injury quarterback receiver',
  'Cowboys Patriots Eagles Chiefs Bears Giants NFL news',
  'Rams Steelers Ravens 49ers Packers Seahawks NFL news',
  'NBA trade signing free agent roster move',
  'NBA injury player out',
  'Lakers Celtics Warriors Knicks Bulls Heat NBA news',
  'Bucks Suns Nuggets Clippers Nets Mavericks NBA news',
  'NHL trade signing free agent roster move',
  'NHL injury player out',
  'Rangers Bruins Maple Leafs Canadiens Penguins Capitals NHL news',
  'Oilers Avalanche Lightning Panthers Kings Sharks NHL news',
  'Yankees Dodgers Mets Red Sox baseball breaking news',
  'Yankees Dodgers Mets Red Sox trade injury roster',
  'MLB breaking news trade signing',
  'MLB injury roster move designated for assignment',
]);

const ALLOWED_NEWS_QUERY_SET = new Set(ALLOWED_NEWS_QUERIES);
const NEWS_PAGE_SIZE_MAX = 20;
const SIGNAL_LIMIT_MAX = 200;
const NEWS_PARAMS = new Set(['q', 'pageSize', 'sortBy']);
const SIGNAL_PARAMS = new Set(['limit', 'metrics']);

function firstUnsupportedParam(searchParams, allowed) {
  for (const key of searchParams.keys()) {
    if (!allowed.has(key)) return key;
  }
  return null;
}

function clampPositiveInteger(value, fallback, maximum) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(maximum, parsed));
}

function invalid(code, error) {
  return { ok: false, status: 400, code, error };
}

function normalizeNewsRequest(searchParams) {
  const unsupported = firstUnsupportedParam(searchParams, NEWS_PARAMS);
  if (unsupported) {
    return invalid(
      'UNSUPPORTED_QUERY_PARAMETER',
      `Unsupported news query parameter: ${unsupported}`
    );
  }

  const query = String(searchParams.get('q') || '').trim();
  if (!query) {
    return invalid('NEWS_QUERY_REQUIRED', 'A supported news query is required.');
  }
  if (!ALLOWED_NEWS_QUERY_SET.has(query)) {
    return invalid(
      'NEWS_QUERY_NOT_ALLOWED',
      'This news query is not approved for the newsroom dashboard.'
    );
  }

  const sortBy = searchParams.get('sortBy') || 'publishedAt';
  if (sortBy !== 'publishedAt') {
    return invalid(
      'NEWS_SORT_NOT_ALLOWED',
      'News results may only be sorted by publishedAt.'
    );
  }

  return {
    ok: true,
    query,
    pageSize: clampPositiveInteger(
      searchParams.get('pageSize'),
      NEWS_PAGE_SIZE_MAX,
      NEWS_PAGE_SIZE_MAX
    ),
    sortBy: 'publishedAt',
  };
}

function normalizeSignalRequest(searchParams) {
  const unsupported = firstUnsupportedParam(searchParams, SIGNAL_PARAMS);
  if (unsupported) {
    return invalid(
      'UNSUPPORTED_QUERY_PARAMETER',
      `Unsupported Signal query parameter: ${unsupported}`
    );
  }

  const metrics = searchParams.get('metrics') || 'latest';
  if (metrics !== 'latest') {
    return invalid(
      'SIGNAL_METRICS_NOT_ALLOWED',
      'The public Signal proxy only supports latest metrics.'
    );
  }

  return {
    ok: true,
    options: {
      limit: clampPositiveInteger(
        searchParams.get('limit'),
        SIGNAL_LIMIT_MAX,
        SIGNAL_LIMIT_MAX
      ),
      metrics: 'latest',
    },
  };
}

function setBoundedCache(cache, key, value, maxEntries) {
  if (!(cache instanceof Map)) throw new TypeError('cache must be a Map');
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new TypeError('maxEntries must be a positive integer');
  }

  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);

  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

function getFreshCache(cache, key, maxAgeMs, now = Date.now()) {
  const entry = cache.get(key);
  if (!entry) return null;

  if (!Number.isFinite(entry.timestamp) || now - entry.timestamp >= maxAgeMs) {
    cache.delete(key);
    return null;
  }

  return entry;
}

module.exports = {
  ALLOWED_NEWS_QUERIES,
  NEWS_PAGE_SIZE_MAX,
  SIGNAL_LIMIT_MAX,
  getFreshCache,
  normalizeNewsRequest,
  normalizeSignalRequest,
  setBoundedCache,
};
