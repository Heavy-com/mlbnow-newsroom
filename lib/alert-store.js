'use strict';

const { createTursoClient } = require('./turso');

const MAX_SEEN_IDS = 500;
const TRIMMED_SEEN_IDS = 200;
const SIGNAL_UPSERT_CHUNK = 15;

function trimSet(set) {
  if (set.size <= MAX_SEEN_IDS) return set;
  return new Set([...set].slice(-TRIMMED_SEEN_IDS));
}

function setKeyForItemType(itemType) {
  if (itemType === 'article') return 'articleIds';
  if (itemType === 'transaction') return 'transactionIds';
  return 'postIds';
}

// Memory mode is the pre-database behavior, kept exactly as it was: only
// successful sends are recorded, failures retry next cycle, and state dies
// with the process. Used when Turso is not configured and by the test suite.
function createMemoryStore(state) {
  const backing = state || {
    articleIds: new Set(),
    postIds: new Set(),
    transactionIds: new Set(),
  };
  for (const key of ['articleIds', 'postIds', 'transactionIds']) {
    if (!(backing[key] instanceof Set)) backing[key] = new Set();
  }

  return {
    mode: 'memory',
    state: backing,
    async claim(key, meta) {
      return !backing[setKeyForItemType(meta && meta.itemType)].has(key);
    },
    async isDelivered(key, meta) {
      if (meta && meta.itemType) {
        return backing[setKeyForItemType(meta.itemType)].has(key);
      }
      return backing.articleIds.has(key)
        || backing.postIds.has(key)
        || backing.transactionIds.has(key);
    },
    async markSent(key, _sentAt, meta) {
      backing[setKeyForItemType(meta && meta.itemType)].add(key);
    },
    async release() {},
    async upsertSignals() { return 0; },
    trim() {
      backing.articleIds = trimSet(backing.articleIds);
      backing.postIds = trimSet(backing.postIds);
      backing.transactionIds = trimSet(backing.transactionIds);
    },
  };
}

const defaultMemoryStores = new Map();

function getDefaultMemoryStore(id) {
  if (!defaultMemoryStores.has(id)) {
    defaultMemoryStores.set(id, createMemoryStore());
  }
  return defaultMemoryStores.get(id);
}

// Durable mode. The claim INSERT is the whole dedupe mechanism: delivery_key
// is the primary key, so the database itself refuses a second row. Only a new
// key wins a claim, or one whose previous attempt failed, or one whose claim
// went stale (process died between claiming and sending).
function createTursoStore(options = {}) {
  const client = options.client || createTursoClient();

  return {
    mode: 'turso',

    async claim(key, meta, nowIso, staleBeforeIso) {
      const { rows } = await client.execute(
        `INSERT INTO alert_deliveries
           (delivery_key, league, item_type, item_id, team_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'claimed', ?)
         ON CONFLICT(delivery_key) DO UPDATE SET
           status = 'claimed',
           created_at = excluded.created_at
         WHERE alert_deliveries.status = 'failed'
            OR (alert_deliveries.status = 'claimed' AND alert_deliveries.created_at < ?)
         RETURNING delivery_key`,
        [
          key,
          meta.league,
          meta.itemType,
          String(meta.itemId === undefined || meta.itemId === null ? '' : meta.itemId),
          meta.teamId === undefined ? null : meta.teamId,
          nowIso,
          staleBeforeIso,
        ]
      );
      return rows.length > 0;
    },

    async isDelivered(key) {
      const { rows } = await client.execute(
        'SELECT status FROM alert_deliveries WHERE delivery_key = ?',
        [key]
      );
      return rows.length > 0 && rows[0].status === 'sent';
    },

    async markSent(key, sentAt) {
      await client.execute(
        `UPDATE alert_deliveries
         SET status = 'sent', sent_at = ?, error = NULL
         WHERE delivery_key = ?`,
        [sentAt, key]
      );
    },

    async release(key, error) {
      await client.execute(
        `UPDATE alert_deliveries
         SET status = 'failed', error = ?
         WHERE delivery_key = ?`,
        [String(error || '').slice(0, 300), key]
      );
    },

    // Every fetched Signal post is stored. Alerts do not read this table --
    // it is the history that coverage checks and the tip queue will use later.
    async upsertSignals(league, posts, nowIso) {
      const statements = (posts || [])
        .filter((post) => post && post.id)
        .map((post) => ({
          sql: `INSERT INTO signals
                  (id, league, source, source_post_id, author_username, author_display,
                   text, source_url, created_at, collected_at, categories_json,
                   latest_metrics_json, first_seen_at, last_updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  collected_at = excluded.collected_at,
                  categories_json = excluded.categories_json,
                  latest_metrics_json = excluded.latest_metrics_json,
                  last_updated_at = excluded.last_updated_at`,
          args: [
            String(post.id),
            league,
            post.source || 'x',
            String(post.source_post_id || post.id),
            (post.author && post.author.username) || '',
            (post.author && post.author.display_name) || '',
            String(post.text_preview || post.text || '').slice(0, 2000),
            post.source_url || '',
            post.created_at || null,
            post.collected_at || null,
            JSON.stringify(post.categories || []),
            JSON.stringify(post.latest_metrics || {}),
            nowIso,
            nowIso,
          ],
        }));

      for (let index = 0; index < statements.length; index += SIGNAL_UPSERT_CHUNK) {
        await client.batch(statements.slice(index, index + SIGNAL_UPSERT_CHUNK));
      }
      return statements.length;
    },
  };
}

module.exports = {
  createMemoryStore,
  createTursoStore,
  getDefaultMemoryStore,
};
