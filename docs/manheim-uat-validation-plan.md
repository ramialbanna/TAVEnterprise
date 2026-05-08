# G.5.4 — Staging UAT Validation Plan: Cox Wholesale-Valuations Integration

Validates the tav-intelligence-worker's Cox/Manheim HTTP client against the Cox sandbox
environment (`sandbox.api.coxautoinc.com/wholesale-valuations/vehicle`) before enabling
`MANHEIM_LOOKUP_MODE="worker"` in staging. No live API calls are made during planning.
All curl examples are for manual execution during UAT.

**Vendor profile:** Cox Bridge 2 / `client_credentials`. Legacy Manheim
`uat.api.manheim.com/valuations` integration is not provisioned for our account and is
retained in code only as a fallback (`MANHEIM_API_VENDOR=manheim`).

**Not covered:** VIN data accuracy (business QA), MMR value correctness, Apify ingest
pipeline, alerts.

---

## 0.5 Cox Sandbox Facts (confirmed 2026-05-08)

These are now confirmed from the Cox app detail page and Bridge 2 OAuth documentation:

| Item | Value |
|---|---|
| OAuth server | Bridge 2 |
| Application type | `server_to_server` |
| Grant type | `client_credentials` |
| Scope | `wholesale-valuations.vehicle.mmr-ext.get` |
| Token endpoint | `https://authorize.coxautoinc.com/oauth2/.../v1/token` (exact path is per-app — copy verbatim from the Cox app detail page) |
| MMR API base | `https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle` |
| Enabled endpoints | `/mmr`, `/mmr-batch`, `/mmr-lookup` |
| Required headers | `Accept: application/vnd.coxauto.v1+json`, `Content-Type: application/vnd.coxauto.v1+json` |
| Auth at token endpoint | HTTP Basic (`Authorization: Basic base64(client_id:client_secret)`); credentials NEVER in body |

### Open verification items (pending product-guide review before first live call)

MMR 1.4 paths, query params, and response shape are now confirmed by the Cox MMR
Valuations guide. Implemented (mocked tests only; no live calls yet):

- VIN: `GET /vin/{vin}?odometer=...` plus optional `zipCode`, `evbh`, `include`.
- YMMT: `GET /search/{year}/{make}/{model}/{bodyname}?odometer=...` plus same optional
  params; `include=ci` is stripped (unsupported per the MMR Lookup guide).
- Response: `adjustedPricing.wholesale.{above,average,below}` and
  `adjustedPricing.retail.{above,average,below}` (when `MANHEIM_INCLUDE_RETAIL=true`)
  parsed by `extractManheimDistribution`.

Remaining open items:

| Item | Why it matters |
|---|---|
| **Token URL exact path** | Bridge 2 token endpoint is account-scoped (`.../oauth2/<authServerId>/v1/token`). Copy verbatim from the Cox app detail page. |
| **`bodyname` format** | `normalizeMmrParams` returns trim pass-through (no alias table). Listing-source trim values may not match Cox's accepted `bodyname` strings. The `mmr-lookup` reference endpoints are the future source-of-truth — see `docs/followups.md`. |
| ~~Known-good sandbox test VINs and YMM combos~~ | **RESOLVED 2026-05-08.** Confirmed: VIN `1FT8W3BT1SEC27066` (2025 Ford F-350SD), no-data VIN `1FT8W3BT199999999`, YMMT `2025 / Acura / ADX AWD / 4D SUV`. Captured in §3 below. |
| **Confirmed `evbh` semantics** | Code validates `[75, 100]` per the Cox guide and silently drops out-of-range values. Confirm during sandbox UAT that an in-range value flows through and an out-of-range value is ignored client-side rather than rejected upstream. |

---

## 1. Required Secrets and Env Vars

All secrets must be in Cloudflare Secrets (not wrangler.toml vars). Verify each is set
on the intelligence worker staging environment before any UAT call.

**Intelligence worker (staging) —
`--config workers/tav-intelligence-worker/wrangler.toml --env staging`:**

| Secret | Verify command | Sandbox value |
|---|---|---|
| `MANHEIM_API_VENDOR` | `wrangler secret list` | `cox` |
| `MANHEIM_GRANT_TYPE` | same | `client_credentials` |
| `MANHEIM_SCOPE` | same | `wholesale-valuations.vehicle.mmr-ext.get` |
| `MANHEIM_CLIENT_ID` | same | from Cox app detail page |
| `MANHEIM_CLIENT_SECRET` | same | from Cox app detail page (NEVER log) |
| `MANHEIM_TOKEN_URL` | same | `https://authorize.coxautoinc.com/oauth2/.../v1/token` (exact value from Cox app detail) |
| `MANHEIM_MMR_URL` | same | `https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle` |
| `MANHEIM_USERNAME` | — | not used for `client_credentials`; do not provision |
| `MANHEIM_PASSWORD` | — | not used for `client_credentials`; do not provision |
| `SUPABASE_URL` | `wrangler secret list` | present |
| `SUPABASE_SERVICE_ROLE_KEY` | same | present |
| `INTEL_SERVICE_SECRET` | same | must match main-worker `INTEL_WORKER_SECRET` |

> **Auth requirement (Cox Bridge 2 client_credentials):** Token requests use HTTP Basic
> on the `Authorization` header — `Basic base64(MANHEIM_CLIENT_ID:MANHEIM_CLIENT_SECRET)`.
> The form body contains only `grant_type=client_credentials` and `scope=...`.
> `client_id` / `client_secret` / `username` / `password` MUST NOT appear in the body for
> `client_credentials`. Wrong scope returns `400 invalid_scope` — do not substitute the
> `title-services` sample scope from generic Cox docs.

**Main worker (staging):**

| Secret | Status |
|---|---|
| `INTEL_WORKER_URL` | must be provisioned (`docs/followups.md` blocker) |
| `INTEL_WORKER_SECRET` | must match `INTEL_SERVICE_SECRET` above |

---

## 2. URL Configuration (Cox sandbox)

For UAT runs on the intelligence worker:

```
MANHEIM_API_VENDOR=cox
MANHEIM_GRANT_TYPE=client_credentials
MANHEIM_SCOPE=wholesale-valuations.vehicle.mmr-ext.get
MANHEIM_TOKEN_URL=https://authorize.coxautoinc.com/oauth2/.../v1/token
MANHEIM_MMR_URL=https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr
```

URL composition in code (vendor=cox, MMR 1.4 spec):

- Token: `POST {MANHEIM_TOKEN_URL}` with `Authorization: Basic base64(client_id:client_secret)` and body `grant_type=client_credentials&scope=...`
- VIN:   `GET {MANHEIM_MMR_URL}/vin/{vin}?odometer={miles}` plus optional `zipCode`, `evbh`, `include`.
- YMMT:  `GET {MANHEIM_MMR_URL}/search/{year}/{makename}/{modelname}/{bodyname}?odometer={miles}` plus optional `zipCode`, `evbh`, `include`. `bodyname`/trim **required**. `include=ci` is **stripped** on Search/YMMT.

All lookup requests must include:

```
Authorization: Bearer {access_token}
Accept:        application/vnd.coxauto.v1+json
Content-Type:  application/vnd.coxauto.v1+json
```

> **Legacy Manheim `uat.api.manheim.com` is no longer in use.** The legacy
> `/valuations/search` 596 blocker does not apply on Cox; Cox uses `/search/...`
> under `/vehicle/mmr`. The legacy URL templates remain in code only as a fallback
> when `MANHEIM_API_VENDOR=manheim`.

> **Trim gating:** when vendor=cox and the YMM call has no trim, the intelligence
> worker short-circuits to `mmr_value: null` and emits log
> `manheim.http.skipped { reason: "cox_ymm_requires_trim" }`. No token request,
> no MMR request, ingest stays non-blocking. Trim must be sent end-to-end to use
> the Cox YMMT endpoint.

> **Query parameters:** `odometer` is supported on both endpoints per the Cox guide
> and now ships on every Cox call. Optional `zipCode`, `evbh` (75–100 inclusive),
> and `include` (built from `MANHEIM_INCLUDE_*` env flags; `ci` stripped on Search)
> are appended when configured. See `docs/COX_API_INTEGRATION.md` §3a + §5.

> **VIN disambiguation variants** (`/vin/{vin}/{subseries}`,
> `/vin/{vin}/{subseries}/{transmission}`) and the **long-form YMMT path**
> (`/search/years/.../makes/...`) are deferred and not exercised in this phase's
> tests.

---

## 3. Test Case Matrix

Confirmed sandbox test data (Cox MMR Valuations, 2026-05-08). Sandbox-specific
limits: none reported. Batch Service: enabled. MMR Lookup
years/makes/models/trims: enabled.

| Asset | Value |
|---|---|
| Known-good VIN | `1FT8W3BT1SEC27066` (expected: 2025 Ford F-350SD) |
| No-data VIN | `1FT8W3BT199999999` (expected: 404 / no data) |
| Known-good YMMT | year=`2025`, make=`Acura`, model=`ADX AWD`, bodyname/trim=`4D SUV` |

### 3a. OAuth token (Cox `client_credentials` + Basic Auth)

Manual smoke curl (sandbox; replace placeholders, do not commit secrets):

```
curl -i -X POST "$MANHEIM_TOKEN_URL" \
  -u "$MANHEIM_CLIENT_ID:$MANHEIM_CLIENT_SECRET" \
  -d "grant_type=client_credentials&scope=wholesale-valuations.vehicle.mmr-ext.get"
```

| # | Test | Expected |
|---|---|---|
| T-01 | First token request (cold KV cache) | 200; `access_token` + `token_type: "Bearer"` + `expires_in` + `scope` returned; KV key `manheim:token` written |
| T-02 | Second request within TTL | Token served from KV cache; no HTTP call to token endpoint; `manheim.token.cached` log emitted |
| T-03 | Delete KV key manually, request again | Token endpoint called; new token cached |
| T-04 | Wrong scope (`MANHEIM_SCOPE=title-services.foo`) | `400 invalid_scope`; `ManheimAuthError` thrown; `manheim.token.refresh_failed` log with `error_category: "auth"` and `error_code: "invalid_scope"` |
| T-05 | Wrong client secret | `401`; `ManheimAuthError`; `manheim.token.refresh_failed` log with `error_category: "auth"` |
| T-06 | Token request body inspection | Body contains `grant_type=client_credentials` and `scope=...`; body MUST NOT contain `client_id`, `client_secret`, `username`, or `password` keys |
| T-07 | Token request header inspection | `Authorization: Basic <b64>` present; `Content-Type: application/x-www-form-urlencoded` present |

### 3b. VIN lookup

| # | VIN | Mileage | Expected |
|---|---|---|---|
| V-01 | `1FT8W3BT1SEC27066` | 50,000 | 200; `mmr_value` non-null; `adjustedPricing.wholesale.average` present; year=2025, make=Ford, model=F-350SD on the matched record |
| V-02 | `1FT8W3BT199999999` | 50,000 | 404 from Cox; `mmr_value: null`; no error thrown; `manheim.http.complete` logged with `mmr_value: null` |
| V-03 | `1FT8W3BT1SEC27066` | 120,000 | 200; mileage-adjusted value differs from V-01 (mileage curve applied via `odometer` query) |

### 3c. YMMT lookup (Search)

`bodyname`/trim is REQUIRED on the Cox `/search/...` path. Trimless calls
short-circuit to a null envelope client-side (`manheim.http.skipped`,
`reason: cox_ymm_requires_trim`); no upstream call is made.

| # | Year / Make / Model / Bodyname | Mileage | Expected |
|---|---|---|---|
| Y-01 | 2025 / Acura / ADX AWD / 4D SUV | 50,000 | 200; `items[0]` present; `adjustedPricing.wholesale.{above,average,below}` populated |
| Y-02 | 2025 / Acura / ADX AWD / 4D SUV (URL-encoded space in bodyname) | 50,000 | URL contains `/4D%20SUV?odometer=50000` (verifies `encodeURIComponent` on path segment) |
| Y-03 | 2025 / Acura / ADX AWD / (no trim) | 50,000 | Client short-circuits to `mmr_value: null`; `fetchFn` never called; `manheim.http.skipped { reason: "cox_ymm_requires_trim" }` log emitted |

---

## 4. Response Field Validation

For each successful VIN or YMM response, verify the mapping from raw Manheim payload to
`MmrResult`:

| `MmrResult` field | Source in payload | Validation |
|---|---|---|
| `mmrValue` | `items[0].adjustedPricing.wholesale.average` (rounded) | non-null integer; fallback chain in `extractMmrValue` fires if missing |
| `fetchedAt` | `new Date().toISOString()` at call time | ISO-8601 string |
| `retryCount` | attempts - 1 | 0 on first success |
| `method` | set by caller (`getMmrByVin` / `getMmrByYmm`) | `"vin"` or `"year_make_model"` |

The `extractMmrValue` fallback chain checks these keys in order if
`adjustedPricing.wholesale.average` is absent: `adjustedWholesaleAverage`,
`wholesaleMileageAdjusted`, `wholesaleAverage`, `mmrValue`, `average`, `value`, then
`wholesale.average`. Confirm at least the primary path returns a value for the UAT account.

---

## 5. Distribution Field Parsing

Applies to YMM lookups (`include=ci` in query). Verify the following fields exist in
`items[0].adjustedPricing.wholesale` and are parsed correctly:

| Raw field | `ValuationResult` field | Type | Validation |
|---|---|---|---|
| `above` | `wholesaleClean` | number or null | populated when CI returned |
| `average` | `wholesaleAvg` | number | always present if 200 |
| `below` | `wholesaleRough` | number or null | populated when CI returned |
| `sampleSize` (string) | `sampleCount` | number or null | parsed via `parseInt`; verify string-to-int conversion |

For VIN lookups: `wholesaleClean`, `wholesaleRough`, `sampleCount` are expected null (no
`include=ci`). Confirm this is the case on a V-01 response.

---

## 6. `retailClean` Invariant

`retailClean` must always be `null` — it is not present in either Manheim endpoint. Verify
no VIN or YMM response sets it. If `items[0].adjustedPricing.retail` is present in any
UAT response, flag it — that field is not currently mapped and may contain data worth
capturing in a future phase.

---

## 7. Rate-Limit Path (429)

Cannot be directly triggered against UAT without coordinating with Manheim. Validate the
429 path via the existing unit tests (already covered in `test/valuation.workerClient.test.ts`).
Document for ops:

- Client retries up to 4 attempts on 429
- `Retry-After` header is read and honored (`manheim.http.retry_after_observed` log emitted)
- After 4 failed attempts: `ManheimRateLimitError` thrown; intelligence worker returns 429
  to main worker; main worker logs `ingest.mmr_worker_failed` and continues (non-blocking)
- UAT acceptance: confirm `manheim.http.retry_after_observed` appears in Cloudflare logs
  when retry fires. Use an intentionally bad auth to force 401 and observe retry absence
  — 401 is not retried.

---

## 8. `MANHEIM_LOOKUP_MODE="worker"` Validation

> **Safety constraint:** `MANHEIM_LOOKUP_MODE="worker"` must only be set in
> `[env.staging.vars]` during UAT. Do not touch `[env.production.vars]` or run
> `wrangler deploy --env production` with this flag at any point during validation.
> Production stays on `"direct"` until staging UAT passes all criteria in section 12
> and a deliberate production-readiness review is completed.

Do not enable this flag until all items in section 1 are confirmed provisioned. Then:

**Step 1 — Deploy intelligence worker to staging:**
```
wrangler deploy --config workers/tav-intelligence-worker/wrangler.toml --env staging
```

**Step 2 — Provision main-worker secrets (one-time):**
```
wrangler secret put INTEL_WORKER_URL
wrangler secret put INTEL_WORKER_SECRET
wrangler secret put INTEL_SERVICE_SECRET \
  --config workers/tav-intelligence-worker/wrangler.toml --env staging
```

**Step 3 — Smoke test the service-to-service call directly:**
```
curl -X POST https://{intel-worker-staging-url}/mmr/vin \
  -H "Content-Type: application/json" \
  -H "x-tav-service-secret: {INTEL_SERVICE_SECRET}" \
  -d '{"vin":"{UAT_VIN_WITH_DATA}","mileage":50000,"requestId":"uat-test-001"}'
```
Expected: 200, `{ "mmrValue": <number>, "confidence": "high", "valuationMethod": "vin" }`

**Step 4 — Enable worker mode in staging:**

In `wrangler.toml`, under `[env.staging.vars]`:
```toml
MANHEIM_LOOKUP_MODE = "worker"
```
Redeploy main worker only.

**Step 5 — End-to-end ingest test:**

POST a valid normalized listing payload to `POST /ingest` on the staging main worker.
Verify:

- `valuation.fetched` log event in Cloudflare Logs
- Row written to `tav.valuation_snapshots` in staging Supabase
- `confidence`, `valuation_method`, `fetched_at`, `mmr_value` columns populated
- For YMM path with a known `vehicle_candidate_id`: row written to `tav.vehicle_enrichments`

---

## 9. Smoke-Test Checklist

Run in order. Stop on first failure.

- [ ] Intelligence worker responds 200 to `GET /health`
- [ ] `wrangler secret list` shows all required secrets on intelligence worker (staging)
- [ ] Token cache cold miss: direct `POST /mmr/vin` with service secret → 200; KV key `manheim:token` written
- [ ] Token cache warm: same call again → `manheim.token.cached` in logs; no token endpoint call
- [ ] VIN lookup returns non-null `mmrValue` for UAT test VIN
- [ ] VIN lookup for unknown VIN returns `mmrValue: null`, no error thrown
- [ ] `tav.valuation_snapshots` row written with correct `valuation_method = 'vin'`
- [ ] YMM lookup (once unblocked): returns `mmrValue`, distribution fields populated
- [ ] Normalization: "chevy" → "Chevrolet" resolves via alias table; `normalization_confidence = "alias"` in snapshot
- [ ] Enrichment row written to `tav.vehicle_enrichments` for YMM path when `vcId` present
- [ ] `x-tav-service-secret` mismatch → 401 from intelligence worker
- [ ] Main worker `MANHEIM_LOOKUP_MODE="worker"` → valuation routed through intelligence worker; `valuation.fetched` log emitted
- [ ] Worker timeout (simulate by pointing `INTEL_WORKER_URL` at a slow endpoint) → `WorkerTimeoutError` → ingest continues, `mmrResult = null`

---

## 10. Logging and Event Verification

For each UAT call, confirm the following structured log events appear in Cloudflare Logs
(`wrangler tail --config workers/tav-intelligence-worker/wrangler.toml --env staging`).

**OAuth path (manheimHttp.ts):**

- `manheim.token.refresh_started` — on cold cache
- `manheim.token.refresh_complete` — includes `expires_in`
- `manheim.token.cached` — on warm cache hit; includes `age_seconds`
- `manheim.token.refresh_failed` — on bad credentials; includes `error_category: "auth"`

**Lookup path (manheimHttp.ts):**

- `manheim.http.request` — first attempt; includes `status`, `latency_ms`
- `manheim.http.retry` — if retry fires; includes `attempt` number
- `manheim.http.complete` — on success or 404; includes `mmr_value`, `latency_ms`, `kpi: true`
- `manheim.http.failure` — on exhausted retries or auth failure; includes `error_category`
- `manheim.http.retry_after_observed` — when 429 Retry-After header is honored

**Intelligence worker orchestration (mmrLookup.ts):**

- `mmr.lookup.start` — entry point; includes `route`, `cacheKey`, `inferredMileage`
- `mmr.lookup.cache_hit` — includes `path` (`"initial"`, `"recheck"`, or `"after_wait"`)
- `mmr.lookup.cache_miss` — includes `cacheKey`
- `mmr.lookup.complete` — includes `cacheHit`, `latencyMs`, `kpi: true`
- `mmr.lookup.failure` — on any unhandled error

**Main worker (handleIngest.ts + workerClient.ts):**

- `ingest.mmr_worker_called` — pre-call event from `workerClient.ts`; includes `endpoint`, `method`, `vin_present`
- `valuation.fetched` — on success; includes `mmr_value`, `confidence`, `kpi: true`
- `ingest.mmr_worker_failed` — on `WorkerTimeoutError`, `WorkerRateLimitError`, or `WorkerUnavailableError`; non-blocking
- `ingest.normalization_enrichment_failed` — if enrichment write throws; non-blocking

---

## 11. Rollback Plan

| Trigger | Action | Time estimate |
|---|---|---|
| Intelligence worker returning 5xx consistently | Set `MANHEIM_LOOKUP_MODE="direct"` in `[env.staging.vars]`, redeploy main worker | 2 min |
| OAuth credentials rejected (401) | Verify secrets via `wrangler secret list`; re-provision if needed | 5 min |
| `tav.valuation_snapshots` rows missing | Check `ingest.mmr_worker_failed` log for root cause; revert `MANHEIM_LOOKUP_MODE` | 5 min |
| `normalization_confidence` constraint violation | Column accepts only `'exact' \| 'alias' \| 'partial' \| 'none'`; check enum against migration 0039 | immediate — fix enum |
| KV namespace misconfigured | `wrangler kv key list --namespace-id {id}` to confirm correct namespace; check staging vs. dev ID confusion | 10 min |

Reverting `MANHEIM_LOOKUP_MODE` to `"direct"` is always safe and restores the pre-G.5
codepath without data loss.

---

## 12. Pass/Fail Criteria

**Pass** (all must be true before promoting to production):

1. OAuth token is obtained, cached, and served from cache on subsequent requests
2. VIN lookup returns correct `mmrValue` for at least 2 distinct UAT VINs
3. VIN 404 returns `mmr_value: null` without throwing
4. `tav.valuation_snapshots` rows written with all required columns including `valuation_method`, `confidence`, `fetched_at`
5. YMM lookup returns `mmrValue` and distribution fields (once account is provisioned)
6. At least one normalization alias test (`chevy` → `Chevrolet`) produces `normalization_confidence = "alias"` in the snapshot
7. Service-secret mismatch returns 401; no token is consumed
8. Worker timeout produces `ingest.mmr_worker_failed` log; ingest completes normally
9. All structured log events listed in section 10 appear in Cloudflare Logs during their respective test cases
10. `retailClean` is null on all VIN and YMM responses

**Fail** (any of these blocks promotion):

- YMM endpoint returns 596 — account not provisioned; escalate to Manheim rep, no code workaround
- Token endpoint returns 401 with correct credentials — credential or grant-type mismatch, not a code issue
- `tav.valuation_snapshots` insert fails with constraint violation — schema mismatch between migration and code
- `normalization_confidence` column rejects a value — enum gap between migration 0039 CHECK and domain type
- Any silent drop of a listing during valuation failure (no `reason_code` in logs)
- `MANHEIM_LOOKUP_MODE="worker"` applied to production environment during UAT

---

## 13. Code and Config Gaps

These do not block UAT but should be tracked before production promotion.

| Gap | Location | Description |
|---|---|---|
| `MANHEIM_TOKEN_URL` / `MANHEIM_MMR_URL` set as `vars` not secrets | `workers/tav-intelligence-worker/wrangler.toml` | URLs are not secrets, so `vars` is correct — but UAT vs. prod swap requires a toml edit + deploy, not a secret rotation. Document the swap procedure in the runbook. |
| KV `preview_id` missing on staging namespace | `workers/tav-intelligence-worker/wrangler.toml` | `wrangler dev --env staging` will warn. Listed as a production deploy blocker in `docs/followups.md`. |
| YMM account provisioning | External (Cox/Manheim) | `GET /valuations/search` returns 596. Requires account-rep action. |
| Intelligence worker production KV namespace IDs are placeholders | `docs/followups.md` | Must be provisioned before production deploy. |
| No integration test covers `POST /ingest → valuation_snapshots` write in `MANHEIM_LOOKUP_MODE="worker"` mode | `test/ingest.test.ts` | Existing ingest tests mock `workerClient`; no test hits a real Supabase write. Acceptable pre-production if staging smoke test (section 9) passes manually. |
| `workerClient.ts` emits no structured log events | `src/valuation/workerClient.ts` | Pre-call and post-call observability is missing for the worker-mode path. See section 10 future-enhancement note. |
| Trim not sent to intelligence worker | Design decision (G.5.3) | `trim_sent_to_worker: false` documented in enrichment payload. Revisit if UAT shows materially different values with trim included. |

---

## 14. Sandbox UAT Results — 2026-05-08

All four observations below executed against the Cox sandbox. No tokens, secrets,
or credential material recorded. Worker-mode end-to-end (`POST /ingest →
valuation_snapshots`) not yet exercised — covered separately under §8.

### 14a. Token-only — PASS

| Check | Observed |
|---|---|
| HTTP status | 200 |
| `token_type` | `Bearer` |
| `expires_in` | 86400 |
| `scope` | `wholesale-valuations.vehicle.mmr-ext.get` |
| `access_token` | present (length > 0); not printed; not logged |

Resolves §0.5 open items: token URL works; scope accepted by Cox; Basic-Auth
flow operational against sandbox.

### 14b. VIN lookup with known-good VIN — PASS

Request: `GET /vin/1FT8W3BT1SEC27066?odometer=50000` (path-segment VIN, odometer query).

| Field | Observed |
|---|---|
| HTTP status | 200 |
| `count` | 5 |
| `items[0]` year/make/model | 2025 / FORD / F350 SRW 4WD V8 TDSL |
| `items[0]` trim | CREW CAB 6.7L LARIAT |
| `items[0].adjustedPricing.wholesale.average` | 67100 |
| `items[0].adjustedPricing.wholesale.above` | 70700 |
| `items[0].adjustedPricing.wholesale.below` | 63500 |
| `items[0].sampleSize` | `"7"` |
| `items[0].requestedDate` / `returnedDate` | 2026-05-08 |
| `items[0].bestMatch` | `true` |
| `items[0].adjustedBy.Odometer` | 50000 |
| `adjustedPricing.retail.*` | absent (`include=retail` not sent — `MANHEIM_INCLUDE_RETAIL=false`) |

Confirms: `odometer` query supported on `/vin/{vin}`; response shape matches
`extractManheimDistribution`'s parser (wholesale tiers + sampleSize); retail
tiers correctly null when `include=retail` not requested.

### 14c. VIN with `include=retail` — PASS (non-core)

Request: `GET /vin/1FT8W3BT1SEC27066?odometer=50000&include=retail`.

`include=retail` returned `adjustedPricing.retail.{above,average,below}` plus
a separate base `retail.*` block. The flag is mechanically wired and verified;
exact tier values are recorded in the raw response cache for audit.

> **Business decision (2026-05-08):** TAV is **wholesale-only**. Retail is
> optional context only. Do NOT add retail persistence columns to
> `tav.valuation_snapshots`. Do NOT extend `extractManheimDistribution` beyond
> the existing `retailClean` / `retailAvg` / `retailRough` shape. Raw retail
> data is preserved on the cached payload (`mmr_payload`) for any future
> opportunistic use — but it does not drive scoring, alerts, or buyer workflow.

### 14d. No-data VIN — PASS

Request: `GET /vin/1FT8W3BT199999999?odometer=50000`.

| Field | Observed |
|---|---|
| HTTP status | 404 |
| `message` / `developerMessage` | "Matching vehicles not found" |
| Mapping in code | `executeLookup` returns envelope `{ mmr_value: null, payload: {}, retryCount: 0 }` and emits `manheim.http.complete` log with `mmr_value: null`. Non-blocking. |

Confirms: 404 on unknown VIN flows through the existing 404 → null-envelope
branch without throwing.

### 14e. YMMT Search with known-good YMMT — PASS

Request: `GET /search/2025/Acura/ADX%20AWD/4D%20SUV?odometer=50000` (path-segment year/make/model/bodyname, URL-encoded spaces, odometer query).

| Field | Observed |
|---|---|
| HTTP status | 200 |
| `count` | 3 |
| `items[0]` year/make/model | 2025 / ACURA / ADX AWD |
| `items[0]` trim | 4D SUV A-SPEC PKG |
| `items[0].adjustedPricing.wholesale.average` | 26800 |
| `items[0].adjustedPricing.wholesale.above` | 28200 |
| `items[0].adjustedPricing.wholesale.below` | 25400 |
| `items[0].sampleSize` | `"6"` |
| `items[0].requestedDate` / `returnedDate` | 2026-05-08 |
| `items[0].bestMatch` | absent / null on Search responses |
| `items[0].adjustedBy.Odometer` | 50000 |

Confirms: short-form YMMT path works; `encodeURIComponent` on bodyname space
is accepted; `bestMatch` is a VIN-only field (treat as nullable on Search);
odometer adjustment applies on Search.

### Resolved by these UAT runs

- Cox token endpoint accepts our credentials and scope.
- Sandbox test VIN + YMMT data is sufficient for routine smoke runs.
- `odometer` query parameter accepted on both `/vin/{vin}` and `/search/...`.
- `adjustedPricing.wholesale.{above,average,below}` and `sampleSize` shape match
  the parser's expectations on real Cox responses.
- `include=retail` flag mechanically works — non-core for TAV (wholesale-only).
  No further retail persistence work planned.

### Still open (validation deferred)

- `include=ci` behavior on VIN — confirm `confidenceInterval` populates and
  is correctly stripped on Search/YMMT.
- `include=forecast` and `include=historical` — only investigate further if
  these sections add wholesale-pricing signal (e.g. forecast-based stale
  detection). Skip if they're retail-flavored only.
- Batch endpoint (`POST /mmr-batch/vins`) — not yet exercised.
- `mmr-lookup` reference-sync as the future source-of-truth for
  make/model/trim aliases.
- Trim/bodyname aliasing from `mmr-lookup` — listing trims may not match Cox
  `bodyname` strings; alias table not yet populated.
