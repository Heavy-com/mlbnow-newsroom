#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://heavy-newsroom.vercel.app}"

python3 - "$BASE_URL" <<'PY'
import json
import sys
import urllib.error
import urllib.request

base = sys.argv[1].rstrip("/")


def get(path):
    request = urllib.request.Request(
        base + path,
        headers={"User-Agent": "HeavyNewsroomProductionCheck/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        try:
            body = json.load(error)
        except Exception:
            body = {"error": str(error)}
        return error.code, body


status, health = get("/api/health")
if status != 200 or "status" not in health or "components" not in health:
    raise SystemExit(f"Health check failed: HTTP {status} {health}")
print(f"health: {health.get('status')}")

for league in ("mlb", "nfl", "nba", "nhl"):
    status, feed = get(f"/api/feed?league={league}")
    if status != 200:
        raise SystemExit(f"{league} feed failed: HTTP {status} {feed}")
    if feed.get("league") != league:
        raise SystemExit(f"{league} feed returned the wrong league")
    for key in ("news", "social", "transactions", "source_errors"):
        if not isinstance(feed.get(key), list):
            raise SystemExit(f"{league} feed is missing list field: {key}")
    print(
        f"{league}: news={len(feed['news'])} "
        f"social={len(feed['social'])} "
        f"transactions={len(feed['transactions'])} "
        f"source_errors={len(feed['source_errors'])}"
    )

print("Production feed verification passed.")
PY
