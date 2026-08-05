'use strict';

const assert = require('node:assert/strict');
const {
  TursoError,
  createTursoClient,
  encodeValue,
  decodeValue,
  isTursoConfigured,
} = require('../lib/turso');

function okResponse(result) {
  return {
    status: 200,
    body: JSON.stringify({
      results: [
        { type: 'ok', response: { type: 'execute', result } },
        { type: 'ok', response: { type: 'close' } },
      ],
    }),
  };
}

async function testEncodingAndDecoding() {
  assert.deepEqual(encodeValue('s'), { type: 'text', value: 's' });
  assert.deepEqual(encodeValue(5), { type: 'integer', value: '5' });
  assert.deepEqual(encodeValue(1.5), { type: 'float', value: 1.5 });
  assert.deepEqual(encodeValue(null), { type: 'null' });
  assert.deepEqual(encodeValue(undefined), { type: 'null' });
  assert.deepEqual(encodeValue(true), { type: 'integer', value: '1' });

  assert.equal(decodeValue({ type: 'text', value: 'x' }), 'x');
  assert.equal(decodeValue({ type: 'integer', value: '7' }), 7);
  assert.equal(decodeValue({ type: 'float', value: 1.5 }), 1.5);
  assert.equal(decodeValue({ type: 'null' }), null);
}

async function testExecuteRequestShapeAndRowDecoding() {
  let captured = null;
  const client = createTursoClient({
    url: 'libsql://alerts-test.turso.io',
    token: 'test-token',
    transport: async (request) => {
      captured = request;
      return okResponse({
        cols: [{ name: 'a' }, { name: 'b' }],
        rows: [
          [{ type: 'text', value: 'x' }, { type: 'integer', value: '7' }],
          [{ type: 'null' }, { type: 'float', value: 1.5 }],
        ],
        affected_row_count: 2,
      });
    },
  });

  const result = await client.execute(
    'INSERT INTO t (a, b, c, d, e) VALUES (?, ?, ?, ?, ?)',
    ['s', 5, 1.5, null, true]
  );

  assert.equal(captured.hostname, 'alerts-test.turso.io');
  assert.equal(captured.token, 'test-token');
  assert.equal(captured.body.requests.length, 2);
  assert.deepEqual(captured.body.requests[1], { type: 'close' });
  assert.deepEqual(captured.body.requests[0].stmt.args, [
    { type: 'text', value: 's' },
    { type: 'integer', value: '5' },
    { type: 'float', value: 1.5 },
    { type: 'null' },
    { type: 'integer', value: '1' },
  ]);
  assert.deepEqual(result.rows, [{ a: 'x', b: 7 }, { a: null, b: 1.5 }]);
  assert.equal(result.rowsAffected, 2);
}

async function testStatementErrorSurfacesAsTursoError() {
  const client = createTursoClient({
    url: 'https://alerts-test.turso.io',
    token: 'test-token',
    transport: async () => ({
      status: 200,
      body: JSON.stringify({
        results: [
          { type: 'error', error: { message: 'no such table: missing', code: 'SQLITE_ERROR' } },
          { type: 'ok', response: { type: 'close' } },
        ],
      }),
    }),
  });

  await assert.rejects(
    () => client.execute('SELECT * FROM missing'),
    (error) => error instanceof TursoError && /no such table/.test(error.message)
  );
}

async function testHttpFailureSurfacesAsTursoError() {
  const client = createTursoClient({
    url: 'https://alerts-test.turso.io',
    token: 'test-token',
    transport: async () => ({ status: 500, body: 'upstream unavailable' }),
  });

  await assert.rejects(
    () => client.execute('SELECT 1'),
    (error) => error instanceof TursoError && /Turso HTTP 500/.test(error.message)
  );
}

async function testConfigurationDetection() {
  const original = {
    url: process.env.TURSO_DATABASE_URL,
    token: process.env.TURSO_AUTH_TOKEN,
  };
  try {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    assert.equal(isTursoConfigured(), false);
    assert.throws(() => createTursoClient(), TursoError);

    process.env.TURSO_DATABASE_URL = 'libsql://alerts-test.turso.io';
    process.env.TURSO_AUTH_TOKEN = 'test-token';
    assert.equal(isTursoConfigured(), true);
  } finally {
    if (original.url === undefined) delete process.env.TURSO_DATABASE_URL;
    else process.env.TURSO_DATABASE_URL = original.url;
    if (original.token === undefined) delete process.env.TURSO_AUTH_TOKEN;
    else process.env.TURSO_AUTH_TOKEN = original.token;
  }
}

Promise.resolve()
  .then(testEncodingAndDecoding)
  .then(testExecuteRequestShapeAndRowDecoding)
  .then(testStatementErrorSurfacesAsTursoError)
  .then(testHttpFailureSurfacesAsTursoError)
  .then(testConfigurationDetection)
  .then(() => console.log('Turso client tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
