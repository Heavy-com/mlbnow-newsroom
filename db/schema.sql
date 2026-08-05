-- Heavy Newsroom durable alert state (Turso / libSQL)
-- Mirrors scripts/migrate-turso.js. Safe to re-run.

-- Delivery ledger. delivery_key is the dedupe mechanism: it is the PRIMARY
-- KEY, so the database physically refuses a duplicate row. status moves
-- claimed -> sent, or claimed -> failed (which allows a retry next cycle).
CREATE TABLE IF NOT EXISTS alert_deliveries (
  delivery_key TEXT PRIMARY KEY,
  league TEXT,
  item_type TEXT,
  item_id TEXT,
  team_id TEXT,
  status TEXT NOT NULL DEFAULT 'claimed',
  error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_deliveries_league_status ON alert_deliveries (league, status, created_at);

-- Every Signal post the alert engine fetches. Alerts do not read this table;
-- it is the history that coverage checks and the tip queue will use later.
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  league TEXT,
  source TEXT,
  source_post_id TEXT,
  author_username TEXT,
  author_display TEXT,
  text TEXT,
  source_url TEXT,
  created_at TEXT,
  collected_at TEXT,
  categories_json TEXT,
  latest_metrics_json TEXT,
  first_seen_at TEXT,
  last_updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_signals_collected ON signals (collected_at);
CREATE INDEX IF NOT EXISTS idx_signals_league ON signals (league, collected_at);
