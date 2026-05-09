# Staging worker-mode MMR smoke plan — 2026-05-09

Purpose: validate `tav-aip-staging` (main worker) routes MMR through
`tav-intelligence-worker-staging` end-to-end, with the new fail-closed
secret guards and refreshed `INTEL_*` shared secret.

## Live status

| Step | Status                  | Notes                                                                                                                                |
|------|-------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| 1    | PASS (2026-05-09)       | Both /health → 200                                                                                                                   |
| 2a   | PASS                    | No-bearer → 401                                                                                                                      |
| 2b   | PASS                    | Wrong-bearer → 401                                                                                                                   |
| 2c   | PASS (after fixes)      | Required: re-put SUPABASE_URL on both staging workers; targeted DDL `CREATE TABLE tav.import_batches` + grants on staging Supabase  |
| 3a   | PASS (2026-05-09)       | VIN good (1FT8W3BT1SEC27066) → 200, mmr.lookup.complete. Required: re-put MANHEIM_CLIENT_ID/SECRET (Cox 401 → fixed); intel staging redeployed |
| 3b   | PASS (2026-05-09)       | VIN no-data (1FT8W3BT199999999) → 200, ok:false, mmr_value:null, cache_hit:false, error_code:null                                    |
| 3c   | PASS (2026-05-09)       | placeholder service-secret → 401 auth_error                                                                                          |
| 3p   | PASS (2026-05-09)       | Intel persistence (mmr_queries / mmr_cache / user_activity) writes succeed after targeted DDL; no persist.*_failed events remain   |
| 4    | PASS (2026-05-09)       | RUN_ID `smoke-20260509-114200`. HTTP 200, processed=1, rejected=0. Tail: `ingest.started` → `dedupe.linked identity_key=vin:1FT8W3BT1SEC27066` → `ingest.mmr_worker_called transport=service_binding` → `valuation.fetched mmr_value=68600 confidence=high kpi=true` → `ingest.complete`. No `ingest.snapshot_failed`, no `ingest.mmr_worker_http_error`. Envelope unwrap, VIN propagation, service-binding transport, and valuation_snapshots distribution columns all verified end-to-end. |

Persistence gaps resolved 2026-05-09 by targeted staging SQL (mirrors migrations 0027 / 0028 / 0029) — `tav.mmr_queries`, `tav.mmr_cache`, `tav.user_activity` plus indexes/constraints/grants now present on staging Supabase.

### Step 4 resume gate (post-maintenance)

Order is required. Skipping the admin check risks generating spurious DLQ rows.

1. Supabase dashboard → staging project status shows **Active** (not Provisioning, not Paused, not Maintenance).
2. **Admin reachability check first** (no schema impact, no writes):
   ```bash
   src=~/.tav-staging-secrets.local
   ADMIN=$(awk -F= '/^ADMIN_API_SECRET=/ {print $2}' "$src")
   curl -i -s -H "Authorization: Bearer $ADMIN" \
     https://tav-aip-staging.rami-1a9.workers.dev/admin/import-batches | head -10
   unset ADMIN
   ```
   - **HTTP 200** → upstream healthy. Proceed to step 3.
   - **HTTP 503 db_error** → Supabase still recovering or DNS not propagated. Wait 1–2 min and re-run; do **not** proceed to /ingest.
3. Only then retry Step 4 /ingest (snippet in §Step 4 above) with a fresh `RUN_ID`. Tail in a second terminal: `npx wrangler tail tav-aip-staging --format pretty`.

Working theory for the 1016 / 503 outage: planned Supabase Pro/compute upgrade. Earlier free-tier-pause speculation is **not** the cause — staging project is on Pro.

Resilience + correctness fixes shipped while diagnosing the outage and 404 (commits on `main`):
- `upsertSourceRun` now wrapped in `withRetry` (3 attempts, 250/1000/4000ms backoff) — most transient 1016-class errors will self-heal on retry.
- `serializeError` extracts `status`, recursive `cause`, `attempts`, and recursive `lastError` so future fetch-layer failures and RetryExhaustedError chains land in logs with full diagnostic chain instead of bare wrapper messages.
- `getMmrValueFromWorker` now unwraps the intel `okResponse` envelope (`{success, data, requestId, timestamp}` → inner `MmrResponseEnvelope`). Previously a silent contract mismatch nullified every successful Cox lookup. Emits `ingest.mmr_worker_envelope_invalid` on future drift.
- Facebook adapter now extracts and validates VIN (`extractVin`, ISO 3779 17-char check, uppercased). Listings carrying a VIN now route through `/mmr/vin` instead of forced YMM fallback.
- Worker-to-worker calls now go through Cloudflare Service Binding `INTEL_WORKER` (`[[env.<env>.services]]` in wrangler.toml). Avoids Cloudflare error 1042 that blocks public-URL fetches between Workers on the same account. Service-secret header still rides along as defense-in-depth. New `transport` log field distinguishes `service_binding` vs `public_fetch`.
- Migration 0040 + canonical schema.sql + targeted staging DDL add the five MMR-distribution columns (`mmr_wholesale_avg/clean/rough`, `mmr_retail_clean`, `mmr_sample_count`) to `tav.valuation_snapshots`. Persistence inserts had been failing with PostgREST 42703 across all environments; production was masked by `MANHEIM_LOOKUP_MODE=direct` rarely producing non-null mmrResult.

## Blockers fixed during this smoke (chronological)

| # | Blocker                                                     | Resolution                                                                                                                |
|---|-------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| 1 | `SUPABASE_URL` typo / wrong service-role key on staging     | Re-`wrangler secret put` correct values on both main and intel staging; redeploy                                          |
| 2 | `tav.import_batches` missing on staging                     | Targeted DDL mirror of migration 0012                                                                                     |
| 3 | Cox sandbox 401 on token refresh                            | Re-put `MANHEIM_CLIENT_ID` / `MANHEIM_CLIENT_SECRET` on intel staging after pre-validation curl against Cox token endpoint |
| 4 | Intel persistence — `mmr_queries`, `mmr_cache`, `user_activity` missing on staging | Targeted DDL mirror of migrations 0027 / 0028 / 0029                                                                       |
| 5 | Admin route returned Cloudflare 1101 on DB throw            | Wrap `handleAdmin` body in try/catch → JSON 503 `db_error` with `serializeError`                                          |
| 6 | `MmrResponseEnvelope` contract drift between intel okResponse and main client | New `IntelOkEnvelopeSchema` wrapper; main now unwraps `data` field                                                        |
| 7 | Facebook adapter ignored `vin` field                        | Added `extractVin` with ISO 3779 validation; vin propagates to `NormalizedListingInput`                                    |
| 8 | Cloudflare 1042 blocking Worker→Worker public-URL fetch     | Cloudflare Service Binding `INTEL_WORKER`; main fetches via `env.INTEL_WORKER.fetch`                                       |
| 9 | `valuation_snapshots` missing five distribution columns      | Migration 0040 + targeted staging DDL                                                                                     |

## Deployed staging versions (final)

| Worker | Version |
|---|---|
| tav-aip-staging                  | `a751f189-9a58-4133-b6f8-1d875dcf13c4` |
| tav-intelligence-worker-staging  | `93941d87-87df-4f96-bbb6-b17a8f11f8ca` |


Hardening side-fixes shipped during this run:
- `1267d9d` fail-closed secret validation + Retry-After + opt-in int tests + staging routing toggle
- `<KV provisioning>` intel preview + production KV namespaces created
- `<admin 1101 fix>` handleAdmin try/catch returns JSON 503 with serializeError detail


**Pause point:** stop after Step 2 and confirm before running Step 3+4
(Step 3 hits Cox sandbox; Step 4 writes Raw + Normalized rows to staging
Supabase and may write a Lead).

## Inputs

- Secret file (do **not** delete yet): `~/.tav-staging-secrets.local`
  - `WEBHOOK_HMAC_SECRET` (sign ingest)
  - `ADMIN_API_SECRET`     (admin bearer)
  - `INTEL_WORKER_SECRET`  (= `INTEL_SERVICE_SECRET` on intel worker)
- Cox sandbox fixtures (from `docs/manheim-uat-validation-plan.md` §3, all PASS as of 2026-05-08):
  - VIN good:    `1FT8W3BT1SEC27066` → 2025 Ford F-350SD, wholesale.average 67100
  - VIN no-data: `1FT8W3BT199999999` → HTTP 404 → null envelope
  - YMMT good:   2025 / Acura / ADX AWD / 4D SUV
- URLs:
  - main:  `https://tav-aip-staging.rami-1a9.workers.dev`
  - intel: `https://tav-intelligence-worker-staging.rami-1a9.workers.dev`
- Deployed versions:
  - tav-aip-staging:                  `2f22e0f8-045f-4793-81a2-4f14dce24616`
  - tav-intelligence-worker-staging:  `a0e1b3d2-929d-4ef5-ba8f-1cfeec6ad7b4`

All commands assume zsh/bash and resolve secrets via `awk -F=` from the
local file. **Do not echo secret values.**

## Step 1 — Health checks (read-only)

```bash
curl -fsS https://tav-aip-staging.rami-1a9.workers.dev/health
curl -fsS https://tav-intelligence-worker-staging.rami-1a9.workers.dev/health
```

Expected: HTTP 200, JSON body with `ok: true` (or equivalent). Network
failure or non-200 → stop, do not proceed.

## Step 2 — Admin auth fail-closed sanity (read-only)

The hardening commit (1267d9d) added `503 admin_auth_not_configured`
when `ADMIN_API_SECRET` is missing. Now that the secret is set, the
worker should return 401 (not 503) for missing/wrong bearer and 200 for
the correct bearer.

```bash
# 2a. No bearer → expect HTTP 401, body { ok:false, error:"unauthorized" }
curl -i -s https://tav-aip-staging.rami-1a9.workers.dev/admin/import-batches | head -10

# 2b. Wrong bearer → expect HTTP 401
curl -i -s -H 'Authorization: Bearer not-the-real-secret' \
  https://tav-aip-staging.rami-1a9.workers.dev/admin/import-batches | head -10

# 2c. Correct bearer → expect HTTP 200 with JSON list (possibly empty)
src=~/.tav-staging-secrets.local
ADMIN=$(awk -F= '/^ADMIN_API_SECRET=/ {print $2}' "$src")
curl -i -s -H "Authorization: Bearer $ADMIN" \
  https://tav-aip-staging.rami-1a9.workers.dev/admin/import-batches | head -20
unset ADMIN
```

Pass criteria:
- 2a returns 401, **not** 503 (proves fail-closed is now closed in the
  fully-configured direction).
- 2b returns 401.
- 2c returns 200 with parseable JSON.

> **Pause here.** Confirm Step 1 + 2 before continuing.

## Step 3 — Direct intelligence-worker MMR smoke (live Cox sandbox)

Bypasses main worker; exercises Cox sandbox path through intel worker.
Uses confirmed-good VIN fixture from §3 of the UAT plan.

```bash
src=~/.tav-staging-secrets.local
INTEL=$(awk -F= '/^INTEL_WORKER_SECRET=/ {print $2}' "$src")

# 3a. VIN good — expect HTTP 200, mmr_value populated
curl -i -s -X POST https://tav-intelligence-worker-staging.rami-1a9.workers.dev/mmr/vin \
  -H 'Content-Type: application/json' \
  -H "x-tav-service-secret: $INTEL" \
  -d '{"vin":"1FT8W3BT1SEC27066","mileage":50000,"zipCode":"75201"}'
echo

# 3b. VIN no-data — expect HTTP 200, ok:false or mmr_value:null envelope
curl -i -s -X POST https://tav-intelligence-worker-staging.rami-1a9.workers.dev/mmr/vin \
  -H 'Content-Type: application/json' \
  -H "x-tav-service-secret: $INTEL" \
  -d '{"vin":"1FT8W3BT199999999","mileage":50000,"zipCode":"75201"}'
echo

# 3c. Placeholder secret rejection — expect HTTP 401 (auth fails fast,
#     proves the placeholder-bypass guard from dispatch.test.ts holds)
curl -i -s -X POST https://tav-intelligence-worker-staging.rami-1a9.workers.dev/mmr/vin \
  -H 'Content-Type: application/json' \
  -H 'x-tav-service-secret: replace_me' \
  -d '{"vin":"1FT8W3BT1SEC27066","mileage":50000}'
echo

unset INTEL
```

Pass criteria:
- 3a: HTTP 200, JSON envelope with `ok:true`, `mmr_value` numeric (~67100).
- 3b: HTTP 200, JSON envelope with `ok:false` or `mmr_value:null`,
  `cache_hit:false`, `error_code:null`.
- 3c: HTTP 401 (or equivalent unauthenticated rejection). **Not** 200.

If 3a fails, do not proceed to Step 4. Check `wrangler tail` on intel
worker — likely Cox token auth or `MANHEIM_*` secret drift.

## Step 4 — Main-worker /ingest smoke (worker-mode end-to-end)

Sends a valid Facebook ingest payload through the main worker, signed
with the new `WEBHOOK_HMAC_SECRET`. Main worker should call intel worker
(via `MANHEIM_LOOKUP_MODE=worker`) and emit `ingest.mmr_worker_called`
followed by `valuation.fetched`.

This step **writes to staging Supabase** (`raw_listings`, `normalized`,
possibly `leads`). Use a clearly-fake `listing_id`/`url` so the row is
easy to identify and clean up.

### 4a. Build the payload (no secrets touched here)

```bash
RUN_ID="smoke-$(date +%Y%m%d-%H%M%S)"
SCRAPED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat > /tmp/tav-smoke-ingest.json <<EOF
{
  "source": "facebook",
  "run_id": "$RUN_ID",
  "region": "dallas_tx",
  "scraped_at": "$SCRAPED_AT",
  "items": [
    {
      "listing_id": "fb-smoke-2026-05-09-001",
      "url": "https://facebook.com/marketplace/item/smoke-2026-05-09-001",
      "title": "2025 Acura ADX AWD",
      "price": 38500,
      "mileage": 12000,
      "posted_at": "$SCRAPED_AT",
      "location": "Dallas, TX"
    }
  ]
}
EOF

# Sanity: file must not have trailing newline that mismatches the signed bytes.
wc -c /tmp/tav-smoke-ingest.json
```

> Title `2025 Acura ADX AWD` matches the Cox sandbox YMMT fixture
> confirmed PASS on 2026-05-08; the YMM path through intel worker should
> return wholesale tiers. We deliberately omit `vin` so the worker-mode
> YMMT path runs (the harder of the two paths to exercise).

### 4b. Sign the exact body bytes

`verifyHmac` (`src/auth/hmac.ts`) uses HMAC-SHA256 over the request body
ArrayBuffer; signature header is `sha256=<lowercase hex>`. Sign the
file content verbatim via stdin (no shell interpolation):

```bash
src=~/.tav-staging-secrets.local
HMAC=$(awk -F= '/^WEBHOOK_HMAC_SECRET=/ {print $2}' "$src")

SIG="sha256=$(openssl dgst -sha256 -hmac "$HMAC" /tmp/tav-smoke-ingest.json | awk '{print $NF}')"

unset HMAC
echo "Signature header built (length): ${#SIG}"
```

`unset HMAC` immediately after; signature already computed.

### 4c. POST the signed payload

```bash
curl -i -s -X POST https://tav-aip-staging.rami-1a9.workers.dev/ingest \
  -H 'Content-Type: application/json' \
  -H "x-tav-signature: $SIG" \
  --data-binary @/tmp/tav-smoke-ingest.json
echo
unset SIG
```

Expected response:
- HTTP 200
- JSON body: `{ ok:true, source:"facebook", run_id:"smoke-...", processed:1, rejected:0, created_leads:<0 or 1> }`

A 401 here means the body bytes signed in 4b don't match the bytes
posted in 4c (usually a stray newline). 503 means a secret guard fired
unexpectedly — re-verify Step 2.

### 4d. Confirm worker-mode path fired (live tail)

In a second terminal, before 4c:

```bash
npx wrangler tail tav-aip-staging --env staging --format pretty
```

Look for these log events in order, scoped to the smoke `run_id`:
- `ingest.started`           (item_count: 1)
- `ingest.mmr_worker_called` (endpoint ends with `/mmr/year-make-model`, method `year_make_model`, vin_present: false)
- `valuation.fetched`        (mmr_value numeric, confidence `medium` or `low`, kpi: true)
- `ingest.complete`          (processed: 1, rejected: 0)

The presence of `ingest.mmr_worker_called` is the smoke's hard pass
gate. If it's absent, the worker-mode branch did not run (check
`MANHEIM_LOOKUP_MODE` and `INTEL_WORKER_URL` vars on the deployed
worker).

Also tail intel worker in a third terminal to confirm the call lands:

```bash
npx wrangler tail tav-intelligence-worker-staging --config workers/tav-intelligence-worker/wrangler.toml --env staging --format pretty
```

Expect a `manheim.http.*` event, an MMR query insert, and (if Cox YMMT
returned data) an `mmr.value_returned` style event for the same
request_id.

### 4e. Optional — VIN-path variant

If 4c passes, repeat with VIN injected to exercise worker-mode VIN path:

```bash
# Edit /tmp/tav-smoke-ingest.json: add "vin": "1FT8W3BT1SEC27066" to the item,
# rebuild RUN_ID + scraped_at, re-sign, re-POST.
```

Expect `ingest.mmr_worker_called` with `vin_present:true`, endpoint
`/mmr/vin`, and `valuation.fetched` with `confidence:"high"`.

## Pass / fail summary

| Step | Pass                                                                   | Investigate if                                                              |
|------|------------------------------------------------------------------------|-----------------------------------------------------------------------------|
| 1    | both /health → 200                                                     | non-200 or DNS failure                                                      |
| 2a/b | 401, body `unauthorized`                                               | 503 (means ADMIN_API_SECRET still missing despite Step 3 of secret rollout) |
| 2c   | 200, JSON list                                                         | 401 (stale/wrong bearer in file) or 5xx                                     |
| 3a   | 200, mmr_value≈67100                                                   | 5xx → Cox sandbox/Manheim secret drift; 401 → INTEL_SERVICE_SECRET drift    |
| 3b   | 200, ok:false or mmr_value:null                                        | 5xx → null-envelope path broken                                             |
| 3c   | 401                                                                    | 200 → placeholder-bypass guard regressed; emergency rollback                |
| 4c   | 200, processed:1                                                       | 401 → HMAC byte mismatch; 503 → secret guard misfire; 5xx → DB or worker    |
| 4d   | `ingest.mmr_worker_called` present in tail                             | event absent → main worker still running direct mode                        |

## Rollback notes

If anything in Step 3 or 4 misbehaves and we need to take staging back
to a known-good state:

1. **Disable worker-mode without redeploy** — flip the env var in the
   Cloudflare dashboard for `tav-aip-staging`:
   - `MANHEIM_LOOKUP_MODE` → `direct`
   - Save → propagates within seconds. Worker-mode branch is now dark;
     valuation falls back to the deprecated direct path (which has no
     Manheim secrets on the main worker, so MMR will return null —
     ingest still succeeds, just without valuations).

2. **Roll the shared secret** — if `INTEL_WORKER_SECRET` /
   `INTEL_SERVICE_SECRET` is suspected compromised:

   ```bash
   NEW=$(openssl rand -hex 32)
   printf '%s' "$NEW" | npx wrangler secret put INTEL_WORKER_SECRET --env staging
   printf '%s' "$NEW" | npx wrangler secret put INTEL_SERVICE_SECRET \
     --config workers/tav-intelligence-worker/wrangler.toml --env staging
   unset NEW
   ```

   No redeploy required; Cloudflare hot-swaps secrets. Update
   `~/.tav-staging-secrets.local` with the new value (or regenerate it).

3. **Revert the routing toggle** — if the wrangler.toml change itself
   needs to back out:
   ```bash
   git revert 1267d9d  # current routing-mode commit; review diff first
   git push origin main
   npx wrangler deploy --env staging
   ```
   Note: this also reverts the fail-closed secret guards. Prefer #1
   first; only revert as a last resort.

4. **Cleanup of smoke rows** — once smoke passes, optionally clean
   `raw_listings` / `normalized` / `leads` for the synthetic
   `listing_id` `fb-smoke-2026-05-09-001` and any `run_id` prefixed
   `smoke-`. Direct SQL via Supabase studio; not strictly required
   (rows are isolated by run_id and ignorable).

## Out of scope

- Production cutover (production stays on `MANHEIM_LOOKUP_MODE=direct`
  per current wrangler.toml; intel-prod KV provisioned but secrets
  not yet uploaded).
- `MANHEIM_INCLUDE_RETAIL` opt-in (deferred follow-up).
- Apify caller HMAC distribution — separate handoff once smoke green.
