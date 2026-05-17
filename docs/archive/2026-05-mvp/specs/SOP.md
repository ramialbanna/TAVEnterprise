# TAV-AIP Standard Operating Procedure

> Last updated: 2026-05-06 — reflects HEAD at 72b3be8, 15 commits ahead of origin/main, 262 tests passing.

---

## 1. What the system does

TAV Enterprise Acquisition Intelligence Platform (TAV-AIP) is a Cloudflare Worker that:
1. Receives vehicle listings scraped from Facebook Marketplace (and future platforms) via an authenticated ingest webhook.
2. Normalizes, dedupes, and scores each listing using a hybrid buy-box algorithm.
3. Upserts qualified leads into Supabase.
4. Fires SMS + webhook alerts when a run produces excellent-grade leads.
5. Provides admin API routes for importing historical purchase outcomes, managing market data, and triggering scoring recomputation.

Current scope: Facebook Marketplace only, 4 regions (Dallas TX, Houston TX, San Antonio TX, Phoenix AZ). Single Worker, single Supabase project, Cloudflare KV for Manheim token/valuation cache.

---

## 2. Four-concept rule (architectural invariant)

**Never collapse these layers.** Violating this is a blocker, not a nit.

| Concept | Table / Module | Description |
|---|---|---|
| Raw Listing | `raw_listings` | Untouched source payload. Replay / audit surface. |
| Normalized Listing | `normalized_listings` | Cleaned per-platform record. Input to stale, dedupe. |
| Vehicle Candidate | (implicit via dedupe) | Likely real vehicle behind ≥1 listings. |
| Lead | `leads` | Buyer work item. Has score, grade, score_components. |

---

## 3. Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers (TypeScript strict) |
| Database | Supabase Postgres (PostgREST + Supabase JS client) |
| Cache | Cloudflare KV (`TAV_KV`) |
| Scraper | Apify (external, pushes to ingest endpoint) |
| Valuation | Manheim MMR API (VIN path primary, YMM fallback) |
| Alerts | Twilio SMS + arbitrary webhook URL |
| Test framework | Vitest |
| CI/Deploy | Wrangler CLI |

---

## 4. Repository layout

```
src/
  index.ts                  Worker entry point, HTTP routing
  validate.ts               IngestRequestSchema (Zod)
  types/
    domain.ts               All domain interfaces (authoritative)
    env.ts                  Env bindings type
  sources/
    facebook.ts             Facebook Marketplace adapter → NormalizedListingInput
  normalize/
    normalize.ts            Platform-agnostic normalization
  dedupe/
    fingerprint.ts          SHA-256 content fingerprint for dedupe
  stale/
    scorer.ts               Staleness scoring
  scoring/
    buybox.ts               Rule-based buy-box match
    deal.ts                 Deal score
    lead.ts                 Lead score + grade (excellent/good/fair/poor)
    hybrid.ts               Hybrid score: rule×0.60 + segment×0.25 + demand×0.15
    segment.ts              Segment avg gross margin → 0-100
    demand.ts               Demand index passthrough with clamp
  ingest/
    handleIngest.ts         8-stage per-item ingest loop; batches excellent leads
  outcomes/
    import.ts               CSV outcome row parser (discriminated union result)
    conditionGrade.ts       Raw text → excellent/good/fair/poor/unknown
    fingerprint.ts          SHA-256 import dedup: weekLabel|vehicleKey|buyerId|pricePaid
  persistence/
    retry.ts                withRetry(fn, {attempts:3, delays:[250,1000,4000]})
    leads.ts                upsertLead, getLead
    purchaseOutcomes.ts     upsertPurchaseOutcome (fingerprint dedup), getSegmentAvgMarginPct
    importBatches.ts        createImportBatch, updateImportBatchCounts, listImportBatches
    importRows.ts           insertImportRow, bulkInsertImportRows
    marketExpenses.ts       upsertMarketExpense, getMarketExpensesByRegion
    marketDemandIndex.ts    upsertMarketDemandIndex, getDemandScoreForRegion
    buyBoxScoreAttributions.ts  insertBuyBoxScoreAttribution
  valuation/
    mmr.ts                  getMmrValue (VIN→YMM fallback, KV-cached)
  alerts/
    alerts.ts               sendSmsAlert, sendWebhookAlert, sendExcellentLeadSummary
  admin/
    routes.ts               All /admin/* routes (bearer-token auth)
  auth/
    hmac.ts                 HMAC-SHA256 ingest signature verify
  logging/
    logger.ts               Structured JSON logging (log, logError)

supabase/
  schema.sql                Canonical schema (kept in sync with migrations)
  migrations/               0001–0021 applied; see §8 below
  repair-functions.sql      One-time stored procedure reinstall (pending promotion to 0022)

test/
  *.test.ts                 Vitest unit tests (262 passing)
  ingest.int.test.ts        Integration test (requires live Supabase)
  fixtures/                 Static test payloads

docs/
  followups.md              Scope-creep log (~27 open items)
  superpowers/plans/        Per-feature implementation plans
  architecture.md           Full architecture reference
  RUNBOOK.md                Ops runbook (placeholder)
  SECURITY.md               Secrets + HMAC + RLS plan (placeholder)

wrangler.toml               Worker config (KV namespaces, vars, environments)
.dev.vars.example           Local secret template (no real values)
```

---

## 5. Ingest pipeline (per-item, in order)

```
POST /ingest  (x-tav-signature: sha256=<hex>)
  │
  1. HMAC verify (WEBHOOK_HMAC_SECRET)
  2. Zod validate (IngestRequestSchema — region enum, scraped_at, items[])
  3. For each item:
     a. Platform adapter  → NormalizedListingInput
     b. normalize()       → NormalizedListing
     c. dedupe check      → skip if fingerprint exists
     d. Stale score       → skip if stale
     e. Manheim MMR       → valuation (non-blocking, null on failure)
     f. Buy-box match     → ruleScore (0–100)
     g. Hybrid score      → ruleScore×0.60 + segmentScore×0.25 + demandScore×0.15
                            (segmentScore and demandScore are non-blocking, fallback 50)
     h. Lead grade        → excellent(≥80) / good(60–79) / fair(40–59) / poor(<40)
     i. upsertLead()      → writes leads table + score_components JSONB
     j. insertBuyBoxScoreAttribution() → non-blocking
     k. Accumulate excellentLeads[]
  4. execCtx.waitUntil(sendExcellentLeadSummary(...))  ← fire-and-forget after response
  5. Return 200 {ok, created, updated, skipped, filtered}
```

---

## 6. Hybrid scoring formula

```
hybridScore = ruleScore × 0.60
            + segmentScore × 0.25    (avg gross margin pct from v_segment_profit, 0-100)
            + demandScore × 0.15     (market_demand_index.demand_score, 0-100)
```

Feature flag: `HYBRID_BUYBOX_ENABLED` env var. `"true"` → hybrid. Anything else → pure ruleScore (legacy behavior). Currently `"true"` in all environments.

---

## 7. Alert pipeline

`sendExcellentLeadSummary` fires after each ingest run if `excellentLeads.length > 0`.

- SMS: Twilio API, `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `ALERT_TO_NUMBER` + `TWILIO_FROM_NUMBER`. Guard: if any Twilio var is absent or `"replace_me"`, no-op.
- Webhook: POST JSON to `ALERT_WEBHOOK_URL`. Guard: absent or `"replace_me"` → no-op.
- Both channels run in parallel via `Promise.allSettled`. Either channel can fail without affecting the other or the ingest response.
- Alert failures are logged but never throw.
- `execCtx.waitUntil` wraps the dispatch so it does not block the HTTP response.

---

## 8. Database migrations (all applied to production)

| Migration | What it does |
|---|---|
| 0001 | Initial schema: raw_listings, normalized_listings, leads, tav.buy_box_rules, etc. |
| 0002 | Grant tav schema permissions |
| 0003 | Fix normalized_listing_url unique constraint |
| 0004 | `tav.upsert_normalized_listing()` stored procedure |
| 0005 | `tav.run_stale_sweep()` stored procedure |
| 0006 | Seed buy-box rules (Dallas, Houston, San Antonio, Phoenix) |
| 0007 | Year constraint alignment |
| 0008 | `valuation_snapshots` table |
| 0009 | Reconcile valuation_snapshots schema |
| 0010 | Fix stale_sweep lead count logic |
| 0011 | `purchase_outcomes` expanded (financials, condition, channels, import provenance) |
| 0012 | `import_batches` + `import_rows` (per-row audit, idempotent re-imports) |
| 0013 | `market_expenses` (transport/auction/misc by city/region) |
| 0014 | `market_demand_index` (region + segment demand score) |
| 0015 | `buy_box_score_attributions` (per-lead hybrid score breakdown) |
| 0016 | `v_outcome_summary` + `v_segment_profit` analytic views |
| 0017 | `leads.score_components` JSONB column |
| 0018 | `purchase_outcomes.buyer_id` → text; add `closer_id` |
| 0019 | `purchase_outcomes.cot_city`, `cot_state` |
| 0020 | Unique constraint on `purchase_outcomes.import_fingerprint` |
| 0021 | Replace COALESCE expression indexes with plain unique constraints on `market_expenses` and `market_demand_index` |

**Pending:** `repair-functions.sql` (one-time reinstall of stored procedures) should be promoted to migration 0022.

---

## 9. Admin routes (all require `Authorization: Bearer <ADMIN_API_SECRET>`)

| Method | Route | Description |
|---|---|---|
| POST | `/admin/import-outcomes` | CSV import of historical purchase outcomes |
| GET | `/admin/outcomes/dashboard` | Outcome summary stats |
| GET | `/admin/market/expenses?region=xxx` | Market expenses by region |
| PUT | `/admin/market/expenses` | Upsert market expense record |
| GET | `/admin/market/demand` | Demand index entries |
| POST | `/admin/market/demand/recompute` | Recompute demand scores from purchase_outcomes |
| GET | `/admin/buy-box/attributions?lead_id=xxx` | Score attribution breakdown for a lead |
| GET | `/admin/import-batches` | List import batches (?limit=N) |

No RLS policies exist yet. Admin auth is entirely bearer-token based.

---

## 10. Environment variables

### Cloudflare secrets (set via `wrangler secret put <NAME>`)

| Secret | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (Worker only, never client-side) |
| `WEBHOOK_HMAC_SECRET` | HMAC secret for ingest signature verification |
| `ADMIN_API_SECRET` | Bearer token for all /admin/* routes |
| `MANHEIM_CLIENT_ID` | Manheim API credentials |
| `MANHEIM_CLIENT_SECRET` | |
| `MANHEIM_USERNAME` | |
| `MANHEIM_PASSWORD` | |
| `MANHEIM_GRANT_TYPE` | (typically `password`) |
| `MANHEIM_SUBSCRIBER_ID` | |
| `TWILIO_ACCOUNT_SID` | Twilio credentials (absent = SMS disabled) |
| `TWILIO_AUTH_TOKEN` | |
| `TWILIO_FROM_NUMBER` | |
| `ALERT_TO_NUMBER` | Destination SMS number |
| `ALERT_WEBHOOK_URL` | Webhook destination (absent or "replace_me" = disabled) |
| `NORMALIZER_SECRET` | Reserved for Phase 8 replay endpoint auth |

### Vars (in wrangler.toml, non-secret)

| Var | Value | Description |
|---|---|---|
| `HYBRID_BUYBOX_ENABLED` | `"true"` | Enable hybrid scoring (all envs) |

---

## 11. KV namespaces

| Environment | Binding | Namespace ID |
|---|---|---|
| Default (dev) | `TAV_KV` | `e61e291003f647a5ad0ffce778ac6631` |
| Staging | `TAV_KV` | `44c7dbe6bad5478cb51878b053758805` |
| Production | `TAV_KV` | `e61e291003f647a5ad0ffce778ac6631` |

**Known risk:** Default `wrangler dev` (no `--env`) uses the production KV ID. Tracked in followups.md. Staging missing `preview_id`.

---

## 12. Verification loop (non-negotiable before any commit)

```bash
npm run lint
npm run typecheck
npm test
# if src/persistence/, src/valuation/, src/sources/, or supabase/migrations/ touched:
npm run test:int
```

Current baseline: 16 test files, 262 tests, all passing.

---

## 13. Deployment

```bash
# Local dev
npm run dev

# Deploy to production
npm run deploy

# Deploy to staging
wrangler deploy --env staging

# Stream production logs
wrangler tail

# Set a secret
wrangler secret put <NAME>
```

---

## 14. Importing historical purchase outcomes

```bash
# 1. Prepare CSV with columns:
#    week_label, vehicle_key, buyer_id, price_paid, sale_price,
#    hold_days, condition_grade, region, closer_id, cot_city, cot_state

# 2. POST to admin endpoint
curl -X POST https://<worker>/admin/import-outcomes \
  -H "Authorization: Bearer $ADMIN_API_SECRET" \
  -H "Content-Type: text/csv" \
  --data-binary @outcomes.csv

# 3. After import, recompute demand scores
curl -X POST https://<worker>/admin/market/demand/recompute \
  -H "Authorization: Bearer $ADMIN_API_SECRET"
```

Import is idempotent: re-uploading the same rows is safe. Fingerprint = SHA-256 of `weekLabel|vehicleKey|buyerId|pricePaid`. A corrected re-upload at a different price creates a new record (by design). To truly re-import, clear `purchase_outcomes` first.

---

## 15. Stale sweep (cron)

Runs daily at 06:00 UTC via `[triggers] crons = ["0 6 * * *"]`.

Calls `tav.run_stale_sweep()` which marks normalized_listings as stale and updates lead status accordingly. Stale-detection regressions are blockers.

---

## 16. Manheim MMR

- VIN path: `GET /valuations/vin/<VIN>` with OAuth bearer token
- YMM fallback: `GET /valuations/search/<year>/<make>/<model>` (year/make/model as path segments)
- Token cached in KV with TTL
- Returns null on any failure (non-blocking); ingest continues without valuation
- HTTP 596 = Manheim "account not provisioned" — contact Manheim rep for YMM search access. VIN path provisioned.

---

## 17. Phase roadmap

| Phase | Status | Summary |
|---|---|---|
| 1 | Done | Ingest endpoint, Facebook adapter, normalize, Supabase persistence |
| 2 | Done | Dedupe fingerprinting, stale sweep cron |
| 3 | Done | Buy-box rule scoring, lead grading |
| 4 | Done | Data integrity gaps, HMAC auth, retry layer |
| 5 | Done | Manheim MMR valuation (VIN + YMM) |
| 6 | Done | Hybrid buy-box: purchase outcome import, market data, demand index |
| 7 | Done | Excellent lead alerts via Twilio SMS + webhook, waitUntil dispatch |
| 8 | Not started | Replay endpoint `POST /replay`, auth via `NORMALIZER_SECRET` |
| 9 | Not started | Twilio webhook inbound (buyer reply handling) |
| — | Not started | Next.js dashboard with Supabase Auth |

---

## 18. Top open items (see docs/followups.md for full list)

**Correctness / reliability:**
1. Consolidate `ParsedOutcomeRow` — declared in `src/outcomes/import.ts` and `src/types/domain.ts`. Divergence risk.
2. Pick one source of truth for `ConditionGradeNormalized` (`conditionGrade.ts` vs `domain.ts`).
3. Add `NOT NULL` to `purchase_outcomes.import_fingerprint` (migration 0022).
4. Promote `supabase/repair-functions.sql` to migration 0022, or confirm all envs applied it and delete.
5. Replace N+1 per-region SELECT in `/admin/market/demand/recompute` with a single `GROUP BY` aggregate.
6. Clamp `?limit` to max 100 on `GET /admin/import-batches`.
7. Add Zod schema for `PUT /admin/market/expenses`; remove manual `as` casts.

**Observability:**
8. Log catch-path failures (network timeout / AbortError) in `sendSmsAlert` / `sendWebhookAlert`.
9. Add Twilio env-var `"replace_me"` guards for `TWILIO_AUTH_TOKEN` and `ALERT_TO_NUMBER`.
10. Log `Promise.allSettled` rejected settlements at warn level in `sendExcellentLeadSummary`.
11. Log HTTP status on `!res.ok` in `getMmrByVin` and `getMmrByYmm`.

**Configuration:**
12. Add `preview_id` to `[[env.staging.kv_namespaces]]`.
13. Evaluate replacing top-level KV ID with a dedicated dev namespace to prevent production cache contamination.

**Test coverage:**
14. `test/outcome.import.test.ts` — add `closerId`, `cotCity`, `cotState` field mapping assertions.
15. `test/outcome.import.test.ts` — mileage bucket boundary test (49999 vs 50000).
16. `test/alerts.test.ts` — assert webhook fired even when SMS channel rejects.

---

## 19. Local dev setup

```bash
cd ~/Claude/tav-aip
cp .dev.vars.example .dev.vars    # fill in secrets
npm install
npm run dev                        # wrangler dev on localhost:8787
```
