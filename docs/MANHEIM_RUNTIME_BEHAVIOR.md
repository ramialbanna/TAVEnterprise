# Manheim Runtime Behavior

**Status:** Operational reference. Reflects code shipped in Phase G.1.
**Implementation files:**
- `workers/tav-intelligence-worker/src/clients/manheimHttp.ts`
- `workers/tav-intelligence-worker/src/cache/kvMmrCache.ts`
- `workers/tav-intelligence-worker/src/cache/kvLock.ts`
- `workers/tav-intelligence-worker/src/services/mmrLookup.ts`
- `workers/tav-intelligence-worker/src/utils/retry.ts`

**Related design documents:**
- `docs/MANHEIM_INTEGRATION_ARCHITECTURE.md` — design intent, frozen 2026-05-07
- `docs/CACHE_STRATEGY.md` — TTL and lock-timing rationale
- `docs/INTELLIGENCE_CONTRACTS.md` — cache_key derivation, force_refresh authorization

This document is the runtime reference: when a request arrives, what
happens next? It complements (and never duplicates) the architecture
doc above.

---

## 1. Request flow

A handler calls `performMmrLookup({ input, requestId, forceRefresh? })`
with one of two input shapes:

```
{ kind: "vin", vin, year, mileage? }
{ kind: "ymm", year, make, model, trim?, mileage? }
```

The orchestrator runs:

```
1. mileageData = getMmrMileageData(year, mileage, now)
                 // shared helper; returns { value, isInferred, method }
2. cacheKey  = deriveVinCacheKey(vin) | deriveYmmCacheKey(...)
3. if !forceRefresh:
     cached = cache.get(cacheKey)
     if cached:
       log mmr.lookup.complete (cacheHit=true, lockAttempted=false)
       return { ...cached, cache_hit: true }
4. acquired = lock.acquire(cacheKey, LOCK_TIMEOUT_MS, requestId)
   if acquired:
     try {
       if !forceRefresh:
         recheck = cache.get(cacheKey)
         if recheck: return { ...recheck, cache_hit: true }
       result = client.lookup{ByVin|ByYmm}({ ..., mileage: mileageData.value })
       envelope = build(result, mileageData)
       try { cache.set(envelope, ttl) } catch { log; do not block response }
       return envelope
     } finally {
       lock.release(cacheKey, requestId)
     }
   else:
     lock.wait(cacheKey, LOCK_TIMEOUT_MS)
     afterWait = cache.get(cacheKey)
     if afterWait: return { ...afterWait, cache_hit: true }
     throw new CacheLockError("Lock contention exceeded wait window")
```

Three exit points: cache hit, fresh fetch, or `CacheLockError`. Manheim
errors thrown by the client (auth, rate-limit, unavailable, response-shape)
bubble up unchanged for the handler layer to map to HTTP responses.

---

## 2. Cache flow

**Implementation:** `KvMmrCache` in `cache/kvMmrCache.ts`.

| Operation | KV layout | Notes |
|---|---|---|
| `get(cacheKey, requestId)` | `kv.get('mmr:' + cacheKey, { type: 'json' })` | Returns parsed `MmrResponseEnvelope` or `null`. Malformed JSON is logged and treated as a miss. |
| `set(cacheKey, envelope, ttlSeconds, requestId)` | `kv.put('mmr:' + cacheKey, JSON.stringify(value), { expirationTtl })` | TTL clamped to ≥60s (KV minimum). |
| `invalidate(cacheKey, requestId)` | `kv.delete('mmr:' + cacheKey)` | Used by future admin route + `force_refresh` paths. |

### Key derivation

VIN: `vin:${VIN.trim().toUpperCase()}`
YMM: `ymm:${year}:${make}:${model}:${trim ?? 'base'}:${mileageBucket}` —
make/model/trim normalized via `s.trim().toLowerCase().replace(/\s+/g, '_')`.
`mileageBucket = Math.round(mileage / 5000) * 5000`.

See `INTELLIGENCE_CONTRACTS.md §A` for the full normalization rules.

### TTL handling

| Scenario | TTL constant | Value |
|---|---|---|
| `mmr_value !== null` | `POSITIVE_CACHE_TTL_SECONDS` | 86_400 (24h) |
| `mmr_value === null` (404 or no MMR data) | `NEGATIVE_CACHE_TTL_SECONDS` | 3_600 (1h) |

`expires_at` in the envelope is computed as `now + ttl` and stored alongside
the data so callers can reason about staleness without a second KV read.

### Hit/miss/set/invalidate logging

Every cache operation emits a structured log line:

| Event | Fields |
|---|---|
| `mmr.cache.hit` | `requestId`, `cacheKey` |
| `mmr.cache.miss` | `requestId`, `cacheKey`, `reason?` (e.g. `json_parse_error`) |
| `mmr.cache.set` | `requestId`, `cacheKey`, `ttl_seconds` |
| `mmr.cache.invalidate` | `requestId`, `cacheKey` |

Negative cache hits are still hits: a cached `mmr_value: null` envelope
returns immediately without contacting Manheim, until its 1h TTL expires.

---

## 3. Lock flow

**Implementation:** `KvCacheLock` in `cache/kvLock.ts`.

### Acquire

```
1. existing = kv.get('lock:' + key)
   if existing !== null → return false (lock held)
2. ttlSeconds = max(60, ceil(ttlMs / 1000))    // KV minimum
3. kv.put('lock:' + key, requestId, { expirationTtl: ttlSeconds })
4. sleep 50ms                                  // KV settle window
5. verify = kv.get('lock:' + key)
6. return verify === requestId
```

### Best-effort race window

Cloudflare KV has **no compare-and-swap primitive**. Two concurrent
acquires can:

- Both read step 1 as "absent."
- Both write step 3.
- Each verify in step 5 returns whichever write the local colo most
  recently received.

The race window is approximately **100ms** (write propagation + 50ms
settle). At most one caller's verify returns its own requestId; the
other returns false (the impl logs `mmr.lock.race_lost`).

**Why this is acceptable here:**
- Manheim lookups are idempotent — a duplicate is a cost, not a correctness
  violation.
- Cache writes are last-write-wins; both writers produce the same envelope
  modulo `fetched_at` (which differs by milliseconds).
- The only downside is one extra Manheim API call per lost race.

**Future migration:** if Manheim ever becomes per-call billed at a rate
that makes duplicates costly, replace this with a Durable Object lock for
true atomicity. The `CacheLock` interface is intentionally narrow so the
swap requires no caller changes.

### Wait

```
start = Date.now()
while Date.now() - start < maxWaitMs:
  if kv.get('lock:' + key) === null: return
  sleep LOCK_RETRY_INTERVAL_MS  // 250ms
// Timeout: caller decides what to do (typically: re-check cache,
// throw CacheLockError if still empty).
```

`wait` returns even if the lock is still held — the caller is responsible
for distinguishing "released, cache populated" from "timed out, cache
still empty."

### Release

```
current = kv.get('lock:' + key)
if current === requestId: kv.delete('lock:' + key)
// Else: no-op. Most often the lock TTL'd out before we got here.
```

Release-by-non-owner is a no-op, NOT an error. Phase G.1's `mmrLookup`
service always releases in a `finally` block, so a Manheim error never
strands the lock — it either gets released cleanly or eventually expires
via TTL.

### Lock timing constants

| Constant | Value | Where |
|---|---|---|
| `LOCK_TIMEOUT_MS` | 30_000 (30s) | both acquire-TTL and wait-window cap |
| `LOCK_RETRY_INTERVAL_MS` | 250 | poll interval inside `wait` |
| KV settle window | 50ms (hardcoded) | sleep between write and verify |
| KV TTL minimum | 60s (platform constraint) | clamp inside `acquire` |

---

## 4. Retry flow

**Implementation:** `retryWithBackoff` in `utils/retry.ts`, wired by
`ManheimHttpClient.fetchWithRetry`.

### Retry policy

| Error condition | Retry? | Notes |
|---|---|---|
| Network throw (fetch threw) | yes | wrapped in internal `NetworkError` |
| HTTP 429 | yes | honors `Retry-After` header |
| HTTP 500, 502, 503, 504 | yes | generic 5xx |
| HTTP 401, 403 | no | `ManheimAuthError` (502 to caller) |
| HTTP 400, 404 | no | 404 specifically returns `mmr_value: null` |
| HTTP 422 | no | `ManheimResponseError` |
| Malformed JSON in body | no | `ManheimResponseError` |

### Backoff formula

```
exp     = min(baseDelayMs * 2^(attempt-1), maxDelayMs)
jitter  = (random() * 2 - 1) * jitterRatio    // ∈ [-jitterRatio, +jitterRatio]
delayMs = max(0, floor(exp * (1 + jitter)))
```

With Phase G.1 settings — `baseDelayMs=500`, `maxDelayMs=8000`,
`jitterRatio=0.3`, `maxAttempts=4` — the unjittered schedule is:

| Attempt | Wait BEFORE this attempt |
|---|---|
| 1 | 0 |
| 2 | 500ms |
| 3 | 1000ms |
| 4 | 2000ms |
| Total wall-clock ceiling (no jitter) | ~3.5s + Manheim latency |
| Total wall-clock ceiling (worst-case +30% jitter on every step) | ~4.5s + Manheim latency |

### `Retry-After` honoring on 429

When Manheim returns 429 with a `Retry-After: <seconds>` header:

```
honored_delay = max(scheduled_backoff, retry_after_ms)
```

The current implementation logs `manheim.lookup.retry_after_observed`
with both `scheduled_delay_ms` and `honored_delay_ms` so operators can
audit Manheim's published rate limits against our backoff. The retry
helper's scheduled delay is used as a soft floor — in practice with
`baseDelayMs=500` and `Retry-After` typically 1–5s, the schedule is
already comfortably above what Manheim asks.

### Exhaustion outcomes

| Final state | Thrown error |
|---|---|
| Last attempt was 429 | `ManheimRateLimitError` |
| Last attempt was 5xx | `ManheimUnavailableError` |
| Last attempt was network error | `ManheimUnavailableError` |
| Body was malformed JSON | `ManheimResponseError` |

All four extend `IntelligenceError` and have `httpStatus: 502`.

---

## 5. Token flow (OAuth password grant)

### Cached token storage

```
KV key:    manheim:token
KV value:  JSON.stringify({ access_token, expires_at })
KV TTL:    max(60, expires_in - 60)       // 60s buffer + KV minimum
```

### Lookup-time decision

```
1. cached = kv.get('manheim:token')
2. if cached && cached.expires_at > now + 60_000: return cached.access_token
3. else: refreshTokenSingleFlight()
```

The 60s expiry buffer (`TOKEN_EXPIRY_BUFFER_MS = 60_000`) is symmetric
with the 60s KV TTL subtraction — we refresh well before the token
actually expires, avoiding edge races on long-tail requests.

### Single-flight refresh

```
1. existing = kv.get('lock:manheim:token:refresh')
2. if existing && existing !== requestId:
     for i in 1..10:                              // up to ~2.5s total
       sleep 250ms
       refreshed = kv.get('manheim:token')
       if refreshed valid: return refreshed.access_token
     throw ManheimAuthError("lock_wait_timeout")
3. kv.put('lock:manheim:token:refresh', requestId, { expirationTtl: 10s })
4. try fetch token, store in KV
   finally release lock if we still own it
```

The same best-effort race caveat applies: two concurrent first-time
requests can both refresh. The token endpoint is idempotent and the KV
write is last-write-wins, so the worst case is one redundant OAuth call.

### Refresh-on-401 is caller-driven

The MMR endpoint returning 401/403 is mapped to `ManheimAuthError`
**without** automatically refreshing the token. The next inbound request
will re-read KV, see the token still valid (or expired), and refresh on
its own. This avoids a feedback loop where a broken bearer token
triggers a refresh storm.

If we ever need automatic refresh-on-401, gate it behind a single retry
in `executeLookup` so the caller still sees at most one refresh per
request.

### Failure modes

| Origin | Mapped to |
|---|---|
| Token endpoint network error | `ManheimAuthError("network")` |
| Token endpoint 401/403 | `ManheimAuthError("Manheim rejected OAuth credentials")` |
| Token endpoint 5xx | `ManheimAuthError("non-OK")` (per current impl) |
| Token endpoint malformed JSON | `ManheimAuthError("not JSON")` |
| Missing access_token / expires_in | `ManheimAuthError("missing fields")` |
| Lock-wait timeout | `ManheimAuthError("lock held")` |

All token-side failures surface as `ManheimAuthError` (HTTP 502) rather
than 401 — internal portal callers do not own Manheim's OAuth state, so
exposing 401 would be misleading.

---

## 6. Negative cache handling

A 404 from Manheim's MMR endpoint indicates "no data for this VIN/YMM
+ mileage combination at this moment." It is **a valid result, not an
error**:

```json
{
  "ok": false,
  "mmr_value": null,
  "mileage_used": 60000,
  "is_inferred_mileage": false,
  "cache_hit": false,
  "source": "manheim",
  "fetched_at": "2026-05-07T12:00:00Z",
  "expires_at": "2026-05-07T13:00:00Z",
  "mmr_payload": {},
  "error_code": null,
  "error_message": null
}
```

(Note `ok: false` because `mmr_value !== null` is false — `ok` mirrors
the data, not the HTTP success. The HTTP response itself is 200.)

This envelope is cached for `NEGATIVE_CACHE_TTL_SECONDS` (1 hour). On
the next lookup within that window, the cache hit returns instantly
without contacting Manheim. After expiry, the next lookup retries —
useful when Manheim ingests the VIN later or transient outages clear.

**Never cached:** `ManheimAuthError`, `ManheimRateLimitError`,
`ManheimUnavailableError`, `ManheimResponseError`, `CacheLockError`.
These are operational problems, not data states; caching them would
hide recovery.

---

## 7. Failure mode reference

| Thrown error | HTTP status | Body `code` | Caller retry guidance |
|---|---|---|---|
| `ValidationError` | 400 | `validation_error` | No — fix the request. |
| `AuthError` | 401 (anon) / 403 (force_refresh denied) | `auth_error` | No — surface to the user. |
| `ManheimAuthError` | 502 | `manheim_auth_error` | No — operational alert; do not retry from the portal. |
| `ManheimRateLimitError` | 502 | `manheim_rate_limited` | Maybe — wait several minutes. Internal portals are not the rate-limit owner. |
| `ManheimUnavailableError` | 502 | `manheim_unavailable` | Yes — Manheim is the upstream; transient outage likely. |
| `ManheimResponseError` | 502 | `manheim_response_error` | No — schema drift; needs operator action. |
| `CacheLockError` | 503 | `cache_lock_error` | Yes — single-flight contention; back off and retry. |
| `PersistenceError` | 503 | `persistence_error` | Yes — Supabase transient. |
| Anything else | 500 | `internal_error` | Logged with full detail; response carries no third-party messages. |

The mapping lives at the worker's top-level `fetch` catcher (not in scope
for Phase G.1, lands when handlers wire the service in Phase G.2).

---

## 8. Observability strategy

All log lines are JSON, one per line, written via `utils/logger.ts`. Every
line includes `requestId`. The `kpi: true` flag marks events surfaced in
operational dashboards.

### Manheim client events (`manheimHttp.ts`)

| Event | Adds |
|---|---|
| `manheim.lookup.started` | `lookup_type`, `cache_key`, `mileage_used` |
| `manheim.lookup.attempt` | `attempt`, `status`, `latency_ms` |
| `manheim.lookup.retry_after_observed` | `attempt`, `retry_after_ms`, `scheduled_delay_ms`, `honored_delay_ms` |
| `manheim.lookup.complete` | `mmr_value`, `latency_ms`, `attempts`, `kpi: true` |
| `manheim.lookup.failed` | `error_category`, `error_code`, `attempts` |
| `manheim.token.cached` | `age_seconds` |
| `manheim.token.refresh_started` | (no extras) |
| `manheim.token.refresh_complete` | `expires_in` |
| `manheim.token.refresh_failed` | `status`, `error_category` |

### Cache events (`kvMmrCache.ts`)

| Event | Adds |
|---|---|
| `mmr.cache.hit` | `cacheKey` |
| `mmr.cache.miss` | `cacheKey`, `reason?` |
| `mmr.cache.set` | `cacheKey`, `ttl_seconds` |
| `mmr.cache.invalidate` | `cacheKey` |

### Lock events (`kvLock.ts`)

| Event | Adds |
|---|---|
| `mmr.lock.held_by_other` | `key`, `holder` |
| `mmr.lock.acquired` | `key`, `ttl_seconds` |
| `mmr.lock.race_lost` | `key`, `observed_owner` |
| `mmr.lock.released` | `key` |
| `mmr.lock.release_skipped` | `key`, `observed_owner` |

### Orchestrator events (`mmrLookup.ts`)

| Event | Adds |
|---|---|
| `mmr.lookup.complete` | `route`, `cacheHit`, `lockAttempted`, `cacheKey`, `inferredMileage`, `retryCount`, `latencyMs`, `kpi: true` |
| `mmr.lookup.cache_set_failed` | `cacheKey`, `error_message` |

### Secrets

The Manheim client never logs `MANHEIM_PASSWORD` or `MANHEIM_CLIENT_SECRET`
values. Token endpoint failures log `status` and `error_category` only —
not the request body. A regression test in
`clients/__tests__/manheimHttp.test.ts` asserts this on every code path.

### KPI events (operational dashboards)

Three event names carry `kpi: true`:
- `mmr.lookup.complete` (Manheim client) — every Manheim API call
- `mmr.lookup.complete` (orchestrator) — every cache resolution
- `manheim.lookup.complete` — same as the first; aliased name retained for
  pre-G.1 dashboards

Dashboard queries should filter on `kpi == true` and partition by `event`
to disambiguate the orchestrator-level total from the Manheim-only total.

---

## 9. Rate-limit protections

Manheim publishes `Retry-After` on 429. The retry path:

```
on 429:
  retryAfter = parseInt(response.headers.get('Retry-After')) ?? null
  // The retry helper's scheduled backoff continues to apply; if it's
  // below retryAfter, the helper logs the gap and the caller knows the
  // ask was honored only "softly." See retry_after_observed event.
  retry up to attempt cap (default 4)
```

If the rate limit persists past the retry cap:

- Throw `ManheimRateLimitError` with `{ retry_after_ms, attempts }`.
- HTTP response: 502 (NOT 429). Internal portals are not the rate-limit
  owner — exposing 429 would suggest the portal user should slow down,
  when in fact the issue is a shared upstream account.
- Log a `manheim.lookup.failed` event with `error_category: 'rate_limited'`
  and `error_code: 'manheim_rate_limited'`. Operators alert on this.

### Account-wide rate-limit caveats

The Manheim account is shared across the entire intelligence-Worker
fleet. A single hot key (e.g. an unusually popular VIN) being looked up
500 times in 10 seconds will hit the rate limit even though each *user*
only made one request. The MMR cache + anti-stampede lock are designed
specifically to keep this from happening — but if it does, exhaustion
of the per-process retry budget is the safety valve, not the goal.

---

## 10. Where this doc stops and the next phase begins

Phase G.1 covers everything above. Phase G.2 will:

- Wire `mmrVin` and `mmrYearMakeModel` handlers to call
  `performMmrLookup`.
- Add Postgres mirrors (`tav.mmr_cache`, `tav.mmr_queries`) using the
  same `MmrCache` interface.
- Surface integration tests against real Supabase + a mocked
  Manheim client.

When that lands, this doc grows new sections under §1 (handler invocation)
and §6 (cache mirror). The contracts in §1–§9 are stable and any change
requires an ADR.
