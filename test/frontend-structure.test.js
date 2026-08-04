'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

assert.match(html, /<link rel="stylesheet" href="\/styles\.css">/);
assert.match(html, /<script src="\/app\.js"><\/script>/);
assert.doesNotMatch(html, /<style(?:\s|>)/i);
assert.doesNotMatch(html, /<script>(?:.|\n)*?<\/script>/i);

assert.ok(css.length > 1000, 'styles.css should contain the extracted dashboard styles');
assert.ok(js.length > 5000, 'app.js should contain the extracted dashboard JavaScript');

assert.match(css, /\.header\{/);
assert.match(css, /\.cards-grid\{/);
assert.match(js, /const LEAGUES = \{/);
assert.match(js, /window\.addEventListener\('load', fetchAll\)/);

console.log('frontend structure tests passed');
