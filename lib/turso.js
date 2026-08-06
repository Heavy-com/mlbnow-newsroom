'use strict';

const https = require('https');

const DEFAULT_TIMEOUT_MS = 20 * 1000;

class TursoError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'TursoError';
    this.code = options.code || 'TURSO_ERROR';
    if (options.status !== undefined) this.status = options.status;
  }
}

function tursoEnv() {
  const url = (process.env.TURSO_DATABASE_URL || '').trim();
  const token = (process.env.TURSO_AUTH_TOKEN || '').trim();
  return { url, token };
}

function isTursoConfigured() {
  const { url, token } = tursoEnv();
  return Boolean(url && token);
}

function pipelineHost(rawUrl) {
  const normalized = String(rawUrl).replace(/^libsql:\/\//, 'https://');
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (error) {
    throw new TursoError('TURSO_DATABASE_URL is not a valid URL', {
      code: 'TURSO_CONFIG_INVALID',
    });
  }
  if (parsed.protocol !== 'https:') {
    throw new TursoError('TURSO_DATABASE_URL must use https:// or libsql://', {
      code: 'TURSO_CONFIG_INVALID',
    });
  }
  return parsed.hostname;
}

function encodeValue(value) {
  if (value === null || value === undefined) return { type: 'null' };
  if (typeof value === 'boolean') {
    return { type: 'integer', value: value ? '1' : '0' };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { type: 'integer', value: String(value) };
    return { type: 'float', value };
  }
  return { type: 'text', value: String(value) };
}

function decodeValue(cell) {
  if (!cell || cell.type === 'null') return null;
  if (cell.type === 'integer') return Number(cell.value);
  if (cell.type === 'float') {
    return typeof cell.value === 'number' ? cell.value : Number(cell.value);
  }
  return cell.value;
}

function defaultTransport({ hostname, token, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname,
      path: '/v2/pipeline',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });

    req.on('timeout', () => req.destroy(
      new TursoError('Turso request timed out', { code: 'TURSO_TIMEOUT' })
    ));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function rowsFromResult(result) {
  const cols = (result.cols || []).map((col) => col && col.name);
  return (result.rows || []).map((cells) => {
    const row = {};
    cells.forEach((cell, index) => {
      row[cols[index] || `col_${index}`] = decodeValue(cell);
    });
    return row;
  });
}

function createTursoClient(options = {}) {
  const env = tursoEnv();
  const url = options.url || env.url;
  const token = options.token || env.token;
  const transport = options.transport || defaultTransport;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  if (!url || !token) {
    throw new TursoError('Turso is not configured', { code: 'TURSO_NOT_CONFIGURED' });
  }

  const hostname = pipelineHost(url);

  async function pipeline(statements) {
    const requests = statements.map((statement) => ({
      type: 'execute',
      stmt: {
        sql: statement.sql,
        args: (statement.args || []).map(encodeValue),
      },
    }));
    requests.push({ type: 'close' });

    const response = await transport({ hostname, token, body: { requests }, timeoutMs });

    if (response.status !== 200) {
      throw new TursoError(
        `Turso HTTP ${response.status}: ${String(response.body).slice(0, 180)}`,
        { code: 'TURSO_HTTP_ERROR', status: response.status }
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(response.body);
    } catch (error) {
      throw new TursoError('Turso returned invalid JSON', { code: 'TURSO_INVALID_JSON' });
    }

    const results = Array.isArray(parsed.results) ? parsed.results : [];

    return statements.map((statement, index) => {
      const entry = results[index];
      if (!entry) {
        throw new TursoError('Turso pipeline result missing', { code: 'TURSO_RESULT_MISSING' });
      }
      if (entry.type === 'error') {
        throw new TursoError(
          entry.error?.message || 'Turso statement failed',
          { code: entry.error?.code || 'TURSO_STATEMENT_ERROR' }
        );
      }
      const result = entry.response?.result || {};
      return {
        rows: rowsFromResult(result),
        rowsAffected: Number(result.affected_row_count || 0),
      };
    });
  }

  return {
    async execute(sql, args = []) {
      const [result] = await pipeline([{ sql, args }]);
      return result;
    },
    async batch(statements) {
      if (!statements.length) return [];
      return pipeline(statements);
    },
  };
}

module.exports = {
  TursoError,
  createTursoClient,
  decodeValue,
  encodeValue,
  isTursoConfigured,
};
