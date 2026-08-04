'use strict';

function authorizeAlertRequest(req, res) {
  const secret = process.env.ALERTS_SECRET || process.env.CRON_SECRET || '';
  if (!secret) return true;

  const supplied = req.headers?.authorization || '';
  if (supplied !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

module.exports = { authorizeAlertRequest };
