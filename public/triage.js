'use strict';

let triageLeague = 'mlb';
let triageData = null;
let activeVerdict = 'all';

const VERDICT_ORDER = [
  'alerted',
  'would_alert',
  'no_alert_type',
  'analysis_or_promotion',
  'trade_discussion',
  'non_breaking_usage',
  'no_team_match',
  'stale',
];

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tickClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour12: true });
}

function setTriageLeague(league, button) {
  triageLeague = league;
  activeVerdict = 'all';
  document.querySelectorAll('.league-tab').forEach((tab) => tab.classList.remove('active'));
  if (button) button.classList.add('active');
  loadTriage();
}

function renderSummary() {
  const el = document.getElementById('triageSummary');
  if (!el || !triageData) return;

  const counts = triageData.summary || {};
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const alerted = counts.alerted || 0;
  const wouldAlert = counts.would_alert || 0;
  const filtered = total - alerted - wouldAlert;

  el.innerHTML = `
    <div class="triage-stat"><div class="triage-stat-value">${total}</div><div class="triage-stat-label">posts stored</div></div>
    <div class="triage-stat"><div class="triage-stat-value triage-good">${alerted}</div><div class="triage-stat-label">alerted</div></div>
    <div class="triage-stat"><div class="triage-stat-value triage-warn">${wouldAlert}</div><div class="triage-stat-label">would alert now</div></div>
    <div class="triage-stat"><div class="triage-stat-value triage-muted">${filtered}</div><div class="triage-stat-label">filtered out</div></div>
  `;
}

function renderFilters() {
  const el = document.getElementById('triageFilters');
  if (!el || !triageData) return;

  const counts = triageData.summary || {};
  const labels = triageData.reason_labels || {};
  const present = VERDICT_ORDER.filter((verdict) => counts[verdict]);

  const buttons = [`<button class="triage-chip ${activeVerdict === 'all' ? 'active' : ''}" onclick="setVerdict('all')">All</button>`];
  for (const verdict of present) {
    buttons.push(
      `<button class="triage-chip ${activeVerdict === verdict ? 'active' : ''}" onclick="setVerdict('${verdict}')">`
      + `${escapeHtml(labels[verdict] || verdict)} <span class="triage-chip-count">${counts[verdict]}</span></button>`
    );
  }
  el.innerHTML = buttons.join('');
}

function setVerdict(verdict) {
  activeVerdict = verdict;
  renderFilters();
  renderList();
}

function renderList() {
  const el = document.getElementById('triageList');
  if (!el || !triageData) return;

  const labels = triageData.reason_labels || {};
  const items = (triageData.signals || []).filter(
    (item) => activeVerdict === 'all' || item.verdict === activeVerdict
  );

  if (!items.length) {
    el.innerHTML = '<div class="triage-empty">Nothing stored yet for this league.</div>';
    return;
  }

  el.innerHTML = items.map((item) => {
    const metrics = item.metrics || {};
    const age = item.age_minutes === null || item.age_minutes === undefined
      ? '—'
      : `${item.age_minutes}m ago`;
    const link = item.url
      ? `<a class="triage-post-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">view post →</a>`
      : '';
    const tags = [
      ...(item.types || []).map((type) => `<span class="triage-tag triage-tag-type">${escapeHtml(type)}</span>`),
      ...(item.categories || []).map((cat) => `<span class="triage-tag">${escapeHtml(cat)}</span>`),
      ...(item.teams || []).map((team) => `<span class="triage-tag triage-tag-team">${escapeHtml(team)}</span>`),
    ].join('');

    return `
      <article class="triage-row triage-${escapeHtml(item.verdict)}">
        <div class="triage-row-head">
          <span class="triage-verdict">${escapeHtml(labels[item.verdict] || item.verdict)}</span>
          <span class="triage-author">@${escapeHtml(item.author || 'unknown')}</span>
          <span class="triage-age">${escapeHtml(age)}</span>
        </div>
        <div class="triage-text">${escapeHtml(item.text || '').slice(0, 300)}</div>
        <div class="triage-meta">
          ${tags}
          ${item.anchor ? `<span class="triage-tag triage-tag-anchor">story: ${escapeHtml(item.anchor)}</span>` : ''}
          <span class="triage-metrics">❤️ ${metrics.likes || 0} · 🔁 ${metrics.reposts || 0} · 👁 ${metrics.views || 0}</span>
          ${link}
        </div>
      </article>
    `;
  }).join('');
}

async function loadTriage() {
  const list = document.getElementById('triageList');
  if (list) list.innerHTML = '<div class="triage-empty">Loading…</div>';

  try {
    const response = await fetch(`/api/triage?league=${encodeURIComponent(triageLeague)}&limit=150`);
    const body = await response.json();

    if (!response.ok) {
      const detail = body.detail ? ` ${body.detail}` : '';
      if (list) {
        list.innerHTML = `<div class="triage-empty">${escapeHtml(body.error || 'Request failed')}.${escapeHtml(detail)}</div>`;
      }
      return;
    }

    triageData = body;
    renderSummary();
    renderFilters();
    renderList();
  } catch (error) {
    if (list) list.innerHTML = `<div class="triage-empty">Could not load triage data: ${escapeHtml(error.message)}</div>`;
  }
}

window.addEventListener('load', () => {
  tickClock();
  setInterval(tickClock, 1000);
  loadTriage();
});
