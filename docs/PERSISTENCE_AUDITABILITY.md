# Persistence & Auditability — Intelligence Worker

**Status:** Locked 2026-05-07 (Phase G.2). Changes require an ADR.
**Scope:** `workers/tav-intelligence-worker` — the three Postgres repositories and their wiring into `performMmrLookup`.

---

## Overview

Every Manheim MMR lookup writes three best-effort Postgres records:

| Repository | Table | Purpose |
|---|---|---|
| `mmrQueriesRepository` | `tav.mmr_queries` | Append-only audit log of every lookup |
| `mmrCacheRepository` | `tav.mmr_cache` | Queryable mirror of the KV hot cache |
| `userActivityRepository` | `tav.user_activity` | Portal presence + activity feed |

"Best-effort" means: if a write fails, the failure is logged as `mmr.persist.*_write_failed` and the MMR response is still returned to the caller. Persistence never blocks or degrades the lookup path.

---

## The three repositories

### mmrQueriesRepository

Append-only audit record of every MMR lookup attempt, including cache hits, live Manheim calls, and failures.

**Key fields:**
- `request_id` — unique per-request idempotency key (Cloudflare `requestId`). Prevents duplicate rows on Worker retry via partial unique index (`migration 0030`).
- `lookup_type` — `"vin"` or `"year_make_model"`
- `source` — `"cache"` on any cache hit; `"manheim"` on a live call
- `cache_hit` / `force_refresh` — enables hit-rate analytics by segment
- `retry_count` / `latency_ms` — transport-layer observability fields
- `outcome` — `"hit"`, `"miss"`, or `"error"`
- `requested_by_*` — Cloudflare Access identity at lookup time

**Idempotency:** The upsert uses `onConflict: "request_id", ignoreDuplicates: true`. Supabase returns `{ data: null, error: null }` when a row is skipped — no error is thrown. This is the correct behavior for Worker retries.

### mmrCacheRepository

Postgres mirror of the KV cache. Written **only on live Manheim calls** (outcome = `"miss"`). Cache hits are never mirrored because the row is already current.

**Why mirror KV in Postgres?**
- Joins: `SELECT * FROM tav.mmr_queries JOIN tav.mmr_cache USING (vin)` — impossible with KV alone.
- Analytics: expiry sweep, hit-rate by VIN, stale-entry audit.
- Cold-start recovery: if KV is flushed, the Postgres mirror can warm a new namespace.

KV remains **authoritative for hot reads**. Postgres is the query/analytics layer.

**Conflict resolution:** `onConflict: "cache_key"` with last-write-wins — same semantics as KV.

### userActivityRepository

One row per lookup for the portal presence feed. `active_until` is set to 5 minutes from now — the portal uses this to render "currently viewing" presence cues.

Rows with `active_until IS NOT NULL` are ephemeral. A periodic sweep (future work) can prune rows where `active_until < now()`. Rows without `active_until` are permanent activity-feed entries.

---

## Wiring in mmrLookup.ts

The three repos are optional fields in `MmrLookupDeps`. When absent (e.g. in unit tests), writes are silently skipped. When present, writes are always wrapped in `silentWrite(...)` which catches any error and emits a structured log line rather than propagating.

```
mmr.persist.activity_write_failed  — userActivityRepository.insert threw
mmr.persist.query_write_failed     — mmrQueriesRepository.insert threw
mmr.persist.cache_write_failed     — mmrCacheRepository.upsert threw
```

Write order at each success return point:
1. `activityRepo.insert` — presence record (all paths)
2. `queryRepo.insert` — audit record (all paths)
3. `cacheRepo.upsert` — cache mirror (live Manheim call only)

On the failure path (catch block), only `queryRepo.insert` is attempted (with `outcome: "error"`). The cache mirror is not written because there is no envelope to mirror.

---

## Handler wiring

`handleMmrVin` and `handleMmrYearMakeModel` instantiate all three repos from the Supabase client and inject them into `performMmrLookup`. The Supabase client is created fresh per request — this is correct for Cloudflare Workers (HTTP transport, no connection state).

```typescript
const supabase     = getSupabaseClient(args.env);
const queryRepo    = createMmrQueriesRepository(supabase);
const cacheRepo    = createMmrCacheRepository(supabase);
const activityRepo = createUserActivityRepository(supabase);
```

Handlers never call Supabase directly — all DB access goes through repositories.

---

## Schema additions (migration 0030)

Migration `0030_mmr_queries_add_tracking_fields.sql` adds four columns to `tav.mmr_queries`:

| Column | Type | Notes |
|---|---|---|
| `request_id` | `text` | Unique per lookup (partial index, nullable) |
| `retry_count` | `integer NOT NULL DEFAULT 0` | Transport-layer retry count |
| `latency_ms` | `integer` | Total wall-clock time for the lookup |
| `outcome` | `text CHECK (outcome IN ('hit','miss','error'))` | Result classification |

All columns are nullable — pre-G.2 rows are unaffected.

---

## Environment bindings required

Add to Wrangler secrets for each environment:

```
wrangler secret put SUPABASE_URL --env staging
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env staging
wrangler secret put SUPABASE_URL --env production
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env production
```

Use the same Supabase project as the main worker. The intelligence worker connects to `schema: "tav"` with the service-role key.

---

## What is NOT in scope

- RLS on `mmr_queries` / `mmr_cache` / `user_activity` — deferred to Phase K
- Portal reads from `user_activity` — deferred to Phase K
- KV cold-start recovery from `mmr_cache` — deferred (future operational runbook item)
- Bulk-replay soft-fail per `docs/API_ERROR_HANDLING.md §Future exception` — deferred to Phase G.2+
