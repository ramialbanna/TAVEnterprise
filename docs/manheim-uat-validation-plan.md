# G.5.4 — Staging UAT Validation Plan: Manheim/Cox Integration

Validates the tav-intelligence-worker's Manheim HTTP client against the UAT environment
before enabling `MANHEIM_LOOKUP_MODE="worker"` in staging. No live API calls are made
during planning. All curl examples are for manual execution during UAT.

**Not covered:** VIN data accuracy (business QA), MMR value correctness, Apify ingest
pipeline, alerts.

---

## 0.5 Ask Cox/Manheim Before UAT

The following must be confirmed with your Cox/Manheim account representative before any
UAT call is executed. These are external dependencies — no amount of code reading resolves
them.

| Question | Why it matters |
|---|---|
| **Confirm UAT base URLs** | `.dev.vars.example` lists `https://uat.api.manheim.com/oauth2/token.oauth2` and `https://uat.api.manheim.com/valuations`. Confirm these are correct for the provisioned account. UAT and pre-production URLs sometimes differ per client package. |
| **Confirm grant type and required scopes** | The client currently sends `grant_type=password`. If the account uses `client_credentials`, `manheimHttp.ts` must be updated before any token call will succeed. Also confirm whether any OAuth scope parameter is required — the current implementation sends none. |
| **Confirm YMM endpoint provisioning** | `GET /valuations/search` currently returns 596 on this account. Confirm whether the UAT account has the YMM search endpoint provisioned, and if not, what the activation timeline or required package tier is. YMM test cases Y-01 through Y-05 cannot run until confirmed. |
| **Provide known-good test VINs and YMM combinations** | Request at least 2 VINs expected to return MMR data and 1 VIN expected to return 404 from the UAT environment. For YMM: at least 2 year/make/model combinations known to return `items[0]` with distribution data. Do not use production VINs in UAT. |
| **Confirm expected response shape for `adjustedPricing` and `sampleSize`** | The client extracts `items[0].adjustedPricing.wholesale.{above, average, below}` and `sampleSize` (as a string). Confirm this shape is stable in the UAT response contract — Manheim has historically varied field names across API versions. If `sampleSize` is numeric (not a string) in the UAT response, `parseInt` still works, but document it. |

---

## 1. Required Secrets and Env Vars

All secrets must be in Cloudflare Secrets (not wrangler.toml vars). Verify each is set
on the intelligence worker staging environment before any UAT call.

**Intelligence worker (staging) —
`--config workers/tav-intelligence-worker/wrangler.toml --env staging`:**

| Secret | Verify command | Note |
|---|---|---|
| `MANHEIM_CLIENT_ID` | `wrangler secret list` | required for all grant types |
| `MANHEIM_CLIENT_SECRET` | same | required for all grant types |
| `MANHEIM_USERNAME` | same | required only if password-grant — see UAT prerequisite below |
| `MANHEIM_PASSWORD` | same | required only if password-grant — see UAT prerequisite below |
| `MANHEIM_TOKEN_URL` | check `[env.staging.vars]` in wrangler.toml | `https://uat.api.manheim.com/oauth2/token.oauth2` |
| `MANHEIM_MMR_URL` | same | `https://uat.api.manheim.com/valuations` |
| `SUPABASE_URL` | `wrangler secret list` | present |
| `SUPABASE_SERVICE_ROLE_KEY` | same | present |
| `INTEL_SERVICE_SECRET` | same | must match main-worker `INTEL_WORKER_SECRET` |

> **UAT prerequisite — grant type confirmation (blocker):** The Manheim HTTP client
> currently uses password-grant (`grant_type=password` with `username` + `password`).
> Cox/Manheim accounts may instead be provisioned for `client_credentials` (no
> username/password). Confirm the grant type with your Cox/Manheim rep before running any
> token test. If the account uses `client_credentials`, `fetchAndStoreToken` in
> `manheimHttp.ts` must be updated — this is a code change, not a configuration change.
> Do not assume either path works until confirmed.

**Main worker (staging):**

| Secret | Status |
|---|---|
| `INTEL_WORKER_URL` | must be provisioned (`docs/followups.md` blocker) |
| `INTEL_WORKER_SECRET` | must match `INTEL_SERVICE_SECRET` above |

---

## 2. UAT URL Configuration

`.dev.vars.example` documents both environments. For UAT runs on the intelligence worker:

```
MANHEIM_TOKEN_URL=https://uat.api.manheim.com/oauth2/token.oauth2
MANHEIM_MMR_URL=https://uat.api.manheim.com/valuations
```

These map to the same path structure as production:

- Token: `POST {MANHEIM_TOKEN_URL}`
- VIN: `GET {MANHEIM_MMR_URL}/vin/{vin}?odometer={miles}`
- YMM: `GET {MANHEIM_MMR_URL}/search/{year}/{make}/{model}?odometer={miles}&include=ci`

**Critical:** YMM parameters are path segments, not query params. `GET /search?year=2020...`
returns HTTP 596. This is a known regression from commit `5a66d6b3` and is documented in
`manheimHttp.ts`.

**YMM account status:** `GET /valuations/search` returns 596 on the current account — the
YMM endpoint is not provisioned. Contact the Manheim/Cox account rep to enable it before
running YMM test cases. This is a hard blocker for YMM validation; no code change can
resolve it.

---

## 3. Test Case Matrix

Obtain UAT-valid test VINs from Manheim's UAT documentation or account rep (see section
0.5). Placeholders below must be substituted before execution.

### 3a. OAuth token

> Test cases T-01 through T-04 assume password-grant. If `client_credentials` is confirmed,
> adjust the request body to omit `username`/`password` and use
> `grant_type=client_credentials`. KV caching and single-flight behavior is grant-type-agnostic.

| # | Test | Expected |
|---|---|---|
| T-01 | First token request (cold KV cache) | 200; `access_token` + `expires_in` returned; KV key `manheim:token` written |
| T-02 | Second request within TTL | Token served from KV cache; no HTTP call to token endpoint; `manheim.token.cached` log emitted |
| T-03 | Delete KV key manually, request again | Token endpoint called; new token cached |
| T-04 | Bad credentials (`MANHEIM_PASSWORD=wrong`) | 401 from token endpoint; `ManheimAuthError` thrown; `manheim.token.refresh_failed` log with `error_category: "auth"` |

### 3b. VIN lookup

| # | VIN | Mileage | Expected |
|---|---|---|---|
| V-01 | `{UAT_VIN_WITH_DATA}` | 50,000 | 200; `mmr_value` non-null; `adjustedPricing.wholesale.average` present |
| V-02 | `{UAT_VIN_NO_DATA}` | 50,000 | 404 from Manheim; `mmr_value: null`; no error thrown; `manheim.http.complete` logged |
| V-03 | `{UAT_VIN_WITH_DATA}` | 120,000 | 200; mileage-adjusted value differs from V-01 |

### 3c. YMM lookup (blocked pending account provisioning)

| # | Year / Make / Model | Mileage | Expected |
|---|---|---|---|
| Y-01 | 2020 / Toyota / Camry | 50,000 | 200; `items[0]` present; distribution fields populated |
| Y-02 | 2019 / Chevrolet / Silverado | 60,000 | 200; verify make/model casing accepted |
| Y-03 | 2021 / Honda / Civic | 35,000 | 200 |
| Y-04 | 2015 / FakeMake / FakeModel | 40,000 | 404 or empty `items`; `mmr_value: null`; no error thrown |
| Y-05 | 2022 / Toyota / Camry (no trim) | 30,000 | 200; no `trim` query param in URL |

> **Trim deferral:** G.5.3 intentionally omits trim from the YMM request to the
> intelligence worker (`workerClient.ts`, comment on line 97). `lookupTrim` is stored in
> the enrichment payload as `trim_sent_to_worker: false`. Trim-in-request validation is
> deferred to a future phase.

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

**Main worker (handleIngest.ts):**

- `valuation.fetched` — on success; includes `mmr_value`, `confidence`, `kpi: true`
- `ingest.mmr_worker_failed` — on `WorkerTimeoutError`, `WorkerRateLimitError`, or `WorkerUnavailableError`; non-blocking
- `ingest.normalization_enrichment_failed` — if enrichment write throws; non-blocking

> **Future enhancement:** `workerClient.ts` currently emits no structured log events. A
> pre-call `ingest.mmr_worker_called` event with `{ endpoint, method, vin_present }` would
> improve observability for the worker-mode path. Not currently in code.

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
