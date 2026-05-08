# Phase 8 Architecture Pivot — Phase A Audit

**Branch:** `phase-8-architecture-pivot` (created off `main` at `28c7e67`)
**Status:** Read-only audit. No code edits in this phase.
**Date:** 2026-05-07

---

## 1. Inventory — current code surface

### Buy-box scoring (`src/scoring/`)

| File | LOC | Role |
|---|---|---|
| `buyBox.ts` | 61 | Hard-gate rule match + soft 0–100 score (price-vs-MMR + mileage headroom) |
| `hybrid.ts` | 18 | Blends `ruleScore × 0.60 + segmentProfitScore × 0.25 + regionDemandScore × 0.15` |
| `lead.ts` | 60 | **Final score** — `deal 35 / buyBox 25 / freshness 20 / region 10 / sourceConf 10` *(IMMUTABLE per pivot)* |
| `deal.ts` | — | Deal score (price vs MMR) |
| `segment.ts` | 14 | Segment profit score from `purchase_outcomes.avg_gross_margin_pct` |
| `demand.ts` | 9 | Pass-through of `market_demand_index.demand_score` |
| `reasonCodes.ts` | **MISSING** | Pivot mandates this file — currently no centralized module |

### Manheim/MMR (`src/valuation/`, `src/persistence/`)

| File | LOC | Role |
|---|---|---|
| `valuation/mmr.ts` | 200 | OAuth + token cache + VIN-first lookup + YMM fallback + KV-cached MMR |
| `persistence/valuationSnapshots.ts` | 38 | Writes per-lead MMR snapshot |
| `types/env.ts:17–22` | — | 6 `MANHEIM_*` env vars (CLIENT_ID, CLIENT_SECRET, USERNAME, PASSWORD, TOKEN_URL, MMR_URL) already defined |
| `wrangler.toml:9` | — | `TAV_KV` namespace already provisioned for cache |

### Persistence layer (`src/persistence/`, 19 modules)

`buyBoxRules`, `buyBoxScoreAttributions`, `deadLetter`, `duplicateGroups`, `filteredOut`, `importBatches`, `importRows`, `leads`, `marketDemandIndex`, `marketExpenses`, `normalizedListings`, `purchaseOutcomes`, `rawListings`, `retry`, `schemaDrift`, `sourceRuns`, `supabase`, `valuationSnapshots`, `vehicleCandidates`

### Scoring attribution

| File | Role |
|---|---|
| `persistence/buyBoxScoreAttributions.ts` | Writes per-lead attribution (rule + segment + demand + hybrid) |
| Migration `0015` | Created the table |
| Migration `0017` | Added `score_components` jsonb on `leads` |

### Zod schemas (`src/validate.ts`)

`SOURCE_NAMES` const, `IngestRequestSchema`, `IngestRequest` type. **That's it on this branch.**

> **Note:** Phase 1 sales work added `SalesRowSchema` + `SalesIngestRequestSchema` on `feat/market-velocities`. Those are NOT in this branch's history.

### Reason codes (currently scattered)

Inline `reason_code` string literals found in source (sample, not exhaustive):

```
"batch_timeout", "filtered_out_write_failed", "normalized_upsert_failed",
"raw_insert_failed", "twilio_http_error", "valuation_snapshot_failed",
"webhook_http_error"
```

Three rejection write paths use them:
- `persistence/deadLetter.ts`
- `persistence/filteredOut.ts`
- `persistence/schemaDrift.ts`

Plus references in `ingest/handleIngest.ts`. **No central registry.**

### Worker config (`wrangler.toml`)

Single Worker today: `tav-aip` (main = `src/index.ts`). KV: `TAV_KV` (prod + staging namespaces). Cron: daily 06:00 UTC stale sweep. Vars: `HYBRID_BUYBOX_ENABLED=true`. **No sibling Worker exists.**

---

## 2. Migrations relevant to the pivot

### Buy-box

| # | File | Effect |
|---|---|---|
| 0001 | initial_schema | core tables |
| 0006 | buy_box_seed | seed data for `buy_box_rules` |
| 0015 | buy_box_score_attributions | attribution table |
| 0017 | leads_score_components | `leads.score_components` jsonb |

### Historical sales / market velocity / outcomes

| # | File | Effect |
|---|---|---|
| 0011 | purchase_outcomes_expanded | added 15+ columns |
| 0013 | market_expenses | regional fixed/variable expense table |
| 0014 | market_demand_index | per-region demand score |
| 0018 | buyer_closer_text | `buyer_id` + `closer_id` text columns |
| 0019 | purchase_outcomes_cot_location | added `cot_city` / `cot_state` |
| 0020 | purchase_outcomes_fingerprint_constraint | unique on import_fingerprint |
| 0021 | fix_upsert_constraints | replaced functional unique indexes with plain |
| **0022** | **add_tav_historical_sales** | **CONFLICT — see §3** |
| **0023** | **add_tav_market_velocities** | **CONFLICT — see §3** |

### Manheim/MMR

| # | File | Effect |
|---|---|---|
| 0008 | valuation_snapshots | per-lead MMR snapshot table |
| 0009 | reconcile_valuation_snapshots | follow-up fixes |

---

## 3. Critical conflicts with the pivot spec

### 3a. Migration 0022 schema ≠ new `tav_historical_sales` spec

| What we built (0022, on `main`) | What the pivot wants |
|---|---|
| `import_run_id`, `row_offset` natural key | `row_hash` natural key |
| `buyer_id` (text catch-all) | `buyer` + `buyer_user_id` (split) |
| `purchase_price`, `purchase_date` | `acquisition_cost`, `acquisition_date` |
| `mileage`, `days_in_inventory`, `source_location`, `closer_id`, `row_status`, `rejection_reason`, `raw_row` | (none of these in new spec) |
| (no P&L breakdown) | `transport_cost`, `recon_cost`, `auction_fees`, `gross_profit` |
| (no batch FK) | `upload_batch_id` (FK to new `tav_sales_upload_batches`) |
| `source_file_name` absent | `source_file_name` text |

### 3b. Migration 0023 schema ≠ new `tav_market_velocities` spec

| What we built (0023, on `main`) | What the pivot wants |
|---|---|
| Natural key `(make, model, trim, region)` | `segment_key` unique (encoded composite) |
| `velocity_score`, `sample_count`, `avg_days_to_sell`, `baseline_days`, `computed_at`, `valid_until` | `sales_count_7d/30d/90d`, `avg_gross_profit_30d`, `avg_turn_time_30d`, `velocity_score`, `time_decay_multiplier`, `calculated_at`, `components jsonb` |
| `year` absent | `year` nullable |

### 3c. Tables the pivot requires that don't exist

- `tav_mmr_queries` — every MMR lookup logged with user identity
- `tav_mmr_cache` — Postgres-side cache (currently KV-only)
- `tav_user_activity` — presence + query history
- `tav_sales_upload_batches` — distinct from generic `tav.import_batches`

### 3d. Architectural artifacts

- **No `tav-intelligence-worker`** — no sibling Worker scaffold; pivot requires one with its own `wrangler.toml`, routes, KV bindings, and secrets.
- **No `reasonCodes.ts`** — pivot mandates centralization; currently 7+ inline string literals scattered across `src/`.
- **No mileage-inference helper** — `getMmrMileageData(year, miles)` does not exist; `valuation/mmr.ts` passes raw `mileage` (often null) directly to Manheim.
- **No KV-lock / single-flight** — concurrent identical MMR requests today would each fire separate Manheim calls (token cache exists, but per-VIN stampede prevention does not).

### 3e. Phase 1 sales endpoint (on `feat/market-velocities`, NOT on this branch)

Commit `931dfa2` shipped `POST /api/sales/ingest` against the old `historical_sales` schema (0022). It uses `import_batches` (generic) for batch tracking and `(import_run_id, row_offset)` for dedup. Under the pivot it must either:
- Be discarded entirely (Phase 1 doesn't survive — re-do under new spec on the intelligence Worker), or
- Be ported forward field-by-field with `row_hash` dedup + `tav_sales_upload_batches` batch table.

---

## 4. What this branch needs to decide before Phase B

### Q1 — Disposition of migrations 0022 & 0023 (already on `main`)

The migrations have not been applied to production Supabase yet. Three resolution paths:

**Option A — `git revert 28c7e67` on this branch.** Cleanest history for the new branch; `main` retains the broken migrations until merged back. Pros: branch starts schema-clean. Cons: divergence from `main`.

**Option B — Add migration 0024 to `DROP TABLE … CASCADE` and recreate.** Forward-only migration discipline. Pros: monotonic history; works in any environment that may have already applied 0022/0023. Cons: 0022/0023 remain as no-op wrong-shape history.

**Option C — `git reset` `main` back to `1b7365b` (origin/main).** Erases the migration commits entirely. Pros: cleanest history globally. Cons: requires force-pushing `main` later — should not be done lightly.

**Recommendation: Option A** for this branch. Production Supabase has not run 0022/0023, so reverting is non-destructive. `main`'s broken migrations get cleaned up when this pivot branch merges and supersedes them.

### Q2 — Phase 1 sales endpoint on `feat/market-velocities`

It's locally committed (`931dfa2`), not pushed. Three options:

**Option A — Discard.** `git branch -D feat/market-velocities` after the pivot lands. Cleanest; the work guided design but won't ship.

**Option B — Cherry-pick later.** Keep the branch around. After pivot Phase H (sales upload), cherry-pick the Zod schema patterns + persistence shape, rewrite for new schema.

**Option C — Leave alone.** Branch stays orphaned in the repo as a reference.

**Recommendation: Option B.** The Zod boundary-validation pattern, env-typing, and test layout are reusable. Branch stays as a reference until new sales endpoint ships, then delete.

### Q3 — New `tav-intelligence-worker` location

Pivot mandates a sibling Worker. Options:

**Option A — Monorepo sibling: `/workers/tav-intelligence-worker/`** with its own `wrangler.toml`, `src/`, `tests/`. Existing main Worker moves to `/workers/tav-aip/` or stays at root. Shared types via `/packages/shared-types/` or relative imports.

**Option B — Sibling Cloudflare Worker, separate repo.** Cleaner deploy pipelines but harder cross-cutting type sharing.

**Option C — Keep it in this repo at the top level: `/intelligence/`** sibling to `/src/`. Two `wrangler.toml` files. Minimal restructure.

**Recommendation: Option C** for v1. Lowest disruption to existing CI / GitHub Actions. Promote to monorepo (Option A) only if the codebases meaningfully diverge.

### Q4 — Portal auth model (affects Phase D Zod schemas + every persistence write)

The MMR Portal logs `requested_by_user_id`, `requested_by_email` etc on every query. The auth source determines what types these fields are.

**Options:**
- **Cloudflare Access SSO** (Google Workspace federation) → user identity in headers, Worker reads `Cf-Access-Authenticated-User-Email`. Simplest, no session code needed.
- **Supabase Auth** → JWT-based, requires session handling in the Worker.
- **Custom JWT signed by an admin token endpoint** → most code, most flexibility.

**Recommendation: Cloudflare Access** for internal users. Already integrated with Workers via headers; matches "100+ TAV users" with Workspace accounts.

### Q5 — KV-only MMR cache vs. dual KV + Postgres `tav_mmr_cache`

The pivot spec creates `tav_mmr_cache` table, but current implementation uses `TAV_KV` for the same purpose. Why both?

- **KV** = ms-latency cache for hot reads from the Worker
- **Postgres `tav_mmr_cache`** = queryable history (joinable to `tav_mmr_queries`, surveyable in dashboards, replayable on cache flush)

**Recommendation: Both, with KV authoritative for reads.** Worker writes to both on Manheim hit (KV first for speed, Postgres async/best-effort). Postgres serves analytics + cold start; KV serves the hot path.

---

## 5. What I am NOT doing in Phase A

- Not editing any source file.
- Not writing any migration.
- Not running `wrangler` or any deploy command.
- Not pushing branches to GitHub.
- Not modifying `feat/market-velocities` (Phase 1 work preserved).
- Not creating `reasonCodes.ts` yet.
- Not touching `valuation/mmr.ts`.

---

## 6. Recommended next phase order (proposal — awaiting your approval)

Per the directive's PHASE B–K. Suggested sequencing:

1. **Phase B — Housekeeping** (rename buybox→buyBox is already done on `main`; verify; re-run lint/typecheck/test on this branch)
2. **Phase C — Migrations** (after Q1 resolved)
   - 0024 `tav_sales_upload_batches`
   - 0025 redo `tav_historical_sales` (per Q1 resolution)
   - 0026 redo `tav_market_velocities`
   - 0027 `tav_mmr_queries`
   - 0028 `tav_mmr_cache`
   - 0029 `tav_user_activity`
3. **Phase D — Zod schemas** in `src/types/intelligence.ts` (or sibling worker location)
4. **Phase E — Mileage inference helper** + tests (pure function, easy win)
5. **Phase F — `tav-intelligence-worker` scaffold** (per Q3 location decision)
6. **Phase G — Manheim client** (port `src/valuation/mmr.ts` into intelligence Worker)
7. **Phase H — Sales upload + market velocity calculation**
8. **Phase I — Main Worker integration** (4th hybrid input + attribution updates)
9. **Phase J — Tests** (roll up across phases)
10. **Phase K — Portal architecture doc** (`docs/PORTAL_ARCHITECTURE.md`) — UI deferred

---

## 7. Halt point

Per directive: **"Stop after Phase A audit and ask for approval before writing migrations."**

Awaiting Rami's decisions on Q1–Q5 above before proceeding to Phase B.
