'use strict';

const assert = require('node:assert/strict');
const { authorizeAlertRequest } = require('../lib/alert-auth');

function mockResponse() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function requestWithAuthorization(value) {
  return {
    headers: value ? { authorization: value } : {},
  };
}

const originalAlertSecret = process.env.ALERTS_SECRET;
const originalCronSecret = process.env.CRON_SECRET;

try {
  delete process.env.ALERTS_SECRET;
  delete process.env.CRON_SECRET;

  let res = mockResponse();
  assert.equal(authorizeAlertRequest(requestWithAuthorization(), res), false);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.error, 'Alert authentication is not configured');

  process.env.ALERTS_SECRET = 'test-secret';

  res = mockResponse();
  assert.equal(authorizeAlertRequest(requestWithAuthorization(), res), false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.error, 'Unauthorized');

  res = mockResponse();
  assert.equal(
    authorizeAlertRequest(
      requestWithAuthorization('Bearer wrong-value'),
      res
    ),
    false
  );
  assert.equal(res.statusCode, 401);

  res = mockResponse();
  assert.equal(
    authorizeAlertRequest(
      requestWithAuthorization('Bearer test-secret'),
      res
    ),
    true
  );
  assert.equal(res.statusCode, null);

  delete process.env.ALERTS_SECRET;
  process.env.CRON_SECRET = 'cron-secret';

  res = mockResponse();
  assert.equal(
    authorizeAlertRequest(
      requestWithAuthorization('Bearer cron-secret'),
      res
    ),
    true
  );

  console.log('alert authentication tests passed');
} finally {
  if (originalAlertSecret === undefined) {
    delete process.env.ALERTS_SECRET;
  } else {
    process.env.ALERTS_SECRET = originalAlertSecret;
  }

  if (originalCronSecret === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = originalCronSecret;
  }
}
