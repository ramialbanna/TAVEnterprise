# TAV-AIP Scale Architecture

Target: 100,000+ listings/day, 4 regions, multiple sources.

## Ten-Point Engineering Foundation

### 1. Canonical Vehicle Schema
- `NormalizedListingInput` (TS) is the contract between source adapters and all downstream logic.
- VIN is always optional. YMM + mileage + region is the primary identity path for Facebook.
- SQL schema owns truth for persistence shape. TS types mirror it strictly.

### 2. Validation and Rejection Logic
Every listing passes three gates in order:
1. **Structural** (adapter): required fields present, types correct
2. **Semantic** (adapter): year 1990–2035, price $500–$500k, mileage 0–500k
3. **Business** (pipeline): buy-box match check (no match → grade=pass, no lead)

Every rejection writes a `reason_code` to `filtered_out`. Silent drops are forbidden.

### 3. Structured Logging
- `src/logging/logger.ts` — `log()` and `logError()` emit JSON to stdout (Cloudflare Logpush).
- `logError(category, event, error, ctx)` — always serializes errors, never `[object Object]`.
- Categories: auth | validation | adapter | persistence | timeout | budget | dedupe | scoring | lead
- Every log entry includes: event, runId, source, region, itemIndex (where applicable).

### 4. Deduplication (Non-VIN)
- `src/dedupe/fingerprint.ts` — generates `identity_key` deterministically:
  - VIN present: `vin:<VIN>`
  - No VIN: `ymm:<year>:<make_slug>:<model_slug>:<region>:<mileage_bucket>`
  - Mileage buckets: 0-25k, 25k-50k, 50k-75k, 75k-100k, 100k+
- `vehicle_candidates` table owns one row per real-world vehicle.
- `duplicate_groups` links `normalized_listings` → `vehicle_candidates` with confidence score.
- Canonical listing (is_canonical=true) is the highest-confidence source of truth per candidate.

### 5. Raw Payload Storage + Replay
- `raw_listings` stores every inbound item unchanged (jsonb `raw_item`).
- Future: `POST /replay?run_id=<id>` re-runs normalization without re-scraping.
- `NORMALIZER_SECRET` env var is reserved for the replay auth path.

### 6. Single-Responsibility Pipeline
```
handleIngest
  → receive + validate + source_run upsert
  → per-item loop:
      A. raw_listing insert
      B. source adapter (parseFacebookItem → NormalizedListingInput)
      C. upsert_normalized_listing RPC (atomic, tracks price changes, increments scrape_count)
      D. dedupe: upsertVehicleCandidate + linkNormalizedListingToCandidate
      E. stale score + freshness
      F. buy-box match (rules cached per run)
      G. final score + grade
      H. lead upsert (if grade != 'pass')
  → completeSourceRun
```
Each stage is a function in its own module. No stage touches another's concerns.

### 7. Freshness Scoring and Stale Filtering
Transitions (driven by `last_seen_at`):
```
new → active (seen again within 3 days)
active → aging (unseen 3–7 days)
aging → stale_suspected (unseen 7–14 days)
stale_suspected → stale_confirmed (unseen 14+ days)
stale_confirmed → removed (manual or 30+ days)
```
Daily cron (`run_stale_sweep` SQL function) applies transitions in bulk.
Stale score 0–100 used as input to `freshnessScore` component of final lead score.

### 8. Buy-Box Inputs
- `buy_box_rules` table: make, yearMin/Max, mileage, targetPricePctOfMmr, regions, sources.
- Rules fetched once per run and cached in-memory.
- `matchBuyBox()` returns highest-priority matching rule + score.
- No MMR in v1 → deal score uses price-only heuristics.

### 9. Synthetic Test Datasets
- `test/fixtures/facebook.ts` — typed fixture factory + canonical test cases.
- Used by adapter tests (already have 54), dedupe tests, scoring tests.
- Covers: valid YMM, make aliases, edge prices, stale ages, duplicate fingerprints.

### 10. System KPIs
Emitted as structured JSON log events with `kpi: true` flag:
- `ingest.complete` — items/run, processed/rejected, created_leads
- `stale_sweep.complete` — updated count per status transition
- `lead.created` — source, region, grade, finalScore, matchedRule
- `dedupe.linked` — identity_key, is_new, dedupe_type
- `buybox.matched` — rule_id, score

Query via Cloudflare Logpush → Supabase `v_source_health` view gives run-level health.

## File Structure

```
src/
├── index.ts                         # Worker entry + scheduled cron handler
├── types/
│   └── domain.ts                    # All four-concept types + BuyBoxRule
├── auth/
│   └── hmac.ts
├── validate.ts
├── logging/
│   └── logger.ts                    # log(), logError(), serializeError()
├── ingest/
│   └── handleIngest.ts              # Full pipeline orchestration
├── sources/
│   └── facebook.ts
├── dedupe/
│   ├── fingerprint.ts               # computeIdentityKey()
│   └── matcher.ts                   # computeSimilarity()
├── stale/
│   ├── scorer.ts                    # computeStaleScore() — pure
│   └── engine.ts                    # runStaleSweep() — calls DB RPC
├── scoring/
│   ├── deal.ts                      # computeDealScore()
│   ├── buybox.ts                    # matchBuyBox()
│   └── lead.ts                      # computeFinalScore(), computeFreshnessScore()
└── persistence/
    ├── supabase.ts
    ├── sourceRuns.ts
    ├── rawListings.ts
    ├── normalizedListings.ts        # Uses upsert_normalized_listing RPC
    ├── vehicleCandidates.ts         # upsertVehicleCandidate()
    ├── duplicateGroups.ts           # linkNormalizedListingToCandidate()
    ├── buyBoxRules.ts               # fetchActiveBuyBoxRules()
    ├── leads.ts                     # upsertLead()
    ├── deadLetter.ts
    ├── filteredOut.ts
    └── retry.ts

test/
├── fixtures/
│   └── facebook.ts                  # makeFacebookItem() + FACEBOOK_FIXTURES
├── dedupe.fingerprint.test.ts
├── stale.scorer.test.ts
├── scoring.deal.test.ts
├── scoring.buybox.test.ts
├── scoring.lead.test.ts
├── ingest.test.ts
├── ingest.int.test.ts
├── facebook.adapter.test.ts
└── ...

supabase/migrations/
├── 0004_normalized_listing_upsert_fn.sql   # Atomic upsert with price change detection
├── 0005_stale_sweep_fn.sql                 # run_stale_sweep() stored proc
└── 0006_buy_box_seed.sql                   # Default buy_box_rules for v1
```

## Migration Steps (run in order in Supabase SQL editor)
1. `0004_normalized_listing_upsert_fn.sql` — creates `tav.upsert_normalized_listing()`
2. `0005_stale_sweep_fn.sql` — creates `tav.run_stale_sweep()`
3. `0006_buy_box_seed.sql` — seeds default buy_box_rules
4. Add cron trigger to `wrangler.toml`, deploy Worker
