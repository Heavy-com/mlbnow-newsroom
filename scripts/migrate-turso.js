'use strict';

// Creates the durable alert state schema on the configured Turso database.
// Usage:
//   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node scripts/migrate-turso.js
// Idempotent: every statement is CREATE ... IF NOT EXISTS.

const fs = require('fs');
const path = require('path');
const { createTursoClient, isTursoConfigured } = require('../lib/turso');

function loadStatements() {
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  return fs.readFileSync(schemaPath, 'utf8')
    .split(';')
    .map((statement) => statement
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim())
    .filter(Boolean);
}

(async () => {
  if (!isTursoConfigured()) {
    console.error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before running the migration.');
    process.exit(1);
  }

  const client = createTursoClient();
  for (const sql of loadStatements()) {
    await client.execute(sql);
    console.log(`ok: ${sql.replace(/\s+/g, ' ').slice(0, 72)}`);
  }

  const check = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
  );
  console.log('tables:', check.rows.map((row) => row.name).join(', '));
  console.log('Turso schema is ready.');
})().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
