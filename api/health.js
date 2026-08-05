'use strict';

const { getSignalCredentials } = require('../lib/signal');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const signalConfigured = getSignalCredentials().mode !== 'missing';
  const newsConfigured = Boolean(process.env.NEWS_API_KEY);
  const gnewsConfigured = Boolean(process.env.GNEWS_API_KEY);
  const alertAuthConfigured = Boolean(
    process.env.ALERTS_SECRET || process.env.CRON_SECRET
  );
  const allChatWebhooksConfigured = [
    'GCHAT_MLB',
    'GCHAT_NFL',
    'GCHAT_NBA',
    'GCHAT_NHL',
  ].every((name) => Boolean(process.env[name]));

  // This endpoint intentionally checks configuration only. Live dependency
  // status is reported by /api/feed and scripts/verify-production.sh so a
  // public health request does not consume upstream quotas or hammer vendors.
  const components = {
    dashboard_feeds: signalConfigured,
    alert_sources: signalConfigured,
    alert_delivery: alertAuthConfigured && allChatWebhooksConfigured,
    optional_newsapi: newsConfigured,
    optional_gnews: gnewsConfigured,
  };

  const warnings = [
    'Configuration-only check. Live source status is reported by the league feed endpoints and production verification.',
  ];

  if (!signalConfigured) {
    warnings.push('Signal is not configured; dashboard social feeds and Signal alerts are unavailable.');
  }
  if (!newsConfigured) {
    warnings.push('NewsAPI is not configured; optional web-news results are unavailable.');
  }
  if (!gnewsConfigured) {
    warnings.push('GNews is not configured; optional web-news alert results are unavailable.');
  }
  if (!alertAuthConfigured || !allChatWebhooksConfigured) {
    warnings.push('Alert authentication or Google Chat delivery configuration is incomplete.');
  }

  const ok = components.dashboard_feeds
    && components.alert_sources
    && components.alert_delivery;

  return res.status(200).json({
    ok,
    status: ok ? 'configured' : 'degraded',
    check_scope: 'configuration_only',
    live_dependencies_checked: false,
    version: '2.2.0-signal-filtering',
    components,
    warnings,
    time: new Date().toISOString(),
  });
};
