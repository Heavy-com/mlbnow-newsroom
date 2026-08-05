'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'lib', 'alert-config.js'), 'utf8');

const appLakers = app.match(/\{id:'lakers',[^\n]+/u)?.[0] || '';
const appMavericks = app.match(/\{id:'mavericks',[^\n]+/u)?.[0] || '';
const configLakers = config.match(/lakers: \{ keywords: \[[^\n]+/u)?.[0] || '';
const configMavericks = config.match(/mavericks: \{ keywords: \[[^\n]+/u)?.[0] || '';

assert.match(appLakers, /'luka'/u);
assert.doesNotMatch(appMavericks, /'luka'/u);
assert.match(configLakers, /'luka'/u);
assert.doesNotMatch(configMavericks, /'luka'/u);

assert.match(app, /id:'mammoth'.*label:'Utah Mammoth'.*'utah hockey club'/u);
assert.doesNotMatch(app, /id:'coyotes'/u);
assert.match(config, /mammoth: \{ keywords: \['utah mammoth'.*'utah hockey club'/u);
assert.doesNotMatch(config, /utah_hc:/u);

assert.match(app, /let fetchRequestId = 0;/u);
assert.match(app, /const requestId = \+\+fetchRequestId;/u);
assert.match(app, /const requestedLeague = activeLeague;/u);
assert.match(app, /leagueCache\[requestedLeague\]/u);
assert.match(app, /TX_ENDPOINTS\[requestedLeague\]/u);
assert.match(app, /requestId !== fetchRequestId \|\| requestedLeague !== activeLeague/u);

assert.doesNotMatch(app, /class="btn-assign"/u);
assert.doesNotMatch(app, /✓ Assigned/u);

console.log('dashboard correctness tests passed');
