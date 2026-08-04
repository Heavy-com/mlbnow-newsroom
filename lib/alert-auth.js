'use strict';

const crypto = require('crypto');

function secureCompare(supplied, expected) {
  const suppliedBuffer = Buffer.from(String(supplied));
  const expectedBuffer = Buffer.from(String(expected));

  if (suppliedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function authorizeAlertRequest(req, res) {
  const secret = process.env.ALERTS_SECRET || process.env.CRON_SECRET || '';

  if (!secret) {
    res.status(503).json({
      error: 'Alert authentication is not configured',
    });
    return false;
  }

  const authorization = req.headers?.authorization || '';
  const prefix = 'Bearer ';
  const supplied = authorization.startsWith(prefix)
    ? authorization.slice(prefix.length)
    : '';

  if (!supplied || !secureCompare(supplied, secret)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}

module.exports = { authorizeAlertRequest };
