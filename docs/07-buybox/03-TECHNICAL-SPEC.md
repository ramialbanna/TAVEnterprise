# MaxBuy — Technical Specification

**What this is / who it's for:** The engineering contract for MaxBuy: database schema extensions to the `tav` schema, the versioned serving API request/response shape, the decision-replay mechanism, and the promotion/governance + hard-gate mechanics. Concrete enough to implement against. Audience: the solo dev (implementer + data-modeler) and reviewers. Companion docs: [`00-LEADERSHIP-BRIEF.md`](00-LEADERSHIP-BRIEF.md) · [`01-CHARTER.md`](01-CHARTER.md) · [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) · [`04-RISK-REGISTER.md`](04-RISK-REGISTER.md) · [`05-PUNCH-LIST.md`](05-PUNCH-LIST.md).

**Date:** 2026-05-20 · **Status:** Pre-code · **Repo prefix:** `TAV-BB`

> **Conventions** (matching the existing TAV-AIP data model): all tables additive, under the `tav` schema; `gen_random_uuid()` for PKs; `timestamptz NOT NULL DEFAULT now()`; `smallint` for model year. This supersedes the standalone `buybox_*` / `uuid_generate_v4()` / Redis DDL in the master spec — that script predates the platform-reuse decision. All DDL below is a **design contract**, not a migration; real migrations cite the items they implement.

---

## 1. Database schema

### 1.1 Extend `tav.purchase_outcomes` (item 6 / R17)

Unit-economics + anti-survivorship fields. Each is tagged with its expected availability per the item-6 audit (**backfillable** = present in 18-mo history; **future-only** = capture starts now; **unavailable** = audit-pending). Run the null-rate audit ([`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) §5) before training; define NULL handling per field.

```sql
ALTER TABLE tav.purchase_outcomes
  ADD COLUMN sale_price             numeric  CHECK (sale_price >= 0),          -- backfillable
  ADD COLUMN expenses_total         numeric  CHECK (expenses_total >= 0),      -- backfillable
  ADD COLUMN transport_cost         numeric  CHECK (transport_cost >= 0),      -- backfillable
  ADD COLUMN net_gross              numeric,                                   -- backfillable (derivable)
  ADD COLUMN purchase_city          text,                                      -- backfillable
  ADD COLUMN purchase_state         text,                                      -- backfillable
  ADD COLUMN purchase_location_type text  CHECK (purchase_location_type IN ('city','region','manheim')), -- backfillable
  ADD COLUMN manheim_location       text,                                      -- backfillable
  ADD COLUMN sale_channel           text  CHECK (sale_channel IN ('in_lane','ove','simulcast','digital','other')), -- future-only (audit)
  ADD COLUMN days_to_sale           int   CHECK (days_to_sale >= 0),           -- backfillable
  ADD COLUMN outcome                text  CHECK (outcome IN ('sold','no_sale','loss','in_stock')) DEFAULT 'sold', -- future-only (TAV ~97% clear; backfill low-priority per CHARTER §7)
  ADD COLUMN cr_grade               numeric CHECK (cr_grade >= 0),             -- unavailable / future-only (audit)
  ADD COLUMN mileage_at_sale        int   CHECK (mileage_at_sale >= 0),        -- backfillable
  ADD COLUMN mileage_band           text,                                      -- derived
  ADD COLUMN buyer_user_id          text,                                      -- future-only (R17: avoid attributing buyer skill to segment)
  ADD COLUMN acquisition_source     text,                                      -- future-only (R17: dealer_trade|auction|repo|private|ove|in_lane)
  ADD COLUMN announcement_flags     jsonb,                                     -- future-only (title/arbitration/structural announcements)
  ADD COLUMN expense_breakdown      jsonb;                                     -- backfillable-partial (recon|fees|arbitration|other)
```

### 1.2 Benchmark views + segment key (item 7, 13)

```text
v_maxbuy_pricing_benchmarks   -- weighted-median sale_pct_mmr + net_gross by segment
v_maxbuy_transport_benchmarks -- transport: city → region → manheim → global fallback
v_maxbuy_expense_benchmarks   -- expenses: YMM-trim → YMM → make/model → global fallback
v_maxbuy_net_benchmarks       -- expected net gross by segment
v_maxbuy_market_index         -- weekly wholesale level/drift (public Manheim Index first, per CHARTER §7)
```
Segment key = `year / make / model / trim / region / mileage_band`, carrying VIN-match-vs-YMM and effective-N. Every rebuild is stamped with a `benchmark_version`; old outputs are preserved for replay ([`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) §4.3).

### 1.3 Policy table (item 1 / CHARTER DEC-1)

Target net gross starts as one company-wide v1 policy: **$800 per unit**, confirmed by ownership in CHARTER DEC-1. Store it as a versioned global policy row so future segment/source/price-band targets can be introduced without changing the recommendation contract.

```sql
CREATE TABLE tav.maxbuy_policy (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version     text NOT NULL,
  scope              text NOT NULL CHECK (scope IN ('global','segment','source','price_band')),
  scope_key          text,                          -- null for global
  target_net_gross   numeric CHECK (target_net_gross >= 0),  -- v1 global default: 800
  effective_from     timestamptz NOT NULL DEFAULT now(),
  effective_to       timestamptz,                   -- null = current
  changed_by_user_id text NOT NULL,                 -- who can change = DEC-1
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_maxbuy_policy_current
  ON tav.maxbuy_policy (scope, coalesce(scope_key,'')) WHERE effective_to IS NULL;
```

### 1.4 Lookups + immutable recommendation snapshot (items 3, 13, 14)

`maxbuy_lookups` captures user intent (purgeable after 90 days). `maxbuy_recommendations` is the **immutable replay snapshot** (kept indefinitely). The recommendation row is the heart of decision replay (§3) — it pins every versioned input.

```sql
CREATE TABLE tav.maxbuy_lookups (              -- detail; purge after 90d (ARCH §4.4)
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            text NOT NULL,
  vin                text NOT NULL CHECK (length(vin) = 17),
  mileage            int CHECK (mileage >= 0),
  is_estimated_miles boolean NOT NULL DEFAULT false,   -- 15k/yr fallback, badged (CHARTER §7)
  asking_price       numeric CHECK (asking_price >= 0), -- present ⇒ deal-fit state (§2)
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_maxbuy_lookups_vin        ON tav.maxbuy_lookups (vin);
CREATE INDEX idx_maxbuy_lookups_created_at ON tav.maxbuy_lookups (created_at DESC);

CREATE TABLE tav.maxbuy_recommendations (    -- IMMUTABLE snapshot; keep indefinitely
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_id             uuid NOT NULL REFERENCES tav.maxbuy_lookups(id) ON DELETE RESTRICT,

  -- outputs
  expected_sale_price   numeric NOT NULL CHECK (expected_sale_price >= 0),
  expected_net_gross    numeric NOT NULL,
  recommended_max_buy   numeric NOT NULL CHECK (recommended_max_buy >= 0),
  verdict               text NOT NULL CHECK (verdict IN ('STRONG_BUY','BUY','REVIEW','PASS')),
  data_strength         text NOT NULL,            -- label, NOT a probability (CHARTER §4)
  reason_codes          text[] NOT NULL,
  estimated_badges      text[] NOT NULL DEFAULT '{}',

  -- ===== REPLAY PINS (item 3) — every input needed to reconstruct the decision =====
  valuation_snapshot_id uuid REFERENCES tav.valuation_snapshots(id),  -- immutable MMR snapshot ref
  benchmark_version     text NOT NULL,            -- item 13
  feature_view_version  text NOT NULL,            -- item 13
  feature_vector        jsonb NOT NULL,           -- exact features used
  policy_version        text NOT NULL,            -- maxbuy_policy version applied
  scoring_version       text NOT NULL,            -- policy/scoring code version
  model_artifact_hash   text,                     -- null in v1 (Option A); set in v2+ (ARCH §3)
  worker_version        text NOT NULL,
  intelligence_worker_contract_version text NOT NULL,  -- item 12 / R9

  -- ===== MMR provenance (R1) — normalized, contract-allowed fields ONLY (R18) =====
  mmr_value             numeric CHECK (mmr_value >= 0),
  mmr_method            text CHECK (mmr_method IN ('vin','ymm')),    -- VIN-vs-YMM path
  mmr_source            text,
  mmr_cache_age_seconds int,
  mmr_missing_reason    text,                      -- set when MMR unavailable
  mmr_observed_at       timestamptz,

  historical_comp_ids   uuid[] NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_maxbuy_rec_lookup   ON tav.maxbuy_recommendations (lookup_id);
CREATE INDEX idx_maxbuy_rec_verdict  ON tav.maxbuy_recommendations (verdict);
CREATE INDEX idx_maxbuy_rec_created  ON tav.maxbuy_recommendations (created_at DESC);
```

**Immutability:** no `UPDATE`/`DELETE` granted on `maxbuy_recommendations` in app roles; corrections are new rows. `ON DELETE RESTRICT` prevents a purged lookup from orphaning a snapshot.

### 1.5 Evaluated-but-not-bought logging (item 8 / R4)

Begins day one to seed future pass-on / counterfactual learning, even though v1/v2 are bought-unit models (CHARTER §6).

```sql
CREATE TABLE tav.maxbuy_evaluated_passes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vin               text NOT NULL CHECK (length(vin) = 17),
  recommendation_id uuid REFERENCES tav.maxbuy_recommendations(id),
  asking_price      numeric CHECK (asking_price >= 0),
  bid_price         numeric CHECK (bid_price >= 0),
  mmr_value         numeric CHECK (mmr_value >= 0),
  buyer_user_id     text NOT NULL,
  pass_reason       text NOT NULL,                     -- structured (see §2 override reasons)
  created_at        timestamptz NOT NULL DEFAULT now()
);
```

### 1.6 Override capture (item 15 / R10)

One-click structured capture at the decision moment — never free-text-only.

```sql
CREATE TABLE tav.maxbuy_overrides (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES tav.maxbuy_recommendations(id),
  buyer_user_id     text NOT NULL,
  override_type     text NOT NULL CHECK (override_type IN (
                      'bought_despite_pass','passed_despite_buy','bid_reduced',
                      'title_condition_concern','transport_concern','manager_call',
                      'inventory_need','other')),
  override_note     text,                          -- optional free text IN ADDITION to the code
  acted_price       numeric CHECK (acted_price >= 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_maxbuy_overrides_rec  ON tav.maxbuy_overrides (recommendation_id);
CREATE INDEX idx_maxbuy_overrides_type ON tav.maxbuy_overrides (override_type);
```

### 1.7 Model registry + pipeline run log + backtests (items 2, 11)

```sql
CREATE TABLE tav.maxbuy_models (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version       text NOT NULL UNIQUE,            -- e.g. v2_gbm_2026w21
  artifact_hash       text NOT NULL,
  trained_at          timestamptz NOT NULL,
  status              text NOT NULL CHECK (status IN ('shadow','production','retired')),
  metrics             jsonb NOT NULL,                  -- holdout MAE, gross-hit loss, per-segment
  approved_by_user_id text,                            -- required for production (item 2)
  approved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tav.maxbuy_pipeline_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at           timestamptz NOT NULL DEFAULT now(),
  finished_at          timestamptz,
  status               text NOT NULL CHECK (status IN ('running','succeeded','failed','skipped')),
  rows_ingested        int,
  benchmark_version    text,
  feature_view_version text,
  model_version        text REFERENCES tav.maxbuy_models(model_version),
  promotion_decision   text CHECK (promotion_decision IN ('promoted','held','n/a')),
  error                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tav.maxbuy_backtests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version   text NOT NULL REFERENCES tav.maxbuy_models(model_version),
  sale_week       date NOT NULL,
  segment_key     text,                            -- null = global
  sample_n        int NOT NULL,
  sale_price_mae  numeric,
  gross_hit_loss  numeric,
  backtested_at   timestamptz NOT NULL DEFAULT now()
);
```

## 2. Serving API / contract

**Versioned** request/response (item 12). Carry `contract_version`; bump on any breaking change. The Worker also pins `intelligence_worker_contract_version` for the MMR dependency (R9).

MarketCheck is not part of the required v1 response contract until the enrichment spike closes. If enabled later, MarketCheck-derived fields must be grouped under explicit enrichment/provenance keys, must not overwrite MMR or TAV benchmark outputs, and must be omitted or marked unavailable when the provider fails.

### Request
```http
POST /maxbuy/evaluate
```
```json
{
  "contract_version": "1.0.0",
  "vin": "1FTFW1ET5DFA12345",
  "mileage": 84210,
  "asking_price": 17250
}
```
- `vin` required, 17 chars, ISO-3779 checksum.
- `mileage` optional → if absent, server estimates `(current_year − model_year) × 15000` and sets `is_estimated_miles`, returning a visible `ESTIMATED_MILES` badge (CHARTER §7).
- `asking_price` optional → presence flips the response into deal-fit (item 16, below).

### Response
```json
{
  "contract_version": "1.0.0",
  "recommendation_id": "uuid",
  "vehicle": { "vin": "...", "year": 2013, "make": "Ford", "model": "F-150",
               "trim": "XLT", "mileage": 84210, "mileage_estimated": false },
  "mmr": { "value": 18000, "method": "vin", "source": "manheim",
           "cache_age_seconds": 1420, "missing_reason": null, "observed_at": "..." },
  "tav_historical": { "n_units": 37, "avg_buy": 15100, "avg_sale": 18180,
                      "avg_gross": 1980, "avg_recon": 640, "avg_days_to_sale": 8,
                      "outcome_distribution": {"sold": 36, "no_sale": 1} },
  "economics": { "expected_sale_price": 18180, "expected_transport": 450,
                 "expected_expenses": 700, "expected_net_gross": 1530 },
  "verdict": {
    "display_state": "deal_fit",                 // "vehicle_fit" | "deal_fit" (item 16)
    "verdict": "BUY",                            // null in vehicle_fit
    "recommended_max_buy": 15530,
    "delta_to_ask": -1720,                       // recommended_max_buy − asking_price; null if no ask
    "data_strength": "high",                     // label, never a % (CHARTER §4 / item 4)
    "reason_codes": ["segment_clears_above_mmr","recent_comps_strong"],
    "estimated_badges": [],
    "hard_gate_triggered": null                  // see §5
  },
  "versions": { "benchmark_version": "...", "feature_view_version": "...",
                "policy_version": "...", "scoring_version": "...",
                "model_artifact_hash": null }    // null in v1 Option A
}
```

### Two-state display logic (item 16 / R13)
- **Asking price PRESENT → `deal_fit`:** show vehicle fit **and** deal fit together in one result — `recommended_max_buy`, `delta_to_ask`, and a Strong Buy / Buy / Review / Pass verdict. No mode toggle under auction pressure. (Owner framing: TAV looks for opportunities, not vehicles — CHARTER §7.)
- **Asking price ABSENT → `vehicle_fit`:** return the ceiling (`recommended_max_buy`) and a **vehicle-only** badge; `verdict` is null and the UI must **not** imply a final buy decision against an ask that doesn't exist.

### Confidence vs data-strength (item 4 / CHARTER §4)
`data_strength` is an enum label (`low`/`medium`/`high`) derived from effective sample size · recency · VIN-vs-YMM · segment variance. It is **never** rendered as a probability percentage in v1. Low data-strength may still return useful economics, but it caps the verdict at `REVIEW` and cannot produce `BUY` or `STRONG_BUY`. This is distinct from a hard gate (§5).

### Verdict conflict resolution (R14)
When targets disagree (e.g. strong gross but slow predicted turn), apply a fixed priority: a hard gate (§5) always wins; then low data-strength caps the verdict at `REVIEW`; then `delta_to_ask` and expected net gross set the buy band. No `STRONG_BUY` when predicted turn exceeds the segment threshold unless net premium offsets it.

## 3. Decision replay

**Goal:** months later, reconstruct *exactly what MaxBuy knew* for any past recommendation, with no archaeology (R2 — a BLOCKER if missing).

**What is pinned** (all on `maxbuy_recommendations`, §1.4): `valuation_snapshot_id` (immutable MMR snapshot), `benchmark_version` + `feature_view_version`, the exact `feature_vector` jsonb, `policy_version` + `scoring_version`, `model_artifact_hash`, `worker_version`, `intelligence_worker_contract_version`, and full MMR provenance (method, source, cache age, missing reason, VIN-vs-YMM, timestamp).

**Immutability guarantees:** the snapshot row is append-only (no app-role UPDATE/DELETE); benchmark/feature-view outputs for a given version are preserved, never rebuilt in place ([`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) §4.3); the MMR snapshot is referenced by immutable ID, not re-fetched. Detailed lookup rows may be purged at 90 days, but the snapshot survives ([`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) §4.4).

**Replay query sketch** — recompute the verdict from pinned inputs and diff against what was served:
```sql
SELECT r.id, r.verdict, r.recommended_max_buy,
       r.feature_vector, r.policy_version, r.scoring_version,
       r.benchmark_version, r.model_artifact_hash,
       vs.mmr_payload_normalized            -- contract-allowed fields only (R18)
FROM tav.maxbuy_recommendations r
LEFT JOIN tav.valuation_snapshots vs ON vs.id = r.valuation_snapshot_id
WHERE r.id = $1;
-- Feed feature_vector + policy_version + benchmark_version (and artifact at model_artifact_hash)
-- into the pinned scoring_version of the engine → output must equal the stored verdict/max_buy.
```
A replay that does not reproduce the stored outputs is a defect (CHARTER AC-8).

## 4. Promotion / governance mechanics (item 2 / CHARTER DEC-2)

A model reaches production **only** through this gate. Thresholds marked **OPEN** are owner decisions (CHARTER DEC-2); the mechanism is fixed.

| Element | Specification |
|---|---|
| **Primary promotion metric** | Bid-quality improvement versus the current benchmark: the challenger must protect the **$800 target net gross** more reliably on bought units. |
| **Secondary safety metrics** | Fewer overbid/loss cases; no excessive conservatism that would have rejected clearly profitable buys; sale-price error and residual-dollar diagnostics remain supporting evidence, not the main promotion reason. |
| **Holdout window** | At least **8 recent sale weeks** that were not used for training. Also require enough shadow recommendations to make the comparison meaningful. |
| **Segment guardrails** | No regression in major vehicle segments, at minimum trucks, SUVs, sedans, high-mileage units, and higher-dollar units. **A model cannot be promoted on a global improvement if it hurts an important buying bucket.** |
| **Manual approval** | A human approval is **recorded** (`maxbuy_models.approved_by_user_id` + `approved_at`) before any production promotion. No auto-promote. |
| **Rollback** | On pipeline failure or failed gate, the prior production model stays live ([`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) §4.1). |
| **Champion/challenger** | Challenger runs in `shadow` predicting in parallel (not shown to buyers, CHARTER AC-5), compared against actuals + the Phase-1 benchmark baseline, before any promotion. |

## 5. Hard gates vs review routing (item 5 / CHARTER DEC-4 / R15)

**Two distinct mechanisms — must not be conflated.** Hard gates are absolute legal/risk exclusions; low-confidence routing is a quality nudge. CHARTER DEC-4 confirms the v1 hard-gate set; MMR missing and weak YMM fallback route to Review/data-strength handling unless ownership later promotes them to hard gates.

### 5.1 Hard gates (block / force PASS, regardless of model optimism)
Catalog (confirmed v1 set from DEC-4):

| Gate code | Condition |
|---|---|
| `GATE_TITLE_BRAND` | Branded title |
| `GATE_SALVAGE` | Salvage |
| `GATE_FLOOD` | Flood |
| `GATE_FRAME_STRUCTURAL` | Frame / structural damage |
| `GATE_ODOMETER` | Odometer rollback / discrepancy / not-actual |
| `GATE_RECALL_STOPSALE` | Open recall / stop-sale (when data available) |
| `GATE_ARBITRATION` | Open arbitration / adverse announcement flag |
| `GATE_SOURCE_RESTRICTED` | Vehicle/source is not allowed for TAV acquisition |
| `GATE_SOURCE_RESTRICTED` | Restricted acquisition source |
| `GATE_MMR_MISSING` | MMR unavailable and no acceptable fallback |
| `GATE_YMM_FALLBACK_LOW` | YMM-only fallback below the acceptable-confidence threshold |

A triggered hard gate sets `verdict = PASS` (or blocks the recommendation), records the gate code in `reason_codes` + `hard_gate_triggered`, and **wins over any model output** (best-in-class §9 hard-rule override). Gates run **before** scoring.

### 5.2 Low-confidence review routing (separate)
Low `data_strength` (sparse segment, high variance, YMM fallback above the gate threshold but still weak) routes the verdict to `REVIEW` for manual judgment. This is **not** a hard gate — the vehicle is not excluded; the human decides. Never auto-`STRONG_BUY` a low-data-strength result.
