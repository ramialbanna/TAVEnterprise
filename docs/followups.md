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

**Open Cox blockers (pending product-guide review or rep response):**
- [ ] Confirm exact `MANHEIM_TOKEN_URL` (Cox Bridge 2 token endpoint full URL — copy verbatim from the Cox app detail page).
- [ ] Confirm whether `odometer` is a supported query param on `/vin/{vin}` and `/search/...` (current code omits it pending docs).
- [ ] Confirm response-shape parity vs `adjustedPricing.wholesale.{average,above,below}` + `sampleSize`. If shape differs, extend `extractMmrValue` / `extractManheimDistribution` fallback chain.
- [ ] Provide ≥2 known-good sandbox VINs, ≥1 expected-404 VIN, ≥2 YMM combos with valid `bodyname`.

**Deferred Cox features (logged for future phases):**
- [ ] VIN disambiguation variants `/vin/{vin}/{subseries}` and `/vin/{vin}/{subseries}/{transmission}`.
- [ ] Long-form YMMT path `/search/years/{year}/makes/{make}/models/{model}/trims/{bodyname}`.
- [ ] Trim alias table (currently pass-through; listing trims may not match Cox `bodyname` strings).
- [ ] Reference endpoints `/colors`, `/edition`, `/grades`, `/regions`, `/regions/auction/id/{auction_id}`, `/regions/id/{region_id}` for future enrichment.
- [ ] Batch endpoint `/mmr-batch` (no batch use case in ingest yet).

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
