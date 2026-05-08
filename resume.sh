#!/usr/bin/env zsh
# resume.sh — launch Claude with full Phase G.2 handoff context

SYSTEM_PROMPT=$(cat <<'HANDOFF'
# TAV-AIP Session Resume — Phase G.2 Complete + Staging Validated

## Current branch and state

Branch: phase-8-architecture-pivot
HEAD: b3cbe8d (fix: token refresh lock TTL (10→60s) and fetch globalThis binding)
451 tests pass. Clean working tree. Branch is up to date with origin.

## What we built today (2026-05-07)

This was a large architecture pivot day. Summary of phases shipped:

### Phase A — Audit (morning)
Audited the original Phase 8 (replay endpoint) plan and pivoted to the intelligence worker
architecture instead. Reverted premature historical_sales/market_velocities tables.

### Phase D — Intelligence Zod schemas
Zod schemas for the full intelligence layer in src/types/intelligence.ts.

### Phase E — Mileage inference
Pure helper: inferMileage(vin, ymm, mileage, options) in src/valuation/mileage.ts.
Infers mileage from VIN history, YMM fleet averages, or falls back to a provided value.

### Phase F.0 — Contract locks
Locked all intelligence layer contracts in docs/INTELLIGENCE_CONTRACTS.md (frozen interfaces,
log event names, error taxonomy, KV TTLs, Cloudflare Access auth contract).

### Phase F.1 — Scaffold tav-intelligence-worker
Cloudflare Worker at workers/tav-intelligence-worker/ with full routing, error handling,
Env type, and stub handlers for /mmr/vin and /mmr/year-make-model.

### Phase G.1 — Manheim client foundation
ManheimHttpClient: OAuth2 password-flow token fetch, KV token cache, single-flight refresh
lock (KvCacheLock), retry-with-backoff HTTP layer, VIN and YMM MMR request builders.
KvMmrCache: TTL-aware KV wrapper for MMR results.
performMmrLookup: orchestration service that handles cache hit, lock, live call, and error
paths.

### Phase G.2 — Persistence + auditability layer
Three Postgres repositories (best-effort writes, never block the MMR response):
  - mmrQueriesRepository: append-only audit log, idempotent via request_id UNIQUE constraint
  - mmrCacheRepository: Postgres mirror of KV; written only on live Manheim calls
  - userActivityRepository: portal presence feed (active_until = now + 5 min)
Supabase client factory at persistence/supabase.ts.
Wired into performMmrLookup via optional MmrLookupDeps fields.
Handlers (mmrVin.ts, mmrYearMakeModel.ts) instantiate all three repos and inject them.
Migrations 0030 (tracking fields) and 0031 (fix request_id UNIQUE constraint).
Both migrations applied to remote Supabase.

### Staging deploy (end of day)
Staging worker deployed at: https://tav-intelligence-worker-staging.rami-1a9.workers.dev
Staging KV namespace: 80195f01a65c4431af1e3835f9bea933
Two bugs found during staging live validation and fixed:
  1. TOKEN_REFRESH_LOCK_TTL_S was 10s (KV minimum is 60s) — bumped to 60s
  2. fetchFn default was `fetch` (causes Illegal invocation in Workers) — fixed to `fetch.bind(globalThis)`
All 8 staging validation items passed.

## Intelligence worker architecture (workers/tav-intelligence-worker/)

```
src/
  index.ts              — entry point, requestId minting, error → response mapping
  routes/index.ts       — URL dispatch to handlers
  auth/userContext.ts   — re-exports from ../../../../src/auth/userContext.ts (single source)
  types/env.ts          — Env interface (KV binding + all secrets)
  types/api.ts          — ApiResponse<T>, errorResponse(), okResponse()
  errors.ts             — IntelligenceError subclasses: AuthError, ValidationError,
                          ManheimAuthError, ManheimUnavailableError, CacheLockError,
                          PersistenceError, NotFoundError
  handlers/
    mmrVin.ts           — POST /mmr/vin
    mmrYearMakeModel.ts — POST /mmr/year-make-model
    types.ts            — HandlerArgs interface
  clients/
    manheimHttp.ts      — ManheimHttpClient, OAuth2 token, retry, VIN+YMM requests
  cache/
    kvMmrCache.ts       — KvMmrCache (KV TTL wrapper, 24h positive / 1h negative cache)
    kvLock.ts           — KvCacheLock (distributed lock, TTL clamp ≥ 60s)
    lock.ts             — CacheLock interface
  services/
    mmrLookup.ts        — performMmrLookup orchestration, writePersistenceRecords, silentWrite
  persistence/
    supabase.ts         — getSupabaseClient factory (schema: "tav", service-role)
    mmrQueriesRepository.ts
    mmrCacheRepository.ts
    userActivityRepository.ts
  utils/
    logger.ts           — log(event, fields: LogFields) — structured JSON
    requestId.ts        — generateRequestId() — crypto.randomUUID()
```

## Database tables added for intelligence worker

In schema `tav`:
  - mmr_queries       — audit log (migration 0030 + 0031)
  - mmr_cache         — KV mirror (future: analytics, cold-start recovery)
  - user_activity     — presence + activity feed
  - mmr_lookup_config — per-make/model config (TTLs, mileage defaults)
  - vehicle_segments  — market segment definitions
  - market_intel      — aggregated market intelligence

## Secrets required for intelligence worker

Staging (already provisioned):
  - MANHEIM_CLIENT_ID, MANHEIM_CLIENT_SECRET, MANHEIM_USERNAME, MANHEIM_PASSWORD
  - MANHEIM_TOKEN_URL, MANHEIM_MMR_URL
  - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

Production (NOT yet provisioned):
  - All of the above with --env production

## Next phase: G.3 — Intelligence layer analytics + buy-box signals

The intelligence worker currently handles MMR lookup and persistence. Phase G.3 should add:
  1. GET /intel/mmr/:cacheKey — serve cached MMR from Postgres (portal read path)
  2. GET /intel/activity?email= — recent user activity feed
  3. Aggregated cache hit-rate / latency endpoints for operational dashboards
  4. Wire mmr_lookup_config to override default TTLs per make/model

(Note: YMM path returns 596 from Manheim because the account is not provisioned for that
endpoint. Contact Manheim rep before building more YMM-dependent features.)

## Other open work (from main worker — deferred)

### Original Phase 8 (replay endpoint — deferred, not abandoned)
POST /replay — re-process raw listings through normalize pipeline
Auth: NORMALIZER_SECRET bearer token
This was deprioritized in favor of the intelligence worker architecture pivot.

### Top follow-up items from followups.md (~27 total)
High priority:
  - Consolidate ParsedOutcomeRow (declared in both src/outcomes/import.ts and src/types/domain.ts)
  - Pick one source of truth for ConditionGradeNormalized (conditionGrade.ts vs domain.ts)
  - Migration 0022: add NOT NULL to purchase_outcomes.import_fingerprint
  - Replace N+1 per-region SELECT in /recompute with single GROUP BY aggregate
  - Clamp ?limit to max 100 on GET /admin/import-batches

Production deploy blockers for intelligence worker:
  - wrangler.toml production KV namespace ID: REPLACE_WITH_TAV_INTEL_KV_PRODUCTION_ID
    Run: wrangler kv namespace create TAV_INTEL_KV_PRODUCTION --env production
  - Provision all 8 secrets with --env production

## Key architectural rules (never violate)

- Four concepts: Raw Listing → Normalized Listing → Vehicle Candidate → Lead. Never collapse.
- Facebook listings rarely have VIN. Never assume VIN. YMM + mileage is the valuation path.
- Every rejection has a reason_code. Silent drops are forbidden.
- Service role key lives only in the Cloudflare Worker. Never echoed, never logged.
- withRetry wraps all Supabase writes in the main worker.
- Persistence in the intelligence worker is best-effort (silentWrite); failures never block MMR response.
- KV requires expirationTtl >= 60s — all KV writes must clamp to this floor.
- fetch in Workers must be called as globalThis.fetch or fetch.bind(globalThis) when stored as a reference.

## Recent commit history

b3cbe8d fix: token refresh lock TTL (10→60s) and fetch globalThis binding
33a7caa fix: replace partial unique index on mmr_queries.request_id with plain constraint
dfb6e9b feat: phase G.2 — persistence + auditability layer for intelligence worker
dbea312 fix: token refresh lock-wait timeout → CacheLockError, not ManheimAuthError
4a68ee5 chore: lock pre-Phase-G.2 decisions (token errors, event names, error strategy)
1d7deee feat: phase G.1 — Manheim client foundation + KV cache + lock + orchestration
a674d1c chore: lock pre-Phase-G decisions (KV, Manheim, TTLs, Access)
bbcdec8 feat: phase F.1 — scaffold tav-intelligence-worker
HANDOFF
)

claude --system-prompt "$SYSTEM_PROMPT"
