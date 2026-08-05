# Durable Alerts

Alert deduplication now lives in Turso instead of serverless memory. Before
this, every deploy and every cold start wiped the record of what had been
sent, so the same transactions re-fired repeatedly.

Also included: **send pacing**, which fixes the Google Chat 429
`RESOURCE_EXHAUSTED` errors. Chat accepts roughly one webhook message per
second per space; sends are now spaced ~1.1s apart, with a cap of 20 sends per
cycle. Anything over the cap is *not claimed*, so it simply goes out on the
next run.

**No Turso configured? Nothing changes.** The engine falls back to the exact
previous in-memory behavior.

## Setup

### 1. Create the database

```bash
turso db create heavy-newsroom
turso db show heavy-newsroom --url      # -> libsql://heavy-newsroom-<org>.turso.io
turso db tokens create heavy-newsroom   # -> auth token
```

### 2. Run the migration

```bash
TURSO_DATABASE_URL=libsql://heavy-newsroom-<org>.turso.io \
TURSO_AUTH_TOKEN=<token> \
node scripts/migrate-turso.js
```

Idempotent — safe to re-run. Schema also lives in `db/schema.sql`.

### 3. Add two Vercel environment variables

| Variable | Notes |
| --- | --- |
| `TURSO_DATABASE_URL` | `libsql://` or `https://` both work |
| `TURSO_AUTH_TOKEN` | from step 1 |

Redeploy after adding them (env changes don't apply to a running deployment).

### 4. Verify

```bash
curl -s -H "Authorization: Bearer $ALERTS_SECRET" \
  "https://heavy-newsroom.vercel.app/api/alerts?dryRun=1" | python3 -m json.tool
```

`dryRun` evaluates the whole cycle and sends nothing. Look for
`store_mode: "turso"` and a `would_fire` list. Then check `/api/health` for
`alert_store_mode` and `components.durable_alert_state`.

## How dedupe works

1. **Claim** — `INSERT ... ON CONFLICT(delivery_key) DO UPDATE ... RETURNING`.
   `delivery_key` is the primary key, so the database itself refuses a second
   row. Only a new key wins, or one whose last attempt failed, or one whose
   claim went stale (crash between claim and send, 10 min).
2. **Send** to Google Chat, paced.
3. **Record** — `sent` on success, `failed` on error (which allows a retry on
   a later cycle).

## Two tables

- `alert_deliveries` — the ledger that makes duplicates impossible.
- `signals` — every Signal post fetched, stored with its metrics. Alerts never
  read it; it accumulates the history that coverage checks and the tip queue
  will need later.

## Maintenance

```sql
DELETE FROM alert_deliveries WHERE created_at < datetime('now', '-30 days');
DELETE FROM signals WHERE collected_at < datetime('now', '-30 days');
```

## Not included (deliberately)

Cursor-based polling, retry replay of stored payloads, per-league hourly caps,
and ops incident alerts. All were considered and left out until there's
evidence they're needed.
