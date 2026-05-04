# NEXT SESSION START POINT — TAV Platform

## Where We Are
Scale foundation complete. Pipeline runs end-to-end:
Apify → Cloudflare Worker → raw_listings → normalized_listings → vehicle_candidates → leads

## What Is Done (This Session)
- [x] Canonical vehicle schema (TS types + SQL)
- [x] Validation + rejection logic (adapter-level + reason_codes)
- [x] Deduplication system (identity_key fingerprinting, vehicle_candidates, duplicate_groups)
- [x] Raw payload storage (raw_listings table, always written first)
- [x] Structured logging (src/logging/logger.ts — log, logError, error categories)
- [x] Atomic normalized listing upsert (migration 0004 — tracks price changes, scrape_count)
- [x] Freshness scoring + stale detection (src/stale/scorer.ts + daily cron via migration 0005)
- [x] Buy-box rule matching (src/scoring/buybox.ts + 3 default rules via migration 0006)
- [x] Lead creation pipeline (src/persistence/leads.ts — grade != pass → upsert lead)
- [x] Deal scoring, final scoring, grade calculation
- [x] 135 unit tests passing
- [x] Pushed to github.com/ramialbanna/TAVEnterprise

## Migrations Still Needed in Supabase SQL Editor
Run in this order:
1. supabase/migrations/0004_normalized_listing_upsert_fn.sql
2. supabase/migrations/0005_stale_sweep_fn.sql
3. supabase/migrations/0006_buy_box_seed.sql

## Next Tasks (Priority Order)

### Phase 5 — Valuation (Manheim MMR)
- Wire MANHEIM_* env vars into src/valuation/mmr.ts
- Fetch MMR by VIN (high confidence) or YMM+mileage bucket (medium confidence)
- Write result to valuation_snapshots table
- Feed mmrValue into computeDealScore() — currently returns 0 without MMR
- Add MMR cache in Cloudflare KV (TTL: 24h per VIN, 6h per YMM bucket)

### Phase 6 — Replay Endpoint
- POST /replay?run_id=<id> — re-normalizes raw_listings without re-scraping
- Auth via NORMALIZER_SECRET header
- Useful after adapter improvements or bug fixes
- Already reserved in src/types/env.ts

### Phase 7 — Zero-Result Alerting
- Alert when a source_run completes with 0 processed items
- Alert when freshness_status='stale_confirmed' > threshold for a region
- Delivery: ALERT_WEBHOOK_URL (already in env) or Twilio SMS (already in env)

### Phase 8 — Multi-Source Adapters
- src/sources/craigslist.ts
- src/sources/autotrader.ts
- src/sources/cars_com.ts
- src/sources/offerup.ts
- Each returns AdapterResult (same contract as facebook.ts)
- Wire into handleIngest.ts source dispatch

## Important IDs / Config (fill in)
APIFY:
- actorTaskId:
- datasetId:
- webhook:

SUPABASE:
- URL: (in .dev.vars)
- schema: tav
- project: (Supabase dashboard)

WORKERS:
- ingest endpoint: POST /ingest (running on Cloudflare)
- cron: daily 06:00 UTC → tav.run_stale_sweep()

## Notes
- Apify is the current scraping layer — system is source-agnostic by design
- MMR is the biggest data quality gap right now (deal scores are all 0 without it)
- Buy-box rules are seeded but may need tuning once real MMR data flows
- Facebook VIN is always absent — YMM path is the norm, not the exception

## First Command Next Session
"Run migrations 0004, 0005, 0006 in Supabase, then start Phase 5 — Manheim MMR integration."
