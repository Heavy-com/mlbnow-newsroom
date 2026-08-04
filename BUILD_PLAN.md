# Heavy Sports Newsroom Build Plan

## Product direction

Signalizacija should remain the collection and upstream enrichment layer. Heavy's app should become the editorial action layer: deciding what matters to Heavy, showing why it matters, matching it to existing coverage, and coordinating who acts on it.

The dashboard should not merely reproduce a chronological social feed. Its core output should be a prioritized, persistent tip queue.

## Phase 1 — Integration foundation (completed in this handoff)

- Stable bearer-token support for Signalizacija.
- Legacy `NOCAP_SESSION` fallback.
- Response normalization for the existing interface.
- Secret removal and environment validation.
- Safe handling of unavailable transaction routes.
- Basic untrusted-content escaping.
- Adapter tests and syntax checks.
- Automatic alert scheduling disabled until persistent deduplication exists.
- Legacy session refresh changed from daily automation to manual fallback.

## Phase 2 — Persistent Tip Queue

Add a shared database and move editorial state off the browser.

Recommended queue states:

- **Act Now** — strong, fresh, relevant signal requiring immediate action.
- **Watch** — credible development that is incomplete or not yet actionable.
- **Opportunity** — non-breaking item with clear traffic, email, social, or follow-up potential.
- **Covered/Updating** — Heavy already has a story and should update rather than duplicate it.
- **Dismissed** — reviewed and intentionally passed on.

Minimum records:

### `signals`

- Signal post ID
- source and source post ID
- author
- text and canonical URL
- created/collected timestamps
- categories and confidence
- latest metrics
- inferred league, team, player, and topic
- first seen and last updated

### `signal_actions`

- signal ID
- status
- assigned editor/writer
- action timestamp
- note
- linked Heavy URL or WordPress post ID

### `poll_state`

- feed/filter identity
- latest successful `collected_at`
- last run status
- last error

This phase makes assignments, dismissals, and coverage status survive refreshes and become visible to the whole newsroom.

## Phase 3 — Heavy Relevance Score

Rank signals by Heavy-specific usefulness rather than raw recency.

Suggested inputs:

- freshness
- category confidence
- source/author trust
- engagement velocity, not only total engagement
- relevance to Heavy priority teams and active beats
- breaking, injury, transaction, controversy, or quote value
- whether Heavy has already published on the development
- whether the signal contains a new fact versus repetition
- likely email, Discover, search, or social value

Every score should include a visible explanation, for example:

> Act Now: 4 minutes old, trusted national reporter, Yankees injury, engagement accelerating, and no matching Heavy story.

Editors should be able to correct the classification. Those corrections can later improve rules or models.

## Phase 4 — Coverage matching

Use Heavy's open WordPress REST API to compare each signal with recent Heavy stories.

For each signal, show:

- likely matching Heavy story
- publish and modified time
- author
- whether the current story predates the new fact
- recommended action: create, update, email, watch, or dismiss

Start with deterministic matching:

1. league/team/player entity overlap
2. recent time window
3. headline/body keyword similarity
4. canonical URL and source-link overlap

Add embeddings or an LLM only after deterministic matching is measured.

## Phase 5 — Durable alerts

Replace in-memory deduplication with persisted polling state.

Polling flow:

1. Read the latest successful `collected_at` value.
2. Request posts using `collected_after`.
3. Deduplicate on the Signal post `id` because the timestamp boundary is inclusive.
4. Store new posts and update the cursor only after a successful run.
5. Alert only when a post crosses the Heavy relevance threshold.

Alert types:

- immediate Google Chat alert for Act Now
- grouped watchlist digest
- escalation when engagement velocity changes materially
- coverage alert when a writer is assigned but no Heavy story appears within a set window

## Phase 6 — Editorial AI helpers

AI should accelerate judgment, not silently make publishing decisions.

Useful per-signal helpers:

- one-sentence development summary
- what is genuinely new
- verification checklist
- suggested reporting follow-ups
- potential Heavy headline angles
- email subject-line angle
- update-versus-new-story recommendation
- conflicting-source detection
- names, teams, dates, and claims extracted for review

Do not generate an article before the system has identified the source, new fact, confidence, and coverage status.

## Phase 7 — Additional feeds

Feeds Heavy can add without waiting for Signalizacija changes:

- official league and team transactions/injury reports
- Heavy WordPress recent posts and updates
- team press releases and official sites
- league discipline and roster notices
- selected RSS feeds
- public records or structured league endpoints where available
- internal editorial priorities and assignment schedules

All feeds should enter one normalized signal model rather than creating separate disconnected tabs.

## Requests for the Signalizacija side

The most valuable upstream additions would be:

- normalized league, team, player, and topic entities
- category confidence and method on every post
- author trust/reliability fields
- follower count and historical baseline
- engagement velocity or breakout score
- canonical source URL
- explicit repost/quote/reply relationships
- cluster or story ID for duplicate reports
- filters for league, team, player, trust, and breakout level
- a documented category/entity vocabulary

Heavy can build the queue, scoring, assignments, coverage matching, and alerts independently. Upstream entity and velocity enrichment would make those features more accurate and less dependent on keyword matching.

## Recommended implementation order

1. Deploy and validate the new Signal adapter.
2. Add a shared database and persistent signal ingestion.
3. Replace the current card grid's chronological default with the Tip Queue.
4. Add shared claim/status actions and newsroom authentication.
5. Integrate WordPress coverage matching.
6. Make alerts durable and threshold-based.
7. Add AI summaries and recommendations after the queue data is measurable.

## Definition of a useful first production version

The first real newsroom version is complete when an editor can open one screen and answer:

- What requires action right now?
- Why did the system surface it?
- Is it trustworthy?
- Has Heavy already covered it?
- Who owns it?
- What happened after it was assigned?

Until those answers are persistent and shared, the product is a feed viewer rather than a newsroom system.
