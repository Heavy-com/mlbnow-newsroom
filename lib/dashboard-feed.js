'use strict';

const { getFeedConfig } = require('./feed-config');
const { fetchNewsQuery } = require('./news-source');
const { fetchSignalFeed } = require('./signal-source');
const { fetchTransactionsFeed } = require('./transactions-source');
const { serializeSourceError } = require('./source-error');

function dedupeArticles(groups) {
  const seen = new Set();
  const articles = [];

  for (const group of groups) {
    for (const article of group) {
      if (!article?.url || seen.has(article.url)) continue;
      seen.add(article.url);
      articles.push(article);
    }
  }

  return articles;
}

function statusFor(successes, failures, enabled = true) {
  if (!enabled) return 'skipped';
  if (failures === 0) return 'ok';
  return successes > 0 ? 'partial' : 'error';
}

async function buildDashboardFeed(leagueId, deps = {}) {
  const config = getFeedConfig(leagueId);
  const runtime = {
    fetchNewsQuery,
    fetchSignalFeed,
    fetchTransactionsFeed,
    now: () => Date.now(),
    ...deps,
  };

  const newsSettled = await Promise.allSettled(
    config.queries.map((query) => runtime.fetchNewsQuery(query, 20))
  );

  const newsGroups = [];
  const sourceErrors = [];
  let newsSuccesses = 0;

  newsSettled.forEach((result, index) => {
    const query = config.queries[index];
    if (
      result.status === 'fulfilled'
      && Array.isArray(result.value?.articles)
    ) {
      newsSuccesses += 1;
      newsGroups.push(result.value.articles);
      return;
    }

    const error = result.status === 'rejected'
      ? result.reason
      : new Error('News source returned an invalid response');
    sourceErrors.push(serializeSourceError(error, 'newsapi', { query }));
  });

  let social = [];
  let signalSuccesses = 0;
  if (config.hasSocial) {
    try {
      const signal = await runtime.fetchSignalFeed({
        limit: 200,
        metrics: 'latest',
      });
      social = Array.isArray(signal.items) ? signal.items : [];
      signalSuccesses = 1;
    } catch (error) {
      sourceErrors.push(serializeSourceError(error, 'signal'));
    }
  }

  let transactions = [];
  let transactionSuccesses = 0;
  if (config.hasTransactions) {
    try {
      const transactionFeed = await runtime.fetchTransactionsFeed();
      transactions = Array.isArray(transactionFeed.transactions)
        ? transactionFeed.transactions
        : [];
      transactionSuccesses = 1;
    } catch (error) {
      sourceErrors.push(serializeSourceError(error, 'mlb_transactions'));
    }
  }

  const enabledSourceCount =
    config.queries.length
    + (config.hasSocial ? 1 : 0)
    + (config.hasTransactions ? 1 : 0);
  const successfulSourceCount =
    newsSuccesses + signalSuccesses + transactionSuccesses;

  const result = {
    league: config.id,
    league_label: config.league,
    available: successfulSourceCount > 0,
    partial: sourceErrors.length > 0,
    news: dedupeArticles(newsGroups),
    social,
    transactions,
    source_status: {
      news: statusFor(
        newsSuccesses,
        config.queries.length - newsSuccesses
      ),
      signal: statusFor(
        signalSuccesses,
        config.hasSocial ? 1 - signalSuccesses : 0,
        config.hasSocial
      ),
      transactions: statusFor(
        transactionSuccesses,
        config.hasTransactions ? 1 - transactionSuccesses : 0,
        config.hasTransactions
      ),
    },
    source_errors: sourceErrors,
    successful_sources: successfulSourceCount,
    enabled_sources: enabledSourceCount,
    fetchedAt: new Date(runtime.now()).toISOString(),
  };

  return result;
}

module.exports = {
  buildDashboardFeed,
};
