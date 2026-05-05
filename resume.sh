#!/usr/bin/env zsh
# resume.sh — launch Claude with full Phase 6 handoff context

SYSTEM_PROMPT=$(cat <<'HANDOFF'
# TAV-AIP Session Resume — Phase 6 Complete

## Where we stopped

Phase 6 (hybrid BuyBox intelligence) is fully implemented and committed at 8246a21.
All 236 tests pass. Working tree is clean.

## What was built in Phase 6

### Schema (migrations 0011-0017 -- NOT yet applied to Supabase)
- 0011: purchase_outcomes expanded (financials, condition grade, channels, import provenance, lead_id nullable)
- 0012: import_batches + import_rows (per-row audit, idempotent re-imports)
- 0013: market_expenses (transport/auction/misc costs by city/region)
- 0014: market_demand_index (region + segment demand score)
- 0015: buy_box_score_attributions (per-lead hybrid score breakdown)
- 0016: v_outcome_summary + v_segment_profit analytic views
- 0017: leads.score_components JSONB column

### Scoring layer
- src/scoring/segment.ts -- avg gross margin pct to 0-100
- src/scoring/demand.ts -- demand index passthrough with clamp
- src/scoring/hybrid.ts -- ruleScore*0.60 + segmentScore*0.25 + demandScore*0.15
- Feature flag: HYBRID_BUYBOX_ENABLED (env var, defaults "false" in wrangler.toml)

### Outcomes module (src/outcomes/)
- conditionGrade.ts -- raw text to excellent/good/fair/poor/unknown
- fingerprint.ts -- SHA-256 import dedup key via Web Crypto
- import.ts -- row parser, discriminated union result, snake_case CSV input

### Persistence (src/persistence/)
- purchaseOutcomes.ts -- upsertPurchaseOutcome (fingerprint dedup), getSegmentAvgMarginPct
- importBatches.ts -- createImportBatch, updateImportBatchCounts, listImportBatches
- importRows.ts -- insertImportRow, bulkInsertImportRows
- marketExpenses.ts -- upsertMarketExpense, getMarketExpensesByRegion
- marketDemandIndex.ts -- upsertMarketDemandIndex, getDemandScoreForRegion
- buyBoxScoreAttributions.ts -- insertBuyBoxScoreAttribution

### Ingest wiring (src/ingest/handleIngest.ts)
- Hybrid scoring lookups are non-blocking (catch, log, fallback 50)
- leads.score_components written on every upsert
- buy_box_score_attributions written non-blocking on lead.created

### Admin routes (src/admin/routes.ts -- all require Authorization: Bearer ADMIN_API_SECRET)
- POST /admin/import-outcomes
- GET  /admin/outcomes/dashboard
- GET  /admin/market/expenses?region=xxx
- PUT  /admin/market/expenses
- GET  /admin/market/demand
- POST /admin/market/demand/recompute
- GET  /admin/buy-box/attributions?lead_id=xxx
- GET  /admin/import-batches

## Before enabling hybrid scoring in production
1. Apply migrations 0011-0017 to Supabase (in order)
2. wrangler secret put ADMIN_API_SECRET
3. Import historical purchase data via POST /admin/import-outcomes
4. Run POST /admin/market/demand/recompute
5. wrangler secret put HYBRID_BUYBOX_ENABLED  (enter: true)

## Known blockers / deferred items
- Manheim YMM search API returns 596 (account not provisioned) -- contact Manheim rep
- NORMALIZER_SECRET reserved for Phase 7 replay endpoint auth
- No RLS policies yet -- deferred to a later phase

## Commit history
8246a21 feat: phase 6 -- hybrid BuyBox intelligence with purchase outcome data
f86e637 chore: add memory.sh -- local Claude session launcher with project context
c54c1c6 chore: post-review fixes -- data integrity, scoring correctness, test coverage
59156a6 feat: phase 5 -- Manheim MMR valuation (VIN path)
7761a4b chore: close phase 4 data integrity gaps before mmr

## What is next (Phase 7 / 8 candidates)
- Phase 7: replay endpoint (POST /replay) -- re-process raw listings through normalize pipeline
  Auth: NORMALIZER_SECRET bearer token
- Phase 8: alerts -- Twilio SMS + webhook on high-grade leads (TWILIO_* + ALERT_WEBHOOK_URL already in Env)
- Dashboard: Next.js frontend with Supabase Auth (not started)
HANDOFF
)

claude --system-prompt "$SYSTEM_PROMPT"
