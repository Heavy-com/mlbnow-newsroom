#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://heavy-newsroom.vercel.app}"

python3 - "$BASE_URL" <<'PY'
import collections
import json
import sys
import urllib.error
import urllib.request

base = sys.argv[1].rstrip("/")


def get(path):
    request = urllib.request.Request(
        base + path,
        headers={"User-Agent": "HeavyNewsroomProductionCheck/1.1"},
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
if health.get("check_scope") != "configuration_only":
    raise SystemExit(f"Health endpoint did not identify its check scope: {health}")
if health.get("live_dependencies_checked") is not False:
    raise SystemExit(f"Health endpoint incorrectly claims live checks: {health}")
print(
    f"health configuration: {health.get('status')} "
    f"(live dependencies checked: {health.get('live_dependencies_checked')})"
)

partial_leagues = []
error_counts = collections.Counter()

for league in ("mlb", "nfl", "nba", "nhl"):
    status, feed = get(f"/api/feed?league={league}")
    if status != 200:
        raise SystemExit(f"{league} feed failed: HTTP {status} {feed}")
    if feed.get("league") != league:
        raise SystemExit(f"{league} feed returned the wrong league")
    for key in ("news", "social", "transactions", "source_errors"):
        if not isinstance(feed.get(key), list):
            raise SystemExit(f"{league} feed is missing list field: {key}")

    social_filter = feed.get("social_filter")
    if not isinstance(social_filter, dict):
        raise SystemExit(f"{league} feed is missing social_filter metadata")
    if social_filter.get("matched") != len(feed["social"]):
        raise SystemExit(f"{league} social filter count does not match returned items")

    for source_error in feed["source_errors"]:
        error_counts[source_error.get("source", "unknown")] += 1

    if feed.get("partial"):
        partial_leagues.append(league)

    print(
        f"{league}: news={len(feed['news'])} "
        f"social={len(feed['social'])}/{social_filter.get('fetched', 0)} "
        f"transactions={len(feed['transactions'])} "
        f"source_errors={len(feed['source_errors'])}"
    )

if partial_leagues:
    details = ", ".join(
        f"{source}={count}" for source, count in sorted(error_counts.items())
    ) or "unspecified source errors"
    print(
        "Production feeds are available with partial source failures: "
        f"leagues={','.join(partial_leagues)}; {details}"
    )
else:
    print("Production feeds are fully available.")

print("Production feed verification passed.")
PY
