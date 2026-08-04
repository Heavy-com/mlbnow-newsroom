'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');

assert.match(html, /<div class="stats-row" id="statsRow">/);
assert.doesNotMatch(
  html,
  /id="statsRow"\s+style="grid-template-columns:repeat\(5,1fr\)"/
);

assert.match(css, /\/\* RESPONSIVE DASHBOARD \*\//);
assert.match(css, /\.stats-row\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\);\}/);
assert.match(css, /@media \(max-width:1050px\)/);
assert.match(css, /@media \(max-width:820px\)/);
assert.match(css, /@media \(max-width:640px\)/);
assert.match(css, /@media \(max-width:440px\)/);
assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);

assert.match(css, /\.main\{display:block;min-height:auto;\}/);
assert.match(css, /#sidebarCats\{\s*display:flex;/);
assert.match(css, /\.cards-grid\{grid-template-columns:minmax\(0,1fr\);\}/);

console.log('responsive layout tests passed');
