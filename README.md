# Heavy Sports Newsroom

A Vercel-hosted newsroom dashboard that combines news search, official MLB transactions, Signalizacija social posts, and optional Google Chat alerts for MLB, NFL, NBA, and NHL coverage.

## What changed in this handoff

- Added a stable Signalizacija bearer-token client for `/api/v1/external/posts`.
- Preserved compatibility with the existing `NOCAP_SESSION` / `nocap_Session` Vercel variable.
- Normalized the new API response into the older dashboard shape, so the current UI can use it without a full rewrite.
- Added `/api/health` for configuration checks.
- Removed committed NewsAPI and GNews credentials from source.
- Added optional authorization for alert routes.
- Disabled the automatic 30-minute alert workflow until deduplication is durable.
- Converted the daily browser-session refresh workflow into a manual legacy fallback.
- Disabled NBA, NFL, and NHL transaction tabs because their referenced API routes do not exist in this repository.
- Removed stale `2025` terms from search queries.
- Fixed the Colorado Rockies division mapping.
- Added basic output escaping and safe-link handling for untrusted feed content.
- Added a Signal adapter test and JavaScript syntax checks.

## Signalizacija credentials

Preferred Vercel environment variable:

```text
SIGNAL_API_TOKEN=sig_live_...
```

Also supported:

```text
SIGNALIZACIJA_API_TOKEN=sig_live_...
```

The existing variable remains compatible:

```text
NOCAP_SESSION=...
```

Behavior:

- A `NOCAP_SESSION` value beginning with `sig_` is treated as a bearer token.
- Any other non-empty value is treated as the legacy `signalizacija_session` browser cookie.
- The mixed-case alias `nocap_Session` is also recognized because Vercel environment names are case-sensitive.

The bearer-token route is the long-term integration. The legacy browser-session route should be treated only as a migration fallback.

## Required environment variables

Copy `.env.example` into Vercel and populate the values that apply.

| Variable | Purpose |
| --- | --- |
| `NEWS_API_KEY` | Dashboard news search |
| `GNEWS_API_KEY` | League Google Chat alert searches |
| `SIGNAL_API_TOKEN` | Preferred Signalizacija API credential |
| `GCHAT_MLB` | MLB Google Chat webhook |
| `GCHAT_NFL` | NFL Google Chat webhook |
| `GCHAT_NBA` | NBA Google Chat webhook |
| `GCHAT_NHL` | NHL Google Chat webhook |
| `ALERTS_SECRET` | Protects alert endpoints |

`CRON_SECRET` is accepted as an alternative to `ALERTS_SECRET`.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Newsroom dashboard |
| `/api/health` | Safe environment/configuration status |
| `/api/feed?league=mlb` | Combined dashboard feed for one league |
| `/api/news` | Restricted NewsAPI proxy |
| `/api/nocap` | Signalizacija proxy and compatibility adapter |
| `/api/transactions` | Official MLB transactions |
| `/api/alerts` | MLB Google Chat alerts |
| `/api/nfl-alerts` | NFL Google Chat alerts |
| `/api/nba-alerts` | NBA Google Chat alerts |
| `/api/nhl-alerts` | NHL Google Chat alerts |

The dashboard now uses one combined `/api/feed?league=<league>` request. It returns partial results when one source fails and includes `source_status` plus `source_errors` so failures are visible.

The public feed proxies are intentionally restricted:

- `/api/news` accepts only the dashboard and alert-engine queries defined in the repository. `pageSize` is capped at 20 and `sortBy` is fixed to `publishedAt`.
- `/api/nocap` accepts only `limit` and `metrics=latest`. `limit` is capped at 200.
- Unsupported filters return HTTP 400 instead of being forwarded with Heavy's upstream credentials.

Example:

```text
/api/nocap?limit=50&metrics=latest
```

## Deployment checklist

1. Rotate the NewsAPI and GNews keys that were previously committed in source.
2. Set `SIGNAL_API_TOKEN` in Vercel. The existing `NOCAP_SESSION` value can remain during migration.
3. Set `NEWS_API_KEY` and, if alerts are used, `GNEWS_API_KEY` plus the Google Chat webhooks.
4. Set `ALERTS_SECRET` or `CRON_SECRET` before exposing or scheduling alert routes.
5. Redeploy the project.
6. Open `/api/health` and confirm its status is `healthy` and all component checks are true.
7. Open `/api/nocap?limit=5` and confirm normalized `items` are returned.
8. Add the same `ALERTS_SECRET` as a GitHub Actions secret for manual workflow tests.
9. Test alert routes with `Authorization: Bearer <ALERTS_SECRET>`. Do not restore the schedule until durable deduplication is implemented.

## Local validation

```bash
npm test
npm run check
npm run audit:pre-db
```

After a production deployment, run:

```bash
npm run verify:production
```

## Important current limitations

- Alert deduplication currently uses in-memory sets, which are not durable across serverless cold starts or deployments. The automatic GitHub Actions schedule is disabled until durable deduplication is implemented.
- The repository does not include a database, authentication, shared editorial state, or assignment history.
- The dashboard fetches and classifies posts in the browser; it does not yet maintain a persistent tip queue.
- Signal league/team matching falls back to text matching when upstream category/entity fields are absent.
- NBA, NFL, and NHL transaction feeds remain disabled until real data sources are selected and implemented.

See `BUILD_PLAN.md` for the recommended newsroom build sequence.
