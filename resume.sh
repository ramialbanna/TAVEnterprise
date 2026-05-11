#!/usr/bin/env zsh
# resume.sh — launch Claude with full Phase G.3 handoff context

SYSTEM_PROMPT=$(cat <<'HANDOFF'
# TAV-AIP Session Resume — Phase G.3 Complete + Merged to main

## Current branch and state

Branch: main
HEAD: 9c3d7bb (merge of phase-8-architecture-pivot PR #5)
488 tests pass. Clean working tree.

## What we built (Phases G.1–G.3, 2026-05-07 to 2026-05-08)

### Phase A — Audit (2026-05-07 morning)
Audited the original Phase 8 (replay endpoint) plan and pivoted to the intelligence worker
architecture instead. Reverted premature historical_sales/market_velocities tables.

### Phase D — Intelligence Zod schemas
Zod schemas for the full intelligence layer in src/types/intelligence.ts.

### Phase E — Mileage inference
Pure helper: inferMileage(vin, ymm, mileage, options) in src/scoring/mmrMileage.ts.

### Phase F.0 — Contract locks
Locked all intelligence layer contracts in docs/INTELLIGENCE_CONTRACTS.md.

### Phase F.1 — Scaffold tav-intelligence-worker
Cloudflare Worker at workers/tav-intelligence-worker/ with full routing and error handling.

### Phase G.1 — Manheim client foundation
ManheimHttpClient: OAuth2 password-flow token fetch, KV token cache, single-flight refresh
lock (KvCacheLock), retry-with-backoff HTTP layer, VIN and YMM MMR request builders.
KvMmrCache: TTL-aware KV wrapper for MMR results.
performMmrLookup: orchestration service (cache hit → lock → live call → persist → respond).

### Phase G.2 — Persistence + auditability layer
Three Postgres repositories (best-effort writes, never block the MMR response):
  - mmrQueriesRepository: append-only audit log, idempotent via request_id UNIQUE constraint
  - mmrCacheRepository: Postgres mirror of KV; written only on live Manheim calls
  - userActivityRepository: portal presence feed (active_until = now + 5 min)
Migrations 0030 (tracking fields) and 0031 (fix request_id UNIQUE constraint).
Staging live validation: all 8 items passed.

### Phase G.3 — Analytics endpoints (2026-05-08)
Five new GET endpoints on the intelligence worker:

  GET /intel/mmr/:cacheKey
    Looks up a Postgres-mirrored MMR cache entry by key (format: vin:VIN or ymm:...).
    cacheKey path segment is decodeURIComponent'd before Supabase lookup.
    Returns 404 with not_found error code when key is absent.

  GET /activity/feed
    Global user activity feed from tav.user_activity WHERE active_until IS NULL.
    Supports filters: vin, user_id, activity_type. Returns { entries, count, limit }.

  GET /activity/vin/:vin
    Activity history for a specific VIN. Ordered newest-first, limit 50 default.
    Returns { vin, entries, count, limit }.

  GET /kpis/summary
    Live MMR analytics via Supabase RPC tav.get_mmr_kpis.
    Params: from (default -7d), to (default now), email, lookup_type.
    Returns: total_lookups, successful_lookups, failed_lookups, cache_hit_rate,
             avg_latency_ms, p95_latency_ms, lookups_by_type, lookups_by_outcome,
             top_requesters (top 5), recent_error_count, time_window.

  GET /intel/mmr/queries
    Paginated MMR audit history for ops/debugging.
    21-field allowlist (excludes mmr_payload, error_message, requested_by_user_id).
    Filters: email, vin, outcome, lookup_type, cache_hit, from, to.
    Pagination: limit (1–250, default 50), offset.
    Returns: { items, total_count, limit, offset, has_more, filters }.

Migration 0032: CREATE tav.get_mmr_kpis RPC + GRANT EXECUTE TO service_role.
Applied to remote Supabase.

Route order in routes/index.ts (critical):
  /intel/mmr/queries  — exact match at line 48 (MUST come before prefix match)
  /intel/mmr/:cacheKey — startsWith at line 52

## Intelligence worker architecture (workers/tav-intelligence-worker/)

```
src/
  index.ts              — entry point, requestId minting, error → response mapping
  routes/index.ts       — URL dispatch to handlers
  auth/userContext.ts   — re-exports from ../../../../src/auth/userContext.ts
  types/env.ts          — Env interface (KV binding + all secrets)
  types/api.ts          — ApiResponse<T>, errorResponse(), okResponse()
  errors/index.ts       — IntelligenceError subclasses: AuthError, ValidationError,
                          ManheimAuthError, ManheimUnavailableError, CacheLockError,
                          PersistenceError, NotFoundError
  handlers/
    mmrVin.ts           — POST /mmr/vin
    mmrYearMakeModel.ts — POST /mmr/year-make-model
    kpisSummary.ts      — GET /kpis/summary
    intelMmrCacheKey.ts — GET /intel/mmr/:cacheKey
    intelMmrQueries.ts  — GET /intel/mmr/queries
    activityFeed.ts     — GET /activity/feed
    activityVin.ts      — GET /activity/vin/:vin
    salesUpload.ts      — POST /sales/upload
    health.ts           — GET /health
    types.ts            — HandlerArgs interface
  clients/
    manheimHttp.ts      — ManheimHttpClient, OAuth2 token, retry, VIN+YMM requests
  cache/
    kvMmrCache.ts       — KvMmrCache (KV TTL wrapper, 24h positive / 1h negative cache)
    kvLock.ts           — KvCacheLock (distributed lock, TTL clamp ≥ 60s)
    lock.ts             — CacheLock interface
    mmrCacheKey.ts      — cache key builders (vin:VIN, ymm:YEAR:MAKE:MODEL:MILEAGE)
    constants.ts        — TTL constants
  services/
    mmrLookup.ts        — performMmrLookup orchestration, writePersistenceRecords, silentWrite
  persistence/
    supabase.ts         — getSupabaseClient factory (schema: "tav", service-role)
    mmrQueriesRepository.ts
    mmrCacheRepository.ts
    userActivityRepository.ts
  scoring/
    segmentKey.ts       — segment key builder for market intel
  utils/
    logger.ts           — log(event, fields: LogFields) — structured JSON
    requestId.ts        — generateRequestId() — crypto.randomUUID()
    retry.ts            — withRetry, exponential backoff
  validate/index.ts     — MMR_LOOKUP_TYPES allowlist
```

## Database tables added for intelligence worker (schema: tav)

  - mmr_queries       — audit log (migrations 0027, 0030, 0031)
  - mmr_cache         — KV mirror (migration 0028)
  - user_activity     — presence + activity feed (migration 0029)
  - mmr_lookup_config — per-make/model config (TTLs, mileage defaults)
  - vehicle_segments  — market segment definitions
  - market_intel      — aggregated market intelligence
  - tav.get_mmr_kpis  — analytics RPC (migration 0032)

## Secrets required for intelligence worker

Staging (already provisioned):
  - MANHEIM_CLIENT_ID, MANHEIM_CLIENT_SECRET, MANHEIM_USERNAME, MANHEIM_PASSWORD
  - MANHEIM_TOKEN_URL, MANHEIM_MMR_URL
  - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

Production (NOT yet provisioned):
  - All of the above with --env production

## Known limitations / open items

- YMM path returns 596 from Manheim — account not provisioned for that endpoint.
  Contact Manheim rep before building more YMM-dependent features.
- Production KV namespace ID in wrangler.toml is still placeholder:
  REPLACE_WITH_TAV_INTEL_KV_PRODUCTION_ID
  Run: wrangler kv namespace create TAV_INTEL_KV_PRODUCTION --env production
- Open follow-up items (~27) in docs/followups.md. High priority:
  - Consolidate ParsedOutcomeRow (duplicate in src/outcomes/import.ts + src/types/domain.ts)
  - Pick one source of truth for ConditionGradeNormalized
  - Migration: add NOT NULL to purchase_outcomes.import_fingerprint
  - Add row LIMIT to per-region SELECT in /admin/recompute

## Key architectural rules (never violate)

- Four concepts: Raw Listing → Normalized Listing → Vehicle Candidate → Lead. Never collapse.
- Facebook listings rarely have VIN. Never assume VIN. YMM + mileage is the valuation path.
- Every rejection has a reason_code. Silent drops are forbidden.
- Service role key lives only in the Cloudflare Worker. Never echoed, never logged.
- withRetry wraps all Supabase writes in the main worker.
- Persistence in the intelligence worker is best-effort (silentWrite); failures never block MMR response.
- KV requires expirationTtl >= 60s — all KV writes must clamp to this floor.
- fetch in Workers must be called as globalThis.fetch or fetch.bind(globalThis) when stored as a reference.
- GRANT EXECUTE ON FUNCTION must come AFTER CREATE OR REPLACE FUNCTION in migrations.

## Recent commit history

9c3d7bb merge: phase-8-architecture-pivot PR #5
13012d6 chore: remove .claude/rules, skills, settings.json
af4f57d fix: move GRANT EXECUTE after CREATE in migration 0032; log G.3 endpoints done
c65125b feat: GET /intel/mmr/queries — paginated MMR audit history for ops
a5560c0 feat: GET /kpis/summary — live MMR analytics from tav.mmr_queries
89d7745 feat: activity feed endpoints — GET /activity/feed + /activity/vin/:vin
a97911a feat: GET /intel/mmr/:cacheKey — Postgres mirror lookup for MMR cache entries
c99b41f fix: knock out easy followup items from post-review backlog
b3cbe8d fix: token refresh lock TTL (10→60s) and fetch globalThis binding
HANDOFF
)

claude --system-prompt "$SYSTEM_PROMPT"
