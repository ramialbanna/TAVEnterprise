# Manheim Integration Architecture

**Status:** Operational reference. Frozen 2026-05-07 ahead of Phase G implementation.
**Implementation home:** `workers/tav-intelligence-worker/src/clients/manheim.ts` (Phase G)
**Related:**
- `docs/INTELLIGENCE_CONTRACTS.md` — cache_key, segment_key, user context, force_refresh
- `docs/CACHE_STRATEGY.md` — TTLs and lock timing
- `src/scoring/mmrMileage.ts` — inferred-mileage helper (root, reusable)
- `src/valuation/mmr.ts` — existing main-Worker Manheim client (will be migrated)

The intelligence Worker is the single point of contact with Manheim's
MMR API. Every concern below is a property of that single integration.

---

## 1. Layered architecture

```
HTTP route                  /mmr/vin, /mmr/year-make-model
       │
       ▼
Handler                     handlers/mmrVin.ts
       │ Zod validate, AuthError on anon, force_refresh check
       ▼
Cache lookup                cache/mmrCache.ts (interface)
       │ HIT → return; MISS → step ↓
       ▼
Lock acquire                cache/lock.ts (interface)
       │ acquired → step ↓; held by other → wait → re-read cache
       ▼
Mileage resolution          scoring/mmrMileage.ts (pure)
       │
       ▼
Manheim client              clients/manheim.ts
       │ OAuth, retry, error mapping
       ▼
Cache write + audit log     cache + persistence/mmrQueries
       │
       ▼
Lock release
       │
       ▼
Response envelope           types/api.ts
```

Each layer has one job and one error-mapping rule (see §10).

---

## 2. OAuth flow

The intelligence Worker supports two vendor profiles selected via
`MANHEIM_API_VENDOR`. The current Cox sandbox account uses Bridge 2 /
`client_credentials`; the legacy Manheim password-grant flow is retained for
older accounts.

| Secret | Purpose |
|---|---|
| `MANHEIM_API_VENDOR` | `"cox"` (default for Cox accounts) or `"manheim"` (legacy) |
| `MANHEIM_GRANT_TYPE` | `"client_credentials"` (Cox) or `"password"` (legacy default) |
| `MANHEIM_SCOPE` | OAuth scope (Cox: `wholesale-valuations.vehicle.mmr-ext.get`) |
| `MANHEIM_CLIENT_ID` | OAuth client identifier |
| `MANHEIM_CLIENT_SECRET` | OAuth client secret (NEVER log) |
| `MANHEIM_TOKEN_URL` | OAuth token endpoint |
| `MANHEIM_MMR_URL` | MMR API base URL. Cox: `https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr` (path-prefixed, MMR 1.4). Legacy: `https://api.manheim.com` (host-only). |
| `MANHEIM_USERNAME` | Required only for `password` grant (legacy) |
| `MANHEIM_PASSWORD` | Required only for `password` grant (legacy) |

### 2a. Cox Bridge 2 (`client_credentials`) — current

1. Read the cached token from KV (`manheim:token`).
2. If absent or `expires_at < now + 60s`, request a new token.
3. POST to `MANHEIM_TOKEN_URL` with:
   - Header: `Authorization: Basic base64(client_id:client_secret)`
   - Header: `Content-Type: application/x-www-form-urlencoded`
   - Body: `grant_type=client_credentials&scope=${MANHEIM_SCOPE}`
   - **Body must NOT contain `client_id`, `client_secret`, `username`, or `password`.**
4. On 200, store `{ access_token, expires_at }` in KV with TTL = `expires_in - 60s`.
5. Use `access_token` as `Authorization: Bearer ...` for lookups, alongside Cox vendor
   media headers (`Accept` and `Content-Type` = `application/vnd.coxauto.v1+json`).

**Cox MMR 1.4 endpoint paths** appended to `MANHEIM_MMR_URL`:

- VIN: `GET /vin/{vin}` (path-segment; no query string)
- YMMT: `GET /search/{year}/{makename}/{modelname}/{bodyname}` — `bodyname` (trim) is REQUIRED
- Trimless YMM calls short-circuit to `mmr_value: null` (log `manheim.http.skipped`,
  no fetch); ingest stays non-blocking. See `docs/COX_API_INTEGRATION.md` §3.

### 2b. Legacy Manheim (`password` grant) — fallback

1. Same KV cache read.
2. POST to `MANHEIM_TOKEN_URL` with body `grant_type=password`, `username`, `password`,
   `client_id`, `client_secret`. No Basic header.
3. Same caching and bearer use.

### Token failure modes (both flows)

- `400 invalid_scope` → `ManheimAuthError` (log adds `error_code: "invalid_scope"`).
- `401` from token endpoint → `ManheimAuthError`. Surface as 502.
- `5xx` from token endpoint → retry per §5; if exhausted, `ManheimUnavailableError`.
- Network error → retry per §5.

---

## 3. Token refresh lifecycle

Token caching is **single-flight**. Two concurrent requests must not
both refresh.

**Pattern (uses the same lock primitive as MMR cache, scoped to a
different key):**
```
1. Read mmr:token from KV.
2. If valid (expires_at > now + 60s), use it.
3. Else, acquire lock("mmr:token:refresh", ttl=10s).
   ├─ acquired → fetch new token, write to KV, release lock.
   └─ held by other → wait (poll 100ms × 50), then re-read mmr:token.
4. If still no valid token after wait, throw ExternalApiError.
```

**Why a separate lock TTL (10s)** for token refresh: token endpoints
are fast (sub-second typically). 10s is the upper bound of "OAuth call
took too long, give up so the next request can try."

**Existing main-Worker behavior (`src/valuation/mmr.ts`):** has token
caching but **no single-flight protection** — flagged as a follow-up
in `docs/followups.md`. The intelligence-Worker rewrite resolves this.

---

## 4. Cache lookup sequence (the happy path)

```
GET (or POST) /mmr/vin { vin, mileage?, force_refresh? }
  │
  1. extractUserContext(request)
  2. canForceRefresh(ctx, env.MANAGER_EMAIL_ALLOWLIST) if force_refresh requested
  3. mileageData = getMmrMileageData(year, mileage, now)  // see §7
  4. cacheKey = deriveVinCacheKey(vin)  // or deriveYmmCacheKey(...)
  5. cached = mmrCache.get(cacheKey, requestId)
     ├─ HIT and !force_refresh → return cached envelope, log cache_hit=true
     └─ MISS or force_refresh → step ↓
  6. lock.acquire(cacheKey, LOCK_TIMEOUT_MS, requestId)
     ├─ acquired → step ↓
     └─ held by other → step 9
  7. result = manheim.lookupByVin({ vin, mileage: mileageData.value, requestId })
  8. ttl = result.mmr_value === null ? NEGATIVE_CACHE_TTL_SECONDS : POSITIVE_CACHE_TTL_SECONDS
     mmrCache.set(cacheKey, envelope, ttl, requestId)
     persistence.writeMmrQuery({ ..., cache_hit: false, source: 'manheim', is_inferred_mileage })
     persistence.writeMmrCache({ ..., expires_at: now + ttl })  // Postgres mirror
     lock.release(cacheKey, requestId)
     return envelope
  9. lock.wait(cacheKey, LOCK_TIMEOUT_MS)
     re-read cacheKey
     ├─ HIT now → return cached envelope, log cache_hit=true (after_wait)
     └─ still MISS → throw CacheLockError
```

Step 8 writes to **both KV (hot) and Postgres `tav.mmr_cache` (queryable)**
per Q5/audit decision. KV is authoritative for reads; Postgres serves
analytics + cold-start recovery.

---

## 5. Retry / backoff rules

All Manheim calls (token + lookup) use the same retry policy:

| Attempt | Wait before retry |
|---|---|
| 1 | (immediate) |
| 2 | 500 ms |
| 3 | 1500 ms |
| 4 | 4500 ms |
| Total ceiling | ~6.5 s |

**Retry on:**
- Network error (fetch throws)
- 429 Too Many Requests (also see §10)
- 500, 502, 503, 504

**Do NOT retry on:**
- 400 (malformed request — bug, not transient)
- 401 (auth failure — token refresh is its own lifecycle)
- 403 (forbidden)
- 404 (no MMR for this VIN — surfaced as `mmr_value: null`, NOT an error)
- 422 (invalid VIN format — surfaced as ValidationError)

After exhaustion: `ExternalApiError("manheim_unavailable", { last_status, attempts })`.

---

## 6. Negative caching behavior

A 404 from Manheim (or any successful response with no MMR) is **a
valid result**, not an error. The envelope returns:

```json
{
  "ok": true,
  "mmr_value": null,
  "mileage_used": 60000,
  "is_inferred_mileage": false,
  "cache_hit": false,
  "source": "manheim",
  "fetched_at": "2026-05-07T12:00:00Z",
  "expires_at": "2026-05-07T13:00:00Z",
  "error_code": null,
  "error_message": null
}
```

Stored in cache for `NEGATIVE_CACHE_TTL_SECONDS` (1h). On the next
lookup within that window, the `mmr_value: null` envelope is returned
from cache without hitting Manheim. After expiry, the lookup is retried
once — useful when Manheim ingests the VIN later.

**Never cache:** `ExternalApiError`, network failures, `CacheLockError`.
These are operational problems, not data states.

---

## 7. Inferred mileage flow

If the request omits `mileage` (or the listing has none), the helper
inserts an estimate **before** the cache key is derived.

```
1. mileageData = getMmrMileageData(year, listedMiles ?? null, now)
   //   { value, isInferred, method }
2. cacheKey =
     listing.vin
       ? deriveVinCacheKey(vin)                       // not mileage-keyed
       : deriveYmmCacheKey({ ..., mileage: mileageData.value })
3. Pass mileageData.value to Manheim.
4. Persist is_inferred_mileage = mileageData.isInferred on both
   tav.mmr_queries and tav.mmr_cache.
5. Echo is_inferred_mileage in the response envelope.
```

VIN lookups still use inferred mileage as a Manheim input, but the
cache key is just `vin:${VIN}` — VIN is already model-specific.

---

## 8. requestId propagation

Every request gets a fresh UUID (`utils/requestId.ts`,
`crypto.randomUUID()`) at the entry boundary in `src/index.ts`.

The requestId flows through:
- All log lines (`utils/logger.ts` always includes it as a top-level field)
- `lock.acquire / release / wait` parameters (so KV traces show ownership)
- `manheim.lookupByVin / lookupByYmm` parameters (echoed in HTTP request as `X-Request-Id` header)
- `tav.mmr_queries` row (`request_id` column — consider adding in a future migration)
- Response envelope (`requestId` field of `ApiResponse<T>`)

A correlated trace across logs / KV / Postgres / response is the goal.

---

## 9. Failure routing

| Origin | Error type | HTTP | Body code |
|---|---|---|---|
| Zod validate | `ValidationError` | 400 | `validation_error` |
| Anonymous on protected route | `AuthError` | 401 | `auth_error` |
| `force_refresh` denied | `AuthError` | 403 | `auth_error` |
| Manheim 5xx exhausted | `ExternalApiError` | 502 | `external_api_error` |
| Manheim auth failed | `ExternalApiError` | 502 | `external_api_error` |
| Lock wait timeout | `CacheLockError` | 503 | `cache_lock_error` |
| Supabase write failed | `PersistenceError` | 503 | `persistence_error` |
| Anything else | (caught at top) | 500 | `internal_error` |

Top-level handler in `src/index.ts` catches `IntelligenceError`
subclasses and emits the canonical envelope. Unknown errors are
logged with full detail but the response carries only
`internal_error` — never leak stack traces or third-party messages.

---

## 10. Rate-limit handling (Manheim 429)

Manheim publishes `Retry-After` on 429. The retry policy honors it:

```
on 429 response:
  retryAfter = parseInt(response.headers.get('Retry-After')) ?? 0
  wait = max(retryAfter * 1000, scheduledBackoff)
  retry up to attempt cap (§5)
```

If the rate limit persists past the retry cap:
- Throw `ExternalApiError("manheim_rate_limited", { retry_after, attempts })`
- Response: 502 (NOT 429 — clients of the intelligence Worker are
  internal portals, not Manheim consumers).
- Log a `rate_limited` event with KPI flag for alerting.

---

## 11. Fallback behavior

When Manheim is unreachable, scoring must degrade gracefully — never block
the buy-box pipeline:

| Caller | Fallback |
|---|---|
| Intelligence Worker portal | Return 502 with explicit error envelope. Portal shows "MMR temporarily unavailable, retry in a moment." |
| Main Worker hybrid scoring (Phase I) | `marketVelocityScore` = 50 (neutral); `dealScore` already handles `mmrValue === undefined` gracefully. Lead is created with reduced confidence. |
| Bulk replay endpoint | Skip MMR for that listing (snapshot remains stale); proceed with rule + segment + demand scoring only. |

**Never:** silently substitute a fake MMR. Always surface the gap so
downstream knows confidence is reduced.

---

## 12. Structured logging

All log lines are JSON, one per line, written via `utils/logger.ts`.
Top-level fields always present:

| Field | Description |
|---|---|
| `event` | Dot-namespaced event name (e.g. `mmr.lookup.cache_hit`) |
| `requestId` | UUID for the inbound request |
| `timestamp` | ISO 8601, ms precision |
| `level` | `info` / `warn` / `error` |

Per-event fields (selected):

| Event | Adds |
|---|---|
| `mmr.lookup.started` | `lookup_type`, `cache_key`, `force_refresh`, `is_inferred_mileage` |
| `mmr.lookup.cache_hit` | `cache_key`, `source` (kv \| postgres), `age_seconds` |
| `mmr.lookup.cache_miss` | `cache_key` |
| `mmr.lookup.lock_acquired` | `cache_key` |
| `mmr.lookup.lock_held_by_other` | `cache_key` |
| `mmr.lookup.manheim_request` | `attempt`, `latency_ms`, `status` |
| `mmr.lookup.manheim_failure` | `error_category`, `error_code`, `attempt` |
| `mmr.lookup.complete` | `mmr_value`, `cache_hit`, `kpi: true` |
| `mmr.token.refresh` | `expires_in` |
| `mmr.token.refresh_failure` | `status`, `error_message` |

The `kpi: true` flag marks events surfaced in operational dashboards.

---

## 13. Audit logging — `tav.mmr_queries`

**Every** lookup writes one row, regardless of cache hit or failure.

| Column | Source |
|---|---|
| `vin` / `year` / `make` / `model` / `trim` | request body |
| `mileage_used` | `mileageData.value` |
| `is_inferred_mileage` | `mileageData.isInferred` |
| `lookup_type` | `'vin'` or `'year_make_model'` |
| `requested_by_user_id` / `_name` / `_email` | from `extractUserContext` |
| `source` | `'cache'` (KV hit) / `'manheim'` (live fetch) / `'manual'` (force_refresh) |
| `cache_hit` | true on KV hit, false otherwise |
| `force_refresh` | request body flag |
| `mmr_value` | result, possibly null |
| `mmr_payload` | raw Manheim JSON when source='manheim'; null on cache hit |
| `error_code` / `error_message` | non-null only when the lookup failed |
| `created_at` | now() |

This is the audit trail surfaced by the "who already searched this VIN"
portal feature.

**Best-effort writes:** if Postgres is down, the lookup still completes
and a fallback log line is emitted with `audit_write_failed=true`. Don't
block the user on persistence.

---

## 14. Cache invalidation strategy

| Path | Trigger | Effect |
|---|---|---|
| **TTL expiry** | KV native TTL fires | Entry vanishes; next lookup is a miss |
| **`force_refresh`** | Authorized user sets `force_refresh: true` | Bypass cache read; on success, overwrite cache (KV + Postgres) |
| **Manual** | (Future) admin route `POST /admin/mmr/invalidate` | Single-key delete from KV + Postgres |
| **Bulk** | (Future) admin route `POST /admin/mmr/flush` | Full cache wipe — only used after a cache_key derivation change (see CONTRACTS §A change procedure) |

**No automatic invalidation on Postgres updates.** If a sales record
implies a new MMR baseline, that is a downstream insight — it does NOT
poison the Manheim-sourced cache. Different concept; different table.

---

## Implementation milestones (Phase G targets)

1. `clients/manheim.ts` — full impl behind the existing interface.
2. `cache/mmrCache.ts` — KV reads/writes, with TTL handling.
3. `cache/lock.ts` — single-flight via KV `put` with `expirationTtl` and `metadata`.
4. `persistence/mmrQueries.ts` — Postgres audit log writer.
5. `persistence/mmrCache.ts` — Postgres cache mirror writer.
6. `handlers/mmrVin.ts` and `mmrYearMakeModel.ts` — wire all of the above.
7. Integration tests (`/test/intelligence.mmr.int.test.ts`) — real Supabase, mocked Manheim.

Each milestone is a separate PR. The interfaces are already locked.
