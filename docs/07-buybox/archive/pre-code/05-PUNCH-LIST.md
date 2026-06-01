# MaxBuy — Pre-Code Punch List

**What this is / who it's for:** The ordered, must-resolve execution checklist before implementation begins. Each item closes by landing in one of the engineering docs ([`01-CHARTER.md`](01-CHARTER.md), [`ARCHITECTURE.md`](../../ARCHITECTURE.md), [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md)) or as a small spike/audit report. Nothing in 01/02/03 ships until each item that touches it is closed. Audience: the dev (execution owner), TAV ownership (decision owner on items 1, 5, 8, 14), product (UX + governance owner on items 2, 4, 15, 16, 17, 18). Companion docs: [`00-LEADERSHIP-BRIEF.md`](00-LEADERSHIP-BRIEF.md) · [`01-CHARTER.md`](01-CHARTER.md) · [`ARCHITECTURE.md`](../../ARCHITECTURE.md) · [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) · [`04-RISK-REGISTER.md`](04-RISK-REGISTER.md).

**Date:** 2026-05-20 · **Status:** Pre-code · **Repo prefix:** `TAV-BB`

> **2026-05-20 update:** Live audits 6, 7, and 9 found that key historical
> fields are absent from the DB, but TAV ownership confirmed the data exists
> externally. Phase 0 now adds item 20: load or stage the historical outcome
> backfill and re-run the affected audits before Phase 1 application code.

---

## 1. How to read this list

- **Owner column** — **O** = TAV Ownership · **P** = Product Mgmt · **D** = Solo Dev. An item with multiple owners requires consensus.
- **Category** — `Blocker Decision` (must close before any code) · `Data Audit` (read-only, no code) · `Architecture Spike` (small experiment, no production code) · `Workflow Decision` (UX/governance choice before UI build).
- **Closes risks** — the risk IDs from [`04-RISK-REGISTER.md`](04-RISK-REGISTER.md) this item resolves.
- **Lands in** — where the closed answer is written. If the answer is owner-only (e.g. a number), it lands in [`01-CHARTER.md`](01-CHARTER.md) §7 and the corresponding table in [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md).
- **Definition of done** — a binary check that proves the item is closed.

## 2. Execution order (the short version)

1. ~~**Owner:** items 1, 5 (DEC-1, DEC-4).~~ **Closed 2026-05-20** — see §3.
2. ~~**Product:** items 2, 4 (DEC-2, DEC-3).~~ **Closed 2026-05-20** — see §3.
3. **Dev, in parallel:** items 6, 7, 9, 10 (read-only data audits) + item 12 (worker contract pin) + item 19 (MarketCheck enrichment spike). These do not need owner decisions and unblock everything downstream.
4. **Dev, week 1 architecture spikes:** items 11, 13, 14.
5. **Product, before UI build:** items 15, 16, 17, 18.
6. **Item 8** (pass-on logging) is partly design (table exists) and partly dev (logging starts at v1 ship).
7. **Item 3** (decision replay schema) is partly design (already written in [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §1.4 + §3) and partly dev (CI test that verifies AC-8 on every release).
8. **Item 20** (historical outcome backfill) runs before Phase 1 if the missing
   data exists outside the DB.

---

## 3. Blocker decisions (must close before any code)

These are the four owner decisions tracked in [`01-CHARTER.md`](01-CHARTER.md) §7 (DEC-1…4) plus the replay schema, which is already specified but must be acknowledged.

### #1 — Target net gross policy ✅ **CLOSED**
| Field | Value |
|---|---|
| Owner | **O** (TAV Ownership) |
| Category | Blocker Decision |
| Closes risks | DEC-1 dependency (KPI-5 + `recommended_max_buy` undefined without it) |
| Lands in | [`01-CHARTER.md`](01-CHARTER.md) §7 DEC-1; [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §1.3 `maxbuy_policy` |
| Decision | v1 uses one company-wide default target net gross of **$800 per unit**. Segment/source/price-band variation is deferred. |
| Recommended default | Confirmed. Store as a versioned global row in `tav.maxbuy_policy`. |
| Definition of done | Closed for v1: owner confirmed the default number and accepted a single-row global policy starting point. |

### #2 — Promotion gate ✅ **CLOSED**
| Field | Value |
|---|---|
| Owner | **P** (Product Mgmt) |
| Category | Blocker Decision |
| Closes risks | R8, R9, R12 (plus DEC-2 dependency) |
| Lands in | [`01-CHARTER.md`](01-CHARTER.md) §7 DEC-2; [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §4 |
| Decision | ML stays shadow-only until it proves, over at least **8 recent sale weeks**, that it improves max-buy decisions versus the benchmark by protecting the **$800 target net gross**, reducing overbid/loss cases, and avoiding regression in major vehicle segments. Promotion requires documented human approval. |
| Recommended default | Confirmed. Bid quality is the promotion basis; sale-price accuracy is supporting evidence, not the main reason to promote. |
| Definition of done | Closed for v1/v2: promotion gate documented in [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §4 and DEC-2. |

### #3 — Decision replay schema ⛔ **BLOCKER (design already done; ack required)**
| Field | Value |
|---|---|
| Owner | **D** |
| Category | Blocker Decision |
| Closes risks | R2 (BLOCKER), R7, R9 |
| Lands in | [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §1.4 + §3 |
| Decision required | Store immutable MMR snapshot reference; benchmark/feature-view version; exact feature vector used; policy/scoring version; model artifact hash; worker contract version; MMR method/fallback/cache age/timestamp/VIN-vs-YMM path. |
| Recommended default | As specified in [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §1.4 — accept as-is. |
| Definition of done | CI test exists that, given a `recommendation_id`, re-runs the pinned scoring code against the pinned inputs and confirms identical outputs (AC-8 = 100%). |

### #4 — Confidence semantics ✅ **CLOSED**
| Field | Value |
|---|---|
| Owner | **P** |
| Category | Blocker Decision |
| Closes risks | R11 (plus DEC-3 dependency) |
| Lands in | [`01-CHARTER.md`](01-CHARTER.md) §4 + DEC-3; [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §2 |
| Decision | Use `data_strength` only (`low`/`medium`/`high`). Never show percentage-style confidence in v1. Low data strength caps the verdict at Review and cannot produce Buy or Strong Buy. |
| Recommended default | Confirmed. Probability-style confidence remains banned unless a future calibrated-interval test is defined and passed. |
| Definition of done | Closed for v1: DEC-3 confirmed; implementation should include tests that low data strength caps the verdict at Review and UI does not render percentage-style confidence. |

### #5 — Hard gates ✅ **CLOSED**
| Field | Value |
|---|---|
| Owner | **O** |
| Category | Blocker Decision |
| Closes risks | R15 (plus DEC-4 dependency) |
| Lands in | [`01-CHARTER.md`](01-CHARTER.md) §7 DEC-4; [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §5 |
| Decision | Force-PASS hard gates are: `GATE_TITLE_BRAND` including rebuilt/lemon/manufacturer buyback, `GATE_SALVAGE`, `GATE_FLOOD`, `GATE_FRAME_STRUCTURAL`, `GATE_ODOMETER`, `GATE_RECALL_STOPSALE` when available, `GATE_ARBITRATION` or adverse announcement flags, and `GATE_SOURCE_RESTRICTED`. |
| Recommended default | Confirmed for v1. `GATE_MMR_MISSING` and `GATE_YMM_FALLBACK_LOW` are not hard gates in v1; route those to Review/data-strength handling unless ownership later changes the policy. |
| Definition of done | Closed for v1: owner confirmed the hard-gate catalog. |

---

## 4. Data audits (read-only — no code, no decisions blocked)

The dev can start these in parallel with owner/product decisions. Each produces a report that lands in [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §5 or [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §1.1.

### #6 — Historical field completeness audit
| Field | Value |
|---|---|
| Owner | **D** |
| Category | Data Audit |
| Closes risks | R17 |
| Lands in | [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §1.1 (field tags); [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §5 |
| Task | Null-rate audit for every proposed `purchase_outcomes` addition. Mark each field **backfillable** / **future-only** / **unavailable**. Define model behavior for NULL-heavy fields before training. |
| Definition of done | Per-field null-rate table committed alongside this doc; field tags in [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §1.1 confirmed against the audit. |

### #7 — Segment support matrix
| Field | Value |
|---|---|
| Owner | **D** |
| Category | Data Audit |
| Closes risks | R3 |
| Lands in | [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §5 |
| Task | Count rows by `year/make/model/trim/region/mileage_band`. Count **effective** rows after recency weighting. Define minimum effective N for: exact segment, fallback segment (drop trim), global fallback. |
| Definition of done | Support matrix CSV committed; minimum-N policy documented; routing rules in [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §2 use the matrix to compute `data_strength`. |

### #8 — Survivorship & pass-on logging
| Field | Value |
|---|---|
| Owner | **D** (logging) + **O** (acknowledge bought-unit scope) |
| Category | Data Audit + Architecture |
| Closes risks | R4 |
| Lands in | [`01-CHARTER.md`](01-CHARTER.md) §6; [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §1.5 (`maxbuy_evaluated_passes`) |
| Task | (a) Confirm what historical no-sale/loss/in-stock data exists. (b) Explicitly scope v1/v2 as bought-unit performance if pass-on outcomes are unavailable. (c) Begin logging evaluated-but-not-bought VINs, ask/bid, MMR, buyer, structured pass reason, timestamp. |
| Definition of done | Charter §6 acknowledges bought-unit scope; `maxbuy_evaluated_passes` table exists; first row inserted at v1 ship. |

### #9 — MMR quality & residuals
| Field | Value |
|---|---|
| Owner | **D** |
| Category | Data Audit |
| Closes risks | R1 |
| Lands in | [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §5; [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §1.4 (MMR fields on replay) |
| Task | Audit VIN-MMR vs YMM-fallback rates over the 18-mo history. Track missing reasons and cache age distribution. Backtest `actual_sale_price − day_of_mmr` by segment, price band, and MMR method. |
| Definition of done | Residual-by-segment report committed; YMM-fallback rate by segment documented; thresholds for `GATE_YMM_FALLBACK_LOW` (item 5) informed by this audit. |

### #10 — Decay-rate validation
| Field | Value |
|---|---|
| Owner | **D** |
| Category | Data Audit |
| Closes risks | R6 |
| Lands in | [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §5 |
| Task | Backtest exponential decay λ grid (90/180/365/540-day half-life) by sale week. Compare sale-price MAE, gross-hit classification error, and segment-level stability. |
| Definition of done | λ-grid report; chosen λ committed to benchmark view definitions; per-segment override allowed where the grid says so. |

### #20 — Historical outcome backfill gate
| Field | Value |
|---|---|
| Owner | **D** |
| Category | Data Backfill Gate |
| Closes risks | R1, R3, R6, R17 |
| Lands in | [`audits/20-historical-outcome-backfill-plan.md`](audits/20-historical-outcome-backfill-plan.md); refreshed reports for items 6, 7, 9, 10 |
| Task | Since TAV ownership confirmed the missing historical fields exist outside the DB, inventory the source in aggregate, map safe fields, load or stage purchase date, mileage/odometer, day-of MMR or snapshot reference, linkage, region/source, trim, and expense fields, then re-run audits 6, 7, 9, and 10. |
| Definition of done | External source inventory complete; mapping approved; no secrets/raw VIN lists/raw vendor payloads/individual MMR figures committed; affected audits re-run and Phase 1 go/no-go updated. |

---

## 5. Architecture spikes (small experiments, no production code)

### #11 — Offline pipeline operations
| Field | Value |
|---|---|
| Owner | **D** |
| Category | Architecture Spike |
| Closes risks | R8 |
| Lands in | [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §4.1; [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §1.7 (`maxbuy_pipeline_runs`) |
| Task | Choose scheduler/runtime for the Python training job (Cloud Run Job / Fly Machine / Modal). Define artifact storage (object store + hash). Define retry, alerting, and rollback mechanics. |
| Definition of done | Host chosen + smoke-test cron run succeeds; `maxbuy_pipeline_runs` row written end-to-end on a no-op run; alert delivered to the dev on a forced failure; rollback-to-prior-model verified on a forced failed promotion. |

### #12 — `tav-intelligence-worker` contract
| Field | Value |
|---|---|
| Owner | **D** |
| Category | Architecture Spike |
| Closes risks | R9 |
| Lands in | [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §4.2; [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §2 (versioned API contract) |
| Task | Document the request/response schema MaxBuy depends on. Version the contract. Decide which normalized MMR fields are safe + sufficient to persist (R18). Add compatibility tests before MaxBuy depends on the worker. |
| Definition of done | Contract document committed; `intelligence_worker_contract_version` value pinned in [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §1.4; compatibility test suite in CI; safe-persist field list confirmed against vendor terms. |

### #13 — Feature & benchmark versioning
| Field | Value |
|---|---|
| Owner | **D** |
| Category | Architecture Spike |
| Closes risks | R7 |
| Lands in | [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §4.3; [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §1.2 + §1.4 |
| Task | Add a `benchmark_version` / `feature_view_version` to every materialized-view rebuild. Stamp every recommendation with the exact version used. Preserve old benchmark outputs (do not overwrite in place). |
| Definition of done | Two consecutive rebuilds produce two rows of preserved benchmark outputs; a recommendation written before the second rebuild replays against the first version exactly. |

### #14 — Retention split
| Field | Value |
|---|---|
| Owner | **D** + **O** (vendor confirmation) |
| Category | Architecture Spike |
| Closes risks | R16, R18 |
| Lands in | [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §4.4 |
| Task | Keep compact immutable recommendation snapshots indefinitely. Purge only nonessential detailed lookup/session records after 90 days. Confirm this does not conflict with Manheim vendor restrictions on valuation data. |
| Definition of done | Retention policy documented; first 90-day purge job runs successfully against a test dataset without orphaning a snapshot; vendor-restriction check signed off by owner. |

---

## 6. Workflow decisions (before UI build)

### #15 — Override capture
| Field | Value |
|---|---|
| Owner | **P** |
| Category | Workflow Decision |
| Closes risks | R10 |
| Lands in | [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §1.6 (`maxbuy_overrides`) |
| Task | Design one-click structured override / pass reason capture at the decision moment. Required codes: `bought_despite_pass`, `passed_despite_buy`, `bid_reduced`, `title_condition_concern`, `transport_concern`, `manager_call`, `inventory_need`, `other`. Free text *in addition* to the code, never instead. |
| Definition of done | UI mock with one-click reason chips approved; `maxbuy_overrides` rows captured on every buy/pass that disagrees with the verdict. |

### #16 — Two-state display
| Field | Value |
|---|---|
| Owner | **P** |
| Category | Workflow Decision |
| Closes risks | R13 |
| Lands in | [`TECHNICAL-SPEC.md`](../../TECHNICAL-SPEC.md) §2 (two-state display logic) |
| Task | If asking price is present, show vehicle fit *and* deal fit together (one result, no mode toggle). If absent, badge the result `vehicle-only` and suppress the verdict — UI must not imply a final buy decision. |
| Definition of done | UI mock approved for both states; CI test that a lookup without `asking_price` returns `verdict.verdict = null` and `display_state = vehicle_fit`. |

### #17 — Adoption KPIs (now gating)
| Field | Value |
|---|---|
| Owner | **P** |
| Category | Workflow Decision |
| Closes risks | R5 |
| Lands in | [`01-CHARTER.md`](01-CHARTER.md) §5.2 |
| Task | Confirm KPI definitions, windows, and **gating** roles: KPI-1 gates Phase 2 → 3; KPI-2 gates Phase 4; KPI-3 monitored with investigation trigger; KPI-4 gates ML promotion (DEC-2); KPI-5 evaluable once DEC-1 lands. |
| Definition of done | KPI dashboard exists in Supabase / Metabase / similar; per-KPI floor numbers confirmed by owner; Phase 2 release-gate checklist references KPI-1. |

### #18 — Evaluation rubric refresh
| Field | Value |
|---|---|
| Owner | **P** |
| Category | Workflow Decision |
| Closes risks | R12 |
| Lands in | [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §6 |
| Task | Re-run the buybox-solution-evaluation weighted rubric with v1 adoption-weighted criteria. Increase C5 (explainability) and C6 (product/UX) to ~15 each. Downgrade C4 (governance/MLOps) until promotion metrics and pipeline ops are specified. Document any changed conclusions. |
| Definition of done | Refreshed rubric committed alongside the original; changed conclusions (if any) reflected in [`01-CHARTER.md`](01-CHARTER.md) §3 scope decisions. |

---

## 7. Summary table — all items, single view

| # | Item | Category | Owner | Closes | Lands in |
|---|---|---|---|---|---|
| 1 | Target net gross policy | Blocker Decision | **O** | DEC-1 | CHARTER §7; TECH §1.3 |
| 2 | Promotion gate | Blocker Decision | **P** | DEC-2, R8, R9, R12 | CHARTER §7; TECH §4 |
| 3 | Decision replay schema | Blocker Decision (design done) | **D** | R2, R7, R9 | TECH §1.4, §3 |
| 4 | Confidence semantics | Blocker Decision | **P** | DEC-3, R11 | CHARTER §4; TECH §2 |
| 5 | Hard gates | Blocker Decision | **O** | DEC-4, R15 | CHARTER §7; TECH §5 |
| 6 | Historical field completeness | Data Audit | **D** | R17 | ARCH §5; TECH §1.1 |
| 7 | Segment support matrix | Data Audit | **D** | R3 | ARCH §5 |
| 8 | Survivorship & pass-on logging | Data Audit + Architecture | **D** + **O** | R4 | CHARTER §6; TECH §1.5 |
| 9 | MMR quality & residuals | Data Audit | **D** | R1 | ARCH §5; TECH §1.4 |
| 10 | Decay-rate validation | Data Audit | **D** | R6 | ARCH §5 |
| 11 | Offline pipeline operations | Architecture Spike | **D** | R8 | ARCH §4.1; TECH §1.7 |
| 12 | `tav-intelligence-worker` contract | Architecture Spike | **D** | R9 | ARCH §4.2; TECH §2 |
| 13 | Feature & benchmark versioning | Architecture Spike | **D** | R7 | ARCH §4.3; TECH §1.2, §1.4 |
| 14 | Retention split | Architecture Spike | **D** + **O** | R16, R18 | ARCH §4.4 |
| 15 | Override capture | Workflow Decision | **P** | R10 | TECH §1.6 |
| 16 | Two-state display | Workflow Decision | **P** | R13 | TECH §2 |
| 17 | Adoption KPIs (gating) | Workflow Decision | **P** | R5 | CHARTER §5.2 |
| 18 | Evaluation rubric refresh | Workflow Decision | **P** | R12 | ARCH §6 |
| 19 | MarketCheck VIN enrichment spike | Architecture Spike | **D** | Provider/dependency risk | ARCH §4.5; audits/19 |

## 8. Tracking

Suggested workflow:
- Each item gets a GitHub issue labeled `pre-code` + one of `blocker-decision` / `data-audit` / `architecture-spike` / `workflow-decision`.
- Items 1, 2, 4, 5 (DEC-1…4) are **closed as of 2026-05-20**; close their issues with the decision recorded in §3.
- The release branch protection rule for `main` blocks any merge of code in `apps/maxbuy/*` until all 19 issues are closed.
- The PR description for the first MaxBuy code merge references the closed punch-list issues.
