'use strict';

function createSourceError(source, message, details = {}) {
  const error = new Error(message);
  error.source = source;
  error.code = details.code || 'SOURCE_FAILURE';
  error.status = Number.isInteger(details.status) ? details.status : null;
  error.retryable = Boolean(details.retryable);
  if (details.query) error.query = details.query;
  return error;
}

function serializeSourceError(error, fallbackSource = 'unknown', extra = {}) {
  return {
    source: error?.source || fallbackSource,
    code: error?.code || 'SOURCE_FAILURE',
    message: error?.message || 'Source request failed',
    status: Number.isInteger(error?.status) ? error.status : null,
    retryable: Boolean(error?.retryable),
    ...(error?.query ? { query: error.query } : {}),
    ...extra,
  };
}

module.exports = {
  createSourceError,
  serializeSourceError,
};
