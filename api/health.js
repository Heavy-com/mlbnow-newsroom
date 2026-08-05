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

  const components = {
    dashboard_feeds: signalConfigured && newsConfigured,
    alert_sources: signalConfigured && newsConfigured && gnewsConfigured,
    alert_delivery: alertAuthConfigured && allChatWebhooksConfigured,
  };

  const warnings = [];
  if (!components.dashboard_feeds) {
    warnings.push('One or more dashboard feed integrations are unavailable.');
  }
  if (!components.alert_sources) {
    warnings.push('One or more alert source integrations are unavailable.');
  }
  if (!components.alert_delivery) {
    warnings.push('Alert authentication or delivery configuration is incomplete.');
  }

  const ok = Object.values(components).every(Boolean);

  return res.status(200).json({
    ok,
    status: ok ? 'healthy' : 'degraded',
    version: '2.1.0-proxy-hardening',
    components,
    warnings,
    time: new Date().toISOString(),
  });
};
