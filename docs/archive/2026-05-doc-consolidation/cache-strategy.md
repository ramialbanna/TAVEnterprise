# MMR Cache Strategy

**Status:** Locked 2026-05-07. Tuning permitted in Phase G after first production measurements.
**Authoritative constants:** `workers/tav-intelligence-worker/src/cache/constants.ts`
**Related:** `docs/INTELLIGENCE_CONTRACTS.md` §A (cache_key derivation)

The intelligence Worker's MMR cache and anti-stampede lock have four
timing knobs. This doc records what they are, why, and what changes if
they move.

---

## TTLs

### Positive cache TTL — **24 hours** (`POSITIVE_CACHE_TTL_SECONDS = 86_400`)

A successful Manheim lookup (mmr_value is a number) is cached for 24h.

**Why 24h:**
- MMR is not volatile — Manheim publishes adjustments daily at most.
- A single VIN may be looked up by multiple buyers across a day; 24h
  ensures the second-through-Nth lookup is free.
- Aligns with Manheim's own documented update cadence.

**What changes if shorter (e.g. 6h):** more API calls, higher cost, no
correctness benefit. Don't.

**What changes if longer (e.g. 7d):** stale valuations on adjustment
days. Acceptable for analytics, dangerous for live buy-box scoring.
Don't.

### Negative cache TTL — **1 hour** (`NEGATIVE_CACHE_TTL_SECONDS = 3_600`)

A no-result lookup (mmr_value === null — Manheim returned 404, no
data, or token failure surfaced as null) is cached for 1h.

**Why 1h:**
- Prevents hammering Manheim on a VIN that genuinely has no MMR data.
- Short enough to recover automatically when Manheim ingests the VIN
  later or transient outages clear.
- Avoids stale "this VIN doesn't exist" answers indefinitely.

**Don't make this 0:** a portal user retrying a missing VIN immediately
would re-fire the API call every time.

**Don't make this match positive TTL:** persistent transient failures
shouldn't poison the cache for a full day.

---

## Lock — anti-stampede

### Lock timeout — **30 seconds** (`LOCK_TIMEOUT_MS = 30_000`)

The maximum time a single request may hold the cache lock before KV
auto-releases it.

**Why 30s:**
- Covers worst-case Manheim latency (token refresh + retry on 5xx).
- Bounded so a crashed/hung worker doesn't deadlock peers forever.
- Cloudflare Workers have a 30s wall-clock CPU budget on the free tier;
  this matches the natural request lifetime.

**If exceeded:** the lock holder's request has already failed (CF kills
it); auto-release lets the next waiter try.

### Wait/retry interval — **250 ms** (`LOCK_RETRY_INTERVAL_MS = 250`)

While waiting for another request to release the lock, poll the cache
every 250ms.

**Why 250ms:**
- Slow enough to avoid burning KV reads on a hot key.
- Fast enough that a 1–2s Manheim call is felt as a small wait.
- Standard CF KV eventual-consistency window is ~60s but writes from the
  same Worker instance are immediately visible — 250ms is well within.

### Max retries — **120** (`LOCK_MAX_RETRIES = LOCK_TIMEOUT_MS / LOCK_RETRY_INTERVAL_MS`)

A waiter polls at most 120 times (30s wall clock) before giving up with
`CacheLockError` (HTTP 503).

**Why derive from the lock timeout:** a waiter should never block
longer than the lock could legitimately be held — beyond that, KV will
have auto-released and a fresh acquire would succeed anyway.

**Phase G tuning candidate:** drop to ~32 (8s) once production latency
is measured. The current value is conservative.

---

## Anti-stampede flow

The intent (interface lives in `src/cache/lock.ts`; impl lands in Phase G):

```
1. cache.get(cacheKey)
   ├─ HIT  → return cached envelope
   └─ MISS → step 2
2. lock.acquire(cacheKey, LOCK_TIMEOUT_MS, requestId)
   ├─ acquired → step 3
   └─ already held → step 6
3. manheim.lookup(...)
4. cache.set(result, POSITIVE_CACHE_TTL or NEGATIVE_CACHE_TTL)
5. lock.release(cacheKey, requestId)  → return envelope
6. lock.wait(cacheKey, LOCK_TIMEOUT_MS)  // polls every LOCK_RETRY_INTERVAL_MS, capped at LOCK_MAX_RETRIES
   ├─ released  → re-read cache (step 1)
   └─ timeout   → throw CacheLockError (HTTP 503)
```

**Property guaranteed:** for any given cache_key, at most ONE Manheim
API call is in flight at a time across the whole Worker fleet.

---

## What lives where

| Concern | Module |
|---|---|
| Constants (TTLs, lock timing) | `src/cache/constants.ts` |
| Lock interface | `src/cache/lock.ts` |
| Lock implementation | (Phase G) |
| MMR cache interface | `src/cache/mmrCache.ts` |
| MMR cache implementation | (Phase G) |
| Cache-key derivation | `src/cache/mmrCacheKey.ts` |

---

## Invalidation paths

### `force_refresh` (manager-only)

Bypasses cache read AND replaces the cached entry. Lock is still
acquired so concurrent users on the same key see the refreshed value.

### Manual invalidation

`mmrCache.invalidate(cacheKey)` — used by the (future) admin route for
operational fixes. Not exposed to portal users.

### TTL expiry

KV's native TTL handles automatic expiry; nothing in the application
layer enforces it.

---

## Change procedure

Any change to TTLs or lock timing requires:
1. ADR in `docs/adr/` documenting the measurement that motivated the change.
2. Update to `src/cache/constants.ts` (single source of truth).
3. Update to this doc's "Why" sections.
