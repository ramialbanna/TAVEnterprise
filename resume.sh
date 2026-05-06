#!/usr/bin/env zsh
# resume.sh — launch Claude with full Phase 7 handoff context

SYSTEM_PROMPT=$(cat <<'HANDOFF'
# TAV-AIP Session Resume — Phase 7 Complete

## Where we stopped

Phases 1–7 are fully implemented. HEAD is 039d6ba (fix: address phase-7 second-pass review
findings). 262 tests pass. Branch is main, 15 commits ahead of origin/main — not yet pushed.

Three files have uncommitted changes (Phase 7 minor cleanup, safe to commit or continue):
  - src/alerts/alerts.ts
  - test/alerts.test.ts
  - test/ingest.test.ts

## What is live in production

All 21 migrations applied to Supabase. All secrets provisioned on the Cloudflare Worker.
HYBRID_BUYBOX_ENABLED = "true" in all environments.

### Ingest pipeline (POST /ingest, HMAC-signed)
- HMAC auth via WEBHOOK_HMAC_SECRET (x-tav-signature: sha256=<hex>)
- Zod validation (IngestRequestSchema)
- Per-item: Facebook adapter → normalize → dedupe → stale → MMR valuation → hybrid score → upsertLead
- Excellent leads batched and dispatched via execCtx.waitUntil(sendExcellentLeadSummary(...))

### Hybrid scoring
- hybridScore = ruleScore×0.60 + segmentScore×0.25 + demandScore×0.15
- segmentScore from v_segment_profit view (purchase outcome data)
- demandScore from market_demand_index table
- Both are non-blocking with fallback 50

### Alerts (Phase 7)
- src/alerts/alerts.ts -- sendSmsAlert, sendWebhookAlert, sendExcellentLeadSummary
- Twilio SMS + arbitrary webhook URL, parallel via Promise.allSettled
- Non-fatal: either channel can fail without affecting the other or ingest response
- Guard: absent or "replace_me" env vars → no-op (SMS + webhook each guarded independently)
- execCtx.waitUntil ensures alerts fire after HTTP response returns (non-blocking)

### Admin routes (Authorization: Bearer ADMIN_API_SECRET)
- POST /admin/import-outcomes         -- CSV import of historical purchase outcomes
- GET  /admin/outcomes/dashboard
- GET  /admin/market/expenses?region=
- PUT  /admin/market/expenses
- GET  /admin/market/demand
- POST /admin/market/demand/recompute  -- recompute demand scores from purchase_outcomes
- GET  /admin/buy-box/attributions?lead_id=
- GET  /admin/import-batches

### Stale sweep
- Daily cron at 06:00 UTC, calls tav.run_stale_sweep()

### Manheim MMR
- VIN path provisioned; YMM path returns 596 (account not provisioned — contact Manheim rep)
- Valuation cached in KV; null on failure, ingest continues

## Uncommitted changes detail

src/alerts/alerts.ts     -- minor cleanup (console.error → structured log pattern)
test/alerts.test.ts      -- test coverage additions / regex fix
test/ingest.test.ts      -- waitUntil assertion for excellent lead ingest

Run `git diff` to see exact state before continuing.

## First thing to do next session

1. Review the 3 uncommitted files (git diff)
2. Run npm test to confirm 262 tests still pass
3. Commit the cleanup: "chore: finalize phase-7 test and alert cleanup"
4. Push: git push origin main
5. Begin Phase 8: replay endpoint (POST /replay, auth via NORMALIZER_SECRET bearer token)

## Phase roadmap

Phase 1  DONE  Ingest, Facebook adapter, normalize, Supabase persistence
Phase 2  DONE  Dedupe fingerprinting, stale sweep cron
Phase 3  DONE  Buy-box rule scoring, lead grading
Phase 4  DONE  Data integrity, HMAC auth, retry layer
Phase 5  DONE  Manheim MMR valuation (VIN + YMM)
Phase 6  DONE  Hybrid buy-box: purchase outcome import, market data, demand index
Phase 7  DONE  Excellent lead alerts via Twilio SMS + webhook
Phase 8  NEXT  Replay endpoint POST /replay — re-process raw listings through normalize pipeline
               Auth: NORMALIZER_SECRET bearer token
Phase 9  --    Twilio inbound webhook (buyer reply handling)
Phase -- --    Next.js dashboard with Supabase Auth

## Top open items (docs/followups.md — ~27 items total)

High priority:
- Consolidate ParsedOutcomeRow: declared in src/outcomes/import.ts AND src/types/domain.ts
- Pick one source of truth for ConditionGradeNormalized (conditionGrade.ts vs domain.ts)
- Migration 0022: add NOT NULL to purchase_outcomes.import_fingerprint
- Promote supabase/repair-functions.sql to migration 0022 or delete
- Replace N+1 per-region SELECT in /recompute with single GROUP BY aggregate
- Clamp ?limit to max 100 on GET /admin/import-batches
- Add Zod schema for PUT /admin/market/expenses (currently uses manual `as` casts)

Lower priority / config:
- Add preview_id to [[env.staging.kv_namespaces]] in wrangler.toml
- Evaluate top-level KV namespace pointing to production ID (wrangler dev contamination risk)
- Log catch-path failures in sendSmsAlert / sendWebhookAlert (network timeout / AbortError)

## Key architectural rules (never violate)

- Four concepts: Raw Listing → Normalized Listing → Vehicle Candidate → Lead. Never collapse.
- Facebook listings rarely have VIN. Never assume VIN. YMM + mileage is the valuation path.
- Every rejection has a reason_code. Silent drops are forbidden.
- Service role key lives only in the Cloudflare Worker. Never echoed, never logged.
- withRetry wraps all Supabase writes. Non-retryable Postgres codes: 23505, 23514, 23502, 23503, 42501.
- Stale-detection regressions are blockers.

## Commit history (most recent first)

039d6ba fix: address phase-7 second-pass review findings
72b3be8 fix: address phase-7 review findings — waitUntil, locale, wiring test
bff5c35 chore: mark two completed follow-ups done; add 2 new items from final review
95b6b23 fix: log HTTP status when !res.ok in sendSmsAlert and sendWebhookAlert
d4c845d fix: wrap primary upsert in upsertPurchaseOutcome with withRetry
e58a643 feat: phase 7 — excellent lead alerts via Twilio SMS + webhook
b1d7d91 fix: include pricePaid in import fingerprint; use empty-string sentinels
9fbcf33 fix: withRetry + per-region error boundary in demand recompute loop
5ae4940 fix: strip currency/comma formatting in getNumber before Number() parse
f009b74 fix: add closerId, cotCity, cotState to PurchaseOutcome interface
HANDOFF
)

claude --system-prompt "$SYSTEM_PROMPT"
