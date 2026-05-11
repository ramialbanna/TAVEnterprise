# Follow-ups

Append items here when scope creep is detected during a TAV-AIP task. Format:

- [ ] `<UTC date>` `<area>` — `<one-line description>` `(noticed by: <agent | user>)`

Example:

- [ ] 2026-05-03 src/normalize — extract trim from title when explicit `trim` field is missing (noticed by: reviewer)
- [ ] 2026-05-03 supabase — add CONCURRENTLY index on `(source, source_listing_id)` for exact dedupe lookups (noticed by: data-modeler)
- [ ] 2026-05-03 src/valuation — add single-flight protection around Manheim token refresh (noticed by: implementer)
- [ ] 2026-05-06 supabase/migrations — audit IS NULL / IS NOT NULL queries on import_fingerprint; column is not yet NOT NULL but any null-check assumptions should be documented (Q7) (noticed by: user)
- [ ] 2026-05-06 src/persistence/purchaseOutcomes — add DLQ write (dead_letters or KV key) for final-failure on upsertPurchaseOutcome / bulkInsertImportRows after RetryExhaustedError (noticed by: reviewer)
- [ ] 2026-05-06 src/admin/routes — add Zod schema for PUT /admin/market/expenses request body; replace manual `as` casts (noticed by: reviewer)
- [ ] 2026-05-06 src/admin/routes — replace N+1 per-region SELECT in recompute with a single GROUP BY aggregate query to avoid unbounded Worker memory usage (noticed by: reviewer)
- [x] 2026-05-06 src/admin/routes — clamp ?limit to max 100 in GET /admin/import-batches (noticed by: reviewer) — DONE
- [x] 2026-05-06 src/valuation/mmr — log HTTP status on !res.ok in getMmrByVin and getMmrByYmm error branches (noticed by: reviewer) — DONE
- [ ] 2026-05-06 src/admin/routes — refactor demand recompute logic out of routes.ts into src/scoring/demandRecompute.ts (noticed by: reviewer)
- [ ] 2026-05-06 src/types/domain — consolidate ParsedOutcomeRow: remove duplicate definition from src/outcomes/import.ts and import from domain.ts (noticed by: reviewer)
- [ ] 2026-05-06 src/types/domain — pick one source of truth for ConditionGradeNormalized (currently in conditionGrade.ts and domain.ts) (noticed by: reviewer)
- [ ] 2026-05-06 supabase/migrations — add NOT NULL to purchase_outcomes.import_fingerprint in a future migration 0022 (noticed by: reviewer)
- [ ] 2026-05-06 supabase — promote repair-functions.sql to migration 0022 or delete after confirming all environments applied it (noticed by: reviewer)
- [ ] 2026-05-06 supabase — audit IS NULL queries against market_expenses.city and market_demand_index.segment_key — silently break after 0021 NOT NULL DEFAULT '' change (noticed by: reviewer)
- [ ] 2026-05-06 supabase/migrations — wrap multi-step DDL migrations in explicit BEGIN/COMMIT for safer manual psql replay (noticed by: reviewer)
- [x] 2026-05-06 src/persistence/purchaseOutcomes — wrap primary upsert (line 22) in withRetry to match retry posture of the fallback SELECT (noticed by: reviewer) — DONE d4c845d
- [x] 2026-05-06 src/alerts/alerts.ts — log HTTP status + reason_code when !res.ok in sendSmsAlert and sendWebhookAlert; currently returns false with no observable signal (noticed by: reviewer) — DONE 95b6b23
- [x] 2026-05-06 src/alerts/alerts.ts — log Promise.allSettled rejected settlements at warn level in sendExcellentLeadSummary (noticed by: reviewer) — DONE
- [x] 2026-05-06 src/alerts/alerts.ts — add Twilio env-var presence guard (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN empty check) symmetric to the ALERT_WEBHOOK_URL replace_me guard (noticed by: reviewer) — DONE (already implemented)
- [x] 2026-05-06 src/admin/routes.ts — add reason_code field to recompute.region_failed log payload for structured log querying (noticed by: reviewer) — DONE
- [x] 2026-05-06 src/outcomes/fingerprint.ts — add comment explaining why pricePaid is a fingerprint dimension (corrected re-upload at different price = distinct purchase event by design) (noticed by: reviewer) — DONE
- [ ] 2026-05-06 test/outcome.import.test.ts — add assertions for closerId, cotCity, cotState field mapping including COT City / COT State spreadsheet aliases (noticed by: reviewer)
- [ ] 2026-05-06 test/outcome.import.test.ts — add mileage bucket boundary test: mileage 49999 (bucket 40k) vs 50000 (bucket 50k) should produce distinct fingerprints (noticed by: reviewer)
- [ ] 2026-05-06 test/alerts.test.ts — strengthen partial-failure isolation test: assert webhook fetch fired even when SMS rejects (noticed by: reviewer)
- [ ] 2026-05-06 wrangler.toml — add preview_id to [[env.staging.kv_namespaces]] to prevent staging wrangler dev from sharing state with default dev namespace (noticed by: reviewer)
- [ ] 2026-05-06 wrangler.toml — evaluate replacing top-level [[kv_namespaces]] production ID with a dedicated dev namespace; currently wrangler dev (no --env) writes to the production KV cache (noticed by: reviewer)
- [x] 2026-05-06 .dev.vars.example — add NORMALIZER_SECRET placeholder entry; wire into a route guard when the Phase 7 replay endpoint ships (noticed by: reviewer) — DONE (already present)
- [x] 2026-05-06 src/alerts/alerts.ts — log catch-path failures (network timeout / AbortError) in sendSmsAlert and sendWebhookAlert with reason_code: "network_timeout"; currently silent (noticed by: reviewer) — DONE
- [ ] 2026-05-06 src/admin/routes.ts — add row LIMIT (e.g. 5000) to per-region SELECT in demand/recompute loop to bound Worker memory as purchase_outcomes grows (noticed by: reviewer)
- [x] 2026-05-08 workers/tav-intelligence-worker — implement GET /kpis/summary with real Supabase RPC tav.get_mmr_kpis (p95 latency, cache hit rate, by-type/outcome breakdown, top requesters) — DONE
- [x] 2026-05-08 workers/tav-intelligence-worker — implement GET /intel/mmr/queries paginated audit history (21-field allowlist, all filters, offset pagination with has_more) — DONE
- [x] 2026-05-08 supabase/migrations — add 0032_get_mmr_kpis.sql: CREATE tav.get_mmr_kpis RPC + GRANT EXECUTE to service_role — DONE
- [x] 2026-05-08 src/valuation + supabase/migrations — G.5.3 Manheim reference normalization: mmr_reference_makes/models/aliases tables, normalizeMmrParams pure normalizer, loadMmrReferenceData DB loader, workerClient YMM normalization wiring, ValuationResult metadata fields, valuationSnapshots + vehicleEnrichments persistence — DONE cafbfd7
- [x] 2026-05-08 workers/tav-intelligence-worker — add MANHEIM_GRANT_TYPE env var support: "client_credentials" omits username/password; "password" or absent preserves current behavior — DONE (this session)
- [x] 2026-05-08 src/valuation/workerClient.ts — add ingest.mmr_worker_called structured log event before worker fetch; was a noted observability gap in UAT plan — DONE (this session)
- [x] 2026-05-08 docs — G.5.4 UAT validation plan written to docs/manheim-uat-validation-plan.md — DONE 1ce0579

## MANHEIM_LOOKUP_MODE="worker" — implemented, not yet enabled in staging/production

`MANHEIM_LOOKUP_MODE="worker"` routes ingest valuation through tav-intelligence-worker
(`src/valuation/workerClient.ts`). The code is complete but the flag stays `"direct"` in all
wrangler.toml env blocks until the following operational prerequisites are met.

**Current behavior when set to "worker":**
- Main worker POSTs to `/mmr/vin` or `/mmr/year-make-model` on tav-intelligence-worker.
- Auth: `x-tav-service-secret` header must match `INTEL_SERVICE_SECRET` on the intelligence worker.
- Timeout: 5s hard deadline. Timeout → `WorkerTimeoutError` → `ingest.mmr_worker_failed` log → mmrResult=null (non-blocking).
- 429 → `WorkerRateLimitError` → same fallback. 5xx → `WorkerUnavailableError` → same fallback.
- Rate-limit guard: ingest calls receive service identity (`service@tav-internal`), not a user email — they do not exhaust per-user quota.
- On success, `MmrResponseEnvelope` is mapped to `MmrResult`; valuation snapshot is written; scoring uses the returned value.

Full UAT validation plan: `docs/manheim-uat-validation-plan.md`

**Cox sandbox confirmed (2026-05-08, MMR 1.4 OpenAPI):**
- [x] Vendor profile: Cox Bridge 2.
- [x] Grant type: `client_credentials` with HTTP Basic Auth on token endpoint.
- [x] Scope: `wholesale-valuations.vehicle.mmr-ext.get`.
- [x] MMR base: `https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr` (note trailing `/mmr`).
- [x] VIN endpoint: `GET /vin/{vin}` (path-segment).
- [x] YMMT endpoint: `GET /search/{year}/{makename}/{modelname}/{bodyname}` — `bodyname` (trim) REQUIRED.
- [x] Code wired to MMR 1.4 paths in `manheimHttp.ts` `buildVinUrl` / `buildYmmUrl`; trim threaded across boundary in `workerClient.ts`; trimless YMM short-circuits to null envelope.

**Resolved by Cox MMR 1.4 guide (2026-05-08):**
- [x] `odometer` supported as a query param on both `/vin/{vin}` and `/search/...` — code now sends it.
- [x] Response shape: `adjustedPricing.wholesale.{average,above,below}` + `adjustedPricing.retail.{average,above,below}` (when `include=retail`) + `sampleSize`. `extractManheimDistribution` updated to extract retail tiers.
- [x] `evbh` validated to integer in `[75, 100]` inclusive; out-of-range silently dropped.
- [x] `zipCode` (not `zip`) supported as a query param.
- [x] `include` query supports `retail`, `forecast`, `historical`, `ci` (`ci` stripped on Search/YMMT). Behavior gated by `MANHEIM_INCLUDE_*` env flags; default conservative (no flags set → no `include` param).

**Resolved by sandbox UAT 2026-05-08 (see `docs/manheim-uat-validation-plan.md` §14):**
- [x] Token URL works against Cox sandbox (HTTP 200, scope accepted, `Bearer` token, `expires_in: 86400`).
- [x] Sandbox VIN/YMMT test data validated: VIN `1FT8W3BT1SEC27066` returns 2025 Ford F-350SD wholesale tiers; no-data VIN `1FT8W3BT199999999` returns 404 → null envelope; YMMT `2025 / Acura / ADX AWD / 4D SUV` returns wholesale tiers.
- [x] Response shape confirmed: `adjustedPricing.wholesale.{above,average,below}` + `sampleSize` (string) match the parser's expectations on real Cox responses.
- [x] `include=retail` flag mechanically works on VIN. **Non-core for TAV (wholesale-only).** No further retail parser or persistence work planned; raw retail payload is preserved for opportunistic use only.

**Open Cox blockers:** none. (All previously-listed blockers resolved by sandbox UAT.)

**Business decision (2026-05-08): TAV is wholesale-only.** Retail values are not
a core requirement. Do not add `mmr_retail_avg` / `mmr_retail_rough` columns to
`tav.valuation_snapshots`. Do not extend the parser or scoring around retail
data. Retail remains optional context preserved on the raw `mmr_payload` only.

**Deferred Cox features (logged for future phases):**
- [ ] **`include=ci` sandbox validation on VIN** — turn `MANHEIM_INCLUDE_CI=true` on, confirm `confidenceInterval` populates on `/vin/{vin}` and is correctly stripped on Search/YMMT (no 4xx, no `ci` token in the URL).
- [ ] **`include=forecast` / `include=historical` sandbox validation** — only pursue if these sections add wholesale-pricing signal (e.g. forecast-based stale detection). Skip if they are retail-flavored only.
- [ ] **Reference-sync from `mmr-lookup` endpoints** — Cox `/mmr-lookup` is the future source-of-truth for make/model/trim alias data (currently `mmr_reference_makes` / `mmr_reference_models` / `mmr_make_aliases` / `mmr_model_aliases` are seeded by hand and `bodyname` has no alias table). Plan: build a periodic job that pulls canonical strings from `/mmr-lookup` and refreshes the reference tables.
- [ ] VIN disambiguation variants `/vin/{vin}/{subseries}` and `/vin/{vin}/{subseries}/{transmission}`.
- [ ] Long-form YMMT path `/search/years/{year}/makes/{make}/models/{model}/trims/{bodyname}`.
- [ ] Trim alias table (currently pass-through; listing trims may not match Cox `bodyname` strings).
- [ ] Wire `forecast`, `historical`, `confidenceInterval` into `extractManheimDistribution` only if a wholesale-relevant downstream consumer needs them. Today only `wholesale` (and a non-core `retail`) tier is parsed.
- [ ] Reference endpoints `/colors`, `/edition`, `/grades`, `/regions`, `/regions/auction/id/{auction_id}`, `/regions/id/{region_id}` for future enrichment.
- [ ] Batch endpoint `POST {.../mmr-batch}/vins` (up to 100 VINs); no batch use case in ingest yet.
- [ ] Plumb `region`, `color`, `grade`, `date`, `extendedCoverage`, `orgId`, `excludeBuild` query params through `appendCoxQueryParams` when use cases land.

**Internal staging blockers:**
- [ ] Provision `INTEL_WORKER_URL` secret on main worker (staging URL of tav-intelligence-worker).
- [ ] Provision `INTEL_WORKER_SECRET` secret on main worker (any strong random value, matching below).
- [ ] Provision `INTEL_SERVICE_SECRET` secret on intelligence worker (same value as `INTEL_WORKER_SECRET`).
- [ ] Provision Cox sandbox secrets on intelligence worker: `MANHEIM_API_VENDOR=cox`, `MANHEIM_GRANT_TYPE=client_credentials`, `MANHEIM_SCOPE=wholesale-valuations.vehicle.mmr-ext.get`, `MANHEIM_CLIENT_ID`, `MANHEIM_CLIENT_SECRET`, `MANHEIM_TOKEN_URL`, `MANHEIM_MMR_URL`.
- [ ] tav-intelligence-worker must be deployed to staging (`workers_dev = true` is already set).
- [ ] End-to-end smoke test in staging: POST /ingest → verify `ingest.mmr_worker_called` + `valuation.fetched` log events appear and `tav.valuation_snapshots` row is written.
- [ ] After staging validation: set `MANHEIM_LOOKUP_MODE = "worker"` in `[env.staging.vars]` and redeploy main worker.

**Provisioning commands (staging) — full Cox set:**
```
WRANGLER_FLAGS="--config workers/tav-intelligence-worker/wrangler.toml --env staging"
wrangler secret put INTEL_WORKER_URL
wrangler secret put INTEL_WORKER_SECRET
wrangler secret put INTEL_SERVICE_SECRET   $WRANGLER_FLAGS
wrangler secret put MANHEIM_API_VENDOR     $WRANGLER_FLAGS  # "cox"
wrangler secret put MANHEIM_GRANT_TYPE     $WRANGLER_FLAGS  # "client_credentials"
wrangler secret put MANHEIM_SCOPE          $WRANGLER_FLAGS  # "wholesale-valuations.vehicle.mmr-ext.get"
wrangler secret put MANHEIM_CLIENT_ID      $WRANGLER_FLAGS
wrangler secret put MANHEIM_CLIENT_SECRET  $WRANGLER_FLAGS
wrangler secret put MANHEIM_TOKEN_URL      $WRANGLER_FLAGS
wrangler secret put MANHEIM_MMR_URL        $WRANGLER_FLAGS
```

- [x] 2026-05-08 src/ingest + workers/tav-intelligence-worker — implement MANHEIM_LOOKUP_MODE="worker"
      path: service-binding call, timeout guard, error mapping, ingest integration tests — DONE (G.5.2)

## Production deploy blockers — tav-intelligence-worker

These must be completed before the intelligence worker can be deployed to production.
Do NOT modify wrangler.toml IDs until the namespace is provisioned.

- [ ] 2026-05-08 wrangler.toml — provision TAV_INTEL_KV production namespace and replace placeholder ID:
      `wrangler kv namespace create TAV_INTEL_KV_PRODUCTION --config workers/tav-intelligence-worker/wrangler.toml --env production`
      Then paste the returned `id` into `[[env.production.kv_namespaces]] id = ...`

- [ ] 2026-05-08 wrangler.toml — provision TAV_INTEL_KV preview namespace (used by `wrangler dev` without --env) and replace both placeholder IDs:
      `wrangler kv namespace create TAV_INTEL_KV_PREVIEW --config workers/tav-intelligence-worker/wrangler.toml`
      Then paste `id` and `preview_id` into `[[kv_namespaces]]`

- [ ] 2026-05-08 wrangler.toml — confirm staging KV namespace has `preview_id` set in `[[env.staging.kv_namespaces]]`
      (currently only `id` is set; missing `preview_id` will cause `wrangler dev --env staging` to warn)

- [ ] 2026-05-08 secrets — provision production secrets (run each with --env production):
      MANHEIM_CLIENT_ID, MANHEIM_CLIENT_SECRET, MANHEIM_TOKEN_URL, MANHEIM_MMR_URL,
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INTEL_SERVICE_SECRET
      — and conditionally: MANHEIM_USERNAME + MANHEIM_PASSWORD (password grant only),
      MANHEIM_GRANT_TYPE (only if client_credentials — confirm with Manheim rep first)
      `wrangler secret put <NAME> --config workers/tav-intelligence-worker/wrangler.toml --env production`

- [ ] 2026-05-08 wrangler.toml — set `workers_dev = true` under `[env.production]` once production secrets are provisioned,
      or use a Cloudflare Access policy to gate the production worker endpoint

- [x] 2026-05-08 supabase/migrations — apply migration 0033 (user_activity feed index + purge_expired_activity function)
      to remote before deploying production worker: `npx supabase db push` — DONE (confirmed via `supabase migration list`; remote is current through 0037)

## 2026-05-09 — production cutover follow-ups

- [ ] 2026-05-09 ops — distribute `WEBHOOK_HMAC_SECRET` (production) to Apify ingest team so they can sign /ingest payloads.
      Value lives in `~/.tav-prod-secrets.local` on the operator machine; share via the team's secret-distribution channel
      (1Password, Vault, etc.), not Slack/email plaintext.
- [ ] 2026-05-09 ops — distribute `ADMIN_API_SECRET` (production) to admin-tooling owners. Same channel as above.
- [ ] 2026-05-09 ops — once both above secrets are distributed, `shred -u ~/.tav-prod-secrets.local`
      (or `rm -P` on macOS). File is mode 600 and outside the repo, but should not linger after distribution.
- [ ] 2026-05-09 cox — production Cox MMR enablement is BLOCKED on Cox enabling the production environment for the
      TAV Evaluation app, or migrating to a separate Cox production app. Until then,
      `tav-intelligence-worker-production` runs against `https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr`
      using TAV Evaluation Sandbox Bridge 2 credentials (CLIENT_ID `a390ecdd-f036-479a-92d8-7794bcdb6afa`).
      Swap path when Cox enables prod: re-put `MANHEIM_TOKEN_URL`, `MANHEIM_MMR_URL`, `MANHEIM_CLIENT_ID`,
      `MANHEIM_CLIENT_SECRET`, optionally `MANHEIM_SCOPE` on intel-prod via `wrangler secret put` and redeploy.
      No code change required; worker reads these dynamically.
- [ ] 2026-05-09 wrangler.toml — `[env.production]` for `tav-intelligence-worker-production` keeps `workers_dev=false`
      (set during cutover after direct smoke). Re-enable temporarily via `workers_dev = true` + redeploy if direct
      diagnostic access is ever needed; revert after.
- [ ] 2026-05-09 docs — author production runbook entry covering: cutover state, rollback path (dashboard env-var flip
      to `MANHEIM_LOOKUP_MODE=direct`), and the sandbox-backed-Cox caveat. Reference docs/staging-smoke-2026-05-09.md
      "Production cutover" section for narrative.
- [ ] 2026-05-09 docs/manheim-uat-validation-plan.md — when Cox enables true prod MMR, append a prod-mode UAT
      mirroring §3 with prod-real VINs (not sandbox `1FT8W3BT1SEC27066`).

- [ ] 2026-05-11 wrangler/secrets — provision `APP_API_SECRET` (Bearer for `/app/*` frontend API) on
      `tav-aip-staging` and `tav-aip-production` via `wrangler secret put APP_API_SECRET` before the frontend
      integrates. Unset ⇒ all `/app/*` calls return 503 `app_auth_not_configured`. See ADR 0002.
- [ ] 2026-05-11 src/app/routes — implement remaining `/app/*` endpoints from ADR 0002: `GET /app/import-batches`
      (wraps `listImportBatches`), `GET /app/historical-sales` (new `persistence/historicalSales.ts` over
      `tav.historical_sales`), `POST /app/mmr/vin` (reuses `getMmrValueFromWorker`, non-blocking).
- [ ] 2026-05-11 supabase — add a global outcome-rollup view (e.g. `v_outcome_summary_global` with
      `COUNT(gross_profit)` so weighted averages are correct) so `GET /app/kpis` `outcomes.value` can expose true
      cross-region `avgGrossProfit` / `avgHoldDays` / `sellThroughRate` instead of only `totalOutcomes` + per-region.
- [ ] 2026-05-11 src — persist stale-sweep cron run times (audit row on each `runStaleSweep`) so
      `GET /app/system-status` `staleSweep.lastRunAt` stops returning `null` / `missingReason:"not_persisted"`.
- [ ] 2026-05-11 docs — write `docs/APP_API.md` formal contract doc for `/app/*` (currently the contract lives only
      in ADR 0002).
- [ ] 2026-05-11 .dev.vars.example — line ~48 comment still says `MANHEIM_LOOKUP_MODE` "worker (not yet implemented)";
      worker mode is implemented and live in production. Update the comment.
- [ ] 2026-05-11 lint — `npm run lint` exits 1 on 4 legacy root scripts (`test-mmr.js`, `backfill-mmr.js`,
      `normalizer-worker.js`, `enrichment-worker.js`): ~97 errors (`no-undef`, `no-console`). Decide: gitignore /
      delete the throwaway scripts, or add an eslint override. Pre-existing; unrelated to ADR 0002 work.
