const { getSignalCredentials } = require('../lib/signal');

module.exports = async (req, res) => {
  const signal = getSignalCredentials();
  const checks = {
    signal: signal.mode !== 'missing',
    news_api: Boolean(process.env.NEWS_API_KEY),
    gnews_api: Boolean(process.env.GNEWS_API_KEY),
    google_chat_mlb: Boolean(process.env.GCHAT_MLB),
    google_chat_nfl: Boolean(process.env.GCHAT_NFL),
    google_chat_nba: Boolean(process.env.GCHAT_NBA),
    google_chat_nhl: Boolean(process.env.GCHAT_NHL),
    alert_auth: Boolean(process.env.ALERTS_SECRET || process.env.CRON_SECRET),
  };

  const warnings = [];
  if (signal.mode === 'legacy_session') warnings.push('Signal is using a browser session cookie; migrate to a bearer token.');
  if (!checks.alert_auth) warnings.push('Alert endpoints are not protected by ALERTS_SECRET or CRON_SECRET.');
  if (!checks.news_api) warnings.push('NEWS_API_KEY is missing.');

  res.status(200).json({
    ok: checks.signal && checks.news_api,
    version: '2.0.0-signal-adapter',
    signal_auth_mode: signal.mode,
    checks,
    warnings,
    time: new Date().toISOString(),
  });
};
