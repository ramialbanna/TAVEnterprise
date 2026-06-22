# MMR Lab — Lookup Flow

**Purpose:** Give a fresh chat enough context to work on `/mmr-lab` without re-reading the whole repo. Dense reference; every line earns its place. Update this when the flow changes, not when individual tasks move.

**Companion docs:** [`NEXT_STEPS.md`](../NEXT_STEPS.md) (task log) · [`MMR-LAB-MAXBUY-PAGE.md`](MMR-LAB-MAXBUY-PAGE.md) (product spec) · [`manheim-cox.md`](../03-api/manheim-cox.md) (Cox API contract)

---

## The 30-second version

Browser → Next.js `/api/app/*` proxy → main worker (`tav-aip-production`, `src/app/routes.ts`) → intel worker (`tav-intelligence-worker-production`, service binding) → Cox MMR 1.4 API → back up the chain. Two response shapes: **ok** (`mmrValue: number` + adjustments + distribution) or **unavailable** (`mmrValue: null` + `missingReason` code). The frontend never sees a fabricated number.

---

## Hops in detail

### 1. Browser — `web/app/(app)/mmr-lab/`

| Component | Role |
|-----------|------|
| `mmr-lab-client.tsx` | Orchestrates state: `view` (empty/loading/ok/unavailable/error), `adjustments`, `attributeMarginals`, `lookupSessionRef`. Owns the 400ms recompute debounce and the in-flight recompute. |
| `search-panel.tsx` | VIN input + YMM dependent dropdowns. On submit calls `onVinSubmit` / `onYmmSubmit` on the client. |
| `result-band.tsx` | Renders Base MMR, MMR Range, Adjusted MMR, retail, Avg Condition, Avg Odometer, EV battery. Houses the MMR Adjustments panel (odometer/grade/color/region/build/express-grade). |
| `mmr-adjustments.ts` | `MmrAdjustments` UI state type, `EMPTY_MMR_ADJUSTMENTS`, `mapMmrAdjustmentsToApi` (UI → Cox query params, incl. `toCoxGradeParam` "4.5"→"45"). |
| `build-mmr-recompute-request.ts` | Builds the `POST /app/mmr/vin|ymm` body for a recompute. |
| `build-mmr-lab-maxbuy-request.ts` | Builds the MaxBuy evaluate body; also owns `MmrLabLookupSession` (the VIN or YMM identity carried across recomputes). |

**Two trigger paths:**

- **Initial lookup** (`onVinSubmit` / `onYmmSubmit`): fires MMR + MaxBuy in parallel (VIN path) or sequentially (YMM path). On MMR success, `applyMmrResult` runs: sets `view=ok`, seeds adjustments from result, clears pending marginals.
- **Recompute** (`handleAdjustmentsChange`): 400ms debounce, then `runMmrRecompute` → `buildMmrRecomputeRequest` → `postMmrVin|postMmrYmm`. On success `applyMmrResult` runs again; on `kind==="unavailable"` sets `view=unavailable` with the reason; on other errors sets `view=error`.

**Recompute race:** If a buyer changes color/grade while an odometer recompute is in-flight, two recomputes overlap. Both target the same intel-worker cache key (VIN+mileage; adjustments are NOT in the key). See hop 4 for how this is handled.

### 2. Next.js proxy — `web/lib/app-api/`

`web/app/api/app/*` routes → `server.ts` `appApiFetch()` → forwards to the main worker with `Authorization: Bearer <APP_API_SECRET>` (server-side only; the browser never sees APP_API_SECRET). The proxy surfaces:

- `proxy_misconfigured` — missing env vars
- `upstream_unavailable` — fetch threw (network / DNS)
- `upstream_non_json` — response wasn't JSON

`parse.ts` `parseMmrVin()` maps the bimodal response:
- `{ mmrValue: number, ... }` → `ok`
- `{ mmrValue: null, missingReason }` → `{ ok: false, kind: "unavailable", error: <reason> }` — the call succeeded, the lookup just couldn't produce a value. NOT treated as a hard error; the UI shows the `UnavailableState` with `codeMessage(reason)`.

`missing-reason.ts` maps reason codes → human copy. Unknown codes fall back to "Not available."

### 3. Main worker — `src/app/routes.ts`

`POST /app/mmr/vin` (`handleMmrVin`) and `POST /app/mmr/ymm` (`handleMmrYmm`):

1. Parse + validate body (`AppMmrVinRequestSchema` / `AppMmrYmmRequestSchema` — narrower than the intel worker's schema; the frontend never sends `force_refresh` or requester identity).
2. Normalize adjustments: `normalizeMmrLookupAdjustments()` (`src/valuation/coxGradeParam.ts`) converts UI grade `"4.5"` → Cox `"45"`. Idempotent — if the grade is already an integer 10–50 it passes through.
3. Build the intel-worker body: `{ vin, year?, mileage?, adjustments? }` for VIN; `{ year, make, model, trim, mileage?, adjustments? }` for YMM.
4. `fetchIntelMmrLookup()` — calls the intel worker via service binding (`env.INTEL_WORKER.fetch`) or HTTP (`INTEL_WORKER_URL`), with `x-tav-service-secret` header.

**Intel worker failure → `missingReason` mapping** (in `fetchIntelMmrLookup`):
- Fetch throws → `intel_worker_unavailable`
- `res === null` (not configured) → `intel_worker_not_configured`
- Non-2xx → `classifyIntelHttpError(status)` (429→`intel_worker_rate_limited`, 5xx→`intel_worker_unavailable`, etc.)
- Envelope zod-parse fails → `envelope_invalid`
- Envelope `ok: false` or `mmr_value: null` → `envelope.error_code ?? "no_mmr_value"` (set by intel worker on 404 / negative cache)

5. On a valid envelope, `mapIntelMmrEnvelopeToAppData()` runs (see "Envelope → app data" below).
6. `resolveIsolatedAdjustmentOverrides()` optionally fires counterfactual lookups for per-field dollar isolation (see "Adjustment isolation" below).
7. Returns `{ ok: true, data }` to the proxy.

**Envelope → app data** (`mapIntelMmrEnvelopeToAppData`):
- Selects the payload item: `selectMmrPayloadItemByStyle(payload, styleName)` for YMM (scores items against the user's trim string), `selectMmrPayloadItem` for VIN (bestMatch / items[0]).
- `extractManheimDistribution()` → `wholesaleBaseAvg` (Base MMR), `wholesaleAvg` (Adjusted MMR), `wholesaleBaseRough/Clean` and `ciRangeLow/High` (MMR Range — CI preferred, falls back to wholesale tiers), `retailAvg/Rough/Clean`, `avgEvBatteryScore`, `sampleCount`.
- `extractManheimAdjustmentBreakdown()` → `buildOptionsAdjustment`, `odometerAdjustment`, `gradeAdjustment`, `colorAdjustment`, `regionAdjustment`. See "Adjustment derivation" below.
- `normalizeAverageGrade()` divides `averageGrade` by 10 when >10 (Cox sends 38 for 3.8).
- `avgOdometer`, `vehicleIdentity` (year/make/model/trim), `marketContext` (historical averages, projected average, transactions).

### 4. Intel worker — `workers/tav-intelligence-worker/`

`handleMmrVin` / `handleMmrYearMakeModel` (`src/handlers/`) → `performMmrLookup()` (`src/services/mmrLookup.ts`):

1. **Resolve mileage** (`resolveLookupMileage`): if `input.mileage` is undefined → no odometer sent to Cox (VIN path) / Cox prices at segment average (YMM path). If supplied, `getMmrMileageData()` classifies it as inferred (bucketed) or actual (exact).
2. **Derive cache key** (`src/cache/mmrCacheKey.ts`):
   - VIN: `vin:${VIN_UPPER}:${mileage}` (mileage bucketed to nearest 5,000 when inferred; exact integer when user-supplied)
   - YMM: `ymm:${year}:${make}:${model}:${trim|base}:${mileage}` (same bucketing rule)
   - **Adjustments are NOT in the cache key.** Two recomputes with different color/grade but same VIN+mileage share a key.
3. **`skipCache = hasMmrLookupAdjustments(adjustments)`** — true whenever any adjustment field is present. Sets `forceRefresh = true`. Cache is neither read nor written.
4. **Lock acquire** (`src/cache/kvLock.ts`, `KvCacheLock`):
   - When `skipCache=true`: **lock is bypassed entirely.** Adjustment recomputes are force-refresh; the lock exists only to prevent stampedes on cache misses, which don't apply. `acquired = skipCache || await lock.acquire(...)`. `release` is skipped too (`if (!skipCache) await lock.release(...)`).
   - When `skipCache=false`: read-then-write KV lock with 50ms settle window. TTL 30s. On `acquire=false`, `wait()` polls for 30s then re-reads cache; throws `CacheLockError` if still empty.
5. **Live Cox call** (`src/clients/manheimHttp.ts`, `ManheimHttpClient`):
   - OAuth client_credentials token (KV-cached, single-flight refresh).
   - VIN: `GET ${MANHEIM_MMR_URL}/vin/{vin}?odometer=...&grade=...&color=...&region=...&excludeBuild=...&include=retail,forecast,historical,ci`
   - YMM: `GET ${MANHEIM_MMR_URL}/search/{year}/{make}/{model}/{body}?...` (bodyname/trim is REQUIRED on Cox vendor)
   - `include=ci` is now sent on both VIN and Search (was previously guarded by `isSearch`).
   - Vendor media type: `application/vnd.coxauto.v1+json`.
   - 404 → `{ mmr_value: null, payload: {} }` (valid "no data" result, not an error).
   - 429 / 5xx retried with exponential backoff (4 attempts, 500ms base, 8s cap, honors `Retry-After`).
6. **Build envelope**: `ok = mmr_value !== null`, `mmr_payload = raw Cox payload`, `mileage_used`, `is_inferred_mileage`, `fetched_at`, `expires_at`.
7. **Cache write** (`if (!skipCache)`): positive TTL 24h, negative TTL 1h.
8. **Persistence** (best-effort, never blocks): `user_activity` insert, `mmr_queries` audit insert, `mmr_cache` Postgres mirror (only on live calls, not cache hits, not adjustment calls).

### 5. Cox MMR 1.4

Sandbox: `https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr`. Production base in `MANHEIM_MMR_URL`. Auth: OAuth `client_credentials` with HTTP Basic header (Cox Bridge 2). `MANHEIM_API_VENDOR=cox` selects the Cox path in `manheimHttp.ts`.

**Per-vehicle response shape (bestMatch item):**
```
{
  wholesale: { average, above, below },              // base MMR + range tiers
  adjustedPricing: {
    wholesale: { average, above, below },            // adjusted MMR + range tiers
    retail: { average, above, below },               // requires include=retail
    confidenceInterval: { priceRange: { adjustedLow, adjustedHigh } },  // include=ci
    adjustedBy: { Odometer, Grade, Color, Region, buildOptions }
  },
  averageOdometer, averageGrade (10x int), averageEvBatteryScore,
  sampleSize (string), items[] (YMM returns multiple)
}
```

---

## Adjustment derivation (`extractManheimAdjustmentBreakdown`)

Cox does NOT send per-field dollar amounts for every adjustment. `adjustedBy` carries:
- `buildOptions`: boolean `true` OR a dollar number
- `Odometer`: often a mileage **string** (not dollars)
- `Grade`: a string code (`"45"` = CR 4.5) — NOT dollars
- `Color`, `Region`: sometimes dollars, sometimes just presence flags

The parser (`src/valuation/manheimResponseParser.ts`) derives per-field dollars through a priority cascade:

1. **Direct dollars** — `readAdjustedByFieldDollars()` reads numeric values from `adjustedBy.{Grade,Color,Region}`. Strings (like grade codes) are ignored here.
2. **Build options** — `extractManheimBuildOptions()`: if `buildOptions` is a number, use it; if `true`, derive from `wholesaleAvg − wholesaleBaseAvg` ONLY when no other attrs are active (otherwise the delta is ambiguous and buildAdj stays null).
3. **Odometer** — if Cox sent dollars, use them; else derive `total − buildAdj` when build is known; else (build flag on, no grade/color/region, odometer ≠ average) assign the full wholesale delta to odometer.
4. **Residual attribution** — when exactly one of grade/color/region is active and its dollar is unknown, assign `total − knownTotal` to that field. Skipped when `odometerContributionUnknown` (odometer ≠ average and odometerAdj is null).

**Counterfactual isolation** (`src/valuation/mmrAdjustmentIsolation.ts`, called from `routes.ts` `resolveIsolatedAdjustmentOverrides`): for the display badges to match Manheim native, the main worker fires additional intel-worker calls with one adjustment removed at a time (`without_grade`, `without_color`, `without_region`, `at_average_odometer`, `without_build`). The per-field dollar is `fullAdjusted − partialAdjusted`. This overrides the parser-derived values when fetched. Only runs when `shouldRunMmrAdjustmentIsolation` is true (i.e., at least one adjustment field or non-average odometer is active).

---

## Invariants (do not violate)

1. **Never round MMR adjustment dollars.** Cox returns exact cents. No `Math.round`, no `toFixed`, no division by 1,000 in the adjustment pipeline. The only acceptable `Math.round` is `nonZeroDelta` in `mmr-adjustment-display.ts` (nearest dollar) because Cox returns whole-dollar integers — do not change it to round to larger increments.
2. **Cache keys with mileage use the exact integer for user-provided odometer.** The 5,000-mile bucket is for inferred/estimated mileage only. Violating this produces stale cached deltas (2026-06-20 incident: 5,000-mi and 5,800-mi returned the same `+$3,000`).
3. **Grade param to Cox is the 10× integer** (`"45"` for CR 4.5). Cox silently ignores decimal grades. Conversion happens in BOTH `mapMmrAdjustmentsToApi` (web) and `normalizeMmrLookupAdjustments` (main worker).
4. **Adjustment recomputes bypass the cache lock.** `skipCache=true` → no `lock.acquire`, no `lock.release`, no `cache.get`, no `cache.set`. They are force-refresh by definition. Reintroducing the lock here causes "Not available" when a buyer changes color/grade during an in-flight odometer recompute.
5. **`adjustedBy.Odometer` is often a mileage string, not dollars.** The parser must handle both; the display pipeline derives odometer dollars from `adjustedMmr − baseMmr` when Cox doesn't send them.
6. **`averageGrade` is a 10× integer** (38 = 3.8). `normalizeAverageGrade()` divides by 10 when >10. Transaction-row conditions use `formatGrade()` in `manheimMarketContextParser.ts` — same rule.
7. **`include=ci` is sent on both VIN and Search.** MMR Range in Manheim native uses `confidenceInterval.priceRange`, not wholesale below/above. The `isSearch` guard was removed 2026-06-22.
8. **Cox 404 = valid "no data", not an error.** Returns `{ mmr_value: null, payload: {} }` and caches negatively for 1h.

---

## File map (where to look)

| Concern | File |
|---------|------|
| MMR Lab page + client orchestration | `web/app/(app)/mmr-lab/_components/mmr-lab-client.tsx` |
| Result band + adjustments UI | `web/app/(app)/mmr-lab/_components/result-band.tsx` |
| Adjustment state + UI→API mapping | `web/app/(app)/mmr-lab/_components/mmr-adjustments.ts` |
| Recompute request builder | `web/app/(app)/mmr-lab/_components/build-mmr-recompute-request.ts` |
| Adjustment badge deltas (display) | `web/app/(app)/mmr-lab/_components/mmr-adjustment-display.ts` |
| App-api schemas (MmrVinOk, etc.) | `web/lib/app-api/schemas.ts` |
| Error kind mapping + parseMmrVin | `web/lib/app-api/parse.ts` |
| Reason code → human copy | `web/lib/app-api/missing-reason.ts` |
| `/app/mmr/vin|ymm` handlers + envelope→app data | `src/app/routes.ts` |
| Grade normalization (4.5→45) | `src/valuation/coxGradeParam.ts` |
| Counterfactual isolation | `src/valuation/mmrAdjustmentIsolation.ts` |
| Cox payload parser (distribution + adjustments) | `src/valuation/manheimResponseParser.ts` |
| Payload item selection (bestMatch / style scoring) | `src/valuation/manheimPayloadItem.ts` |
| MMR schemas + `MmrLookupAdjustments` type | `src/types/intelligence.ts` |
| Intel worker VIN/YMM handlers | `workers/tav-intelligence-worker/src/handlers/mmrVin.ts`, `mmrYearMakeModel.ts` |
| Lookup orchestration (cache + lock + live call) | `workers/tav-intelligence-worker/src/services/mmrLookup.ts` |
| Cache key derivation | `workers/tav-intelligence-worker/src/cache/mmrCacheKey.ts` |
| KV lock | `workers/tav-intelligence-worker/src/cache/kvLock.ts` |
| Cox HTTP client (URLs, OAuth, retry) | `workers/tav-intelligence-worker/src/clients/manheimHttp.ts` |
| Cache constants (TTLs, lock timeout) | `workers/tav-intelligence-worker/src/cache/constants.ts` |
| Smoke test script | `scripts/smoke-mmr-f450.mjs` |

---

## Verify after changes

```bash
cd web && npm run lint && npm run typecheck && npm test
cd .. && npm run lint && npm run typecheck && npm test
```

Deployables: main worker (`tav-aip-production`), intel worker (`tav-intelligence-worker-production`), web (Vercel). Intel worker changes require `wrangler deploy` from `workers/tav-intelligence-worker/`.
