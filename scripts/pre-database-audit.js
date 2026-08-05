'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function workflowFiles() {
  const directory = path.join(root, '.github', 'workflows');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => /\.ya?ml$/u.test(name))
    .map((name) => path.join(directory, name));
}

const app = read('public/app.js');
const alertEngine = read('lib/alert-engine.js');
const packageJson = JSON.parse(read('package.json'));
const readme = read('README.md');

assert.ok(fs.existsSync(path.join(root, 'api', 'feed.js')));
assert.ok(fs.existsSync(path.join(root, 'lib', 'dashboard-feed.js')));
assert.ok(fs.existsSync(path.join(root, 'lib', 'source-error.js')));

assert.match(app, /\/api\/feed\?league=/u);
assert.doesNotMatch(app, /class="btn-assign"/u);
assert.doesNotMatch(app, /fetch\(`\/api\/news/u);
assert.doesNotMatch(app, /fetch\('\/api\/nocap/u);
assert.doesNotMatch(app, /TX_ENDPOINTS/u);

assert.match(alertEngine, /source_errors/u);
assert.match(alertEngine, /serializeSourceError/u);
assert.match(packageJson.scripts.test, /final-foundation\.test\.js/u);
assert.match(packageJson.scripts['verify:production'], /verify-production\.sh/u);
assert.match(readme, /\/api\/feed/u);
assert.match(readme, /durable deduplication/u);

for (const file of workflowFiles()) {
  const content = fs.readFileSync(file, 'utf8');
  const callsAlertRoute = /\/api\/(?:alerts|nfl-alerts|nba-alerts|nhl-alerts)/u
    .test(content);
  if (callsAlertRoute) {
    assert.doesNotMatch(
      content,
      /^\s*schedule:\s*$/mu,
      `Automatic alert scheduling must remain disabled: ${path.basename(file)}`
    );
  }
}

console.log('Pre-database repository audit passed.');
console.log('Intentional remaining work:');
console.log('- Login/gate remains skipped.');
console.log('- Database-backed durable deduplication and story claiming are not yet built.');
console.log('- Automatic alerts remain disabled until durable deduplication exists.');
