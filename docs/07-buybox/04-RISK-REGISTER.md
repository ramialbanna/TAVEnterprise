# MaxBuy — Risk Register

**What this is / who it's for:** The merged risk register across all four reviewer lenses (Data Science / Architecture / Business Analyst / Methodology / Compliance), with severity, reviewer confidence, plain-language "why it matters," and an explicit landing page where each mitigation is implemented. Audience: the dev, reviewers, and any future auditor reconstructing why a design choice was made. Companion docs: [`00-LEADERSHIP-BRIEF.md`](00-LEADERSHIP-BRIEF.md) · [`01-CHARTER.md`](01-CHARTER.md) · [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) · [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) · [`05-PUNCH-LIST.md`](05-PUNCH-LIST.md).

**Date:** 2026-05-20 · **Status:** Pre-code · **Repo prefix:** `TAV-BB`

---

## 1. How to read this register

- **Lens:** which reviewer perspective flagged this. **DS** = data science; **ARCH** = architecture; **BA** = business analyst / workflow; **METHOD** = methodology / evaluation rigor; **COMPLIANCE** = vendor / legal / data-handling.
- **Severity:** `BLOCKER` (must close before any code) · `HIGH` (must close before the phase that touches it ships) · `MED` (must be tracked, can ship with mitigation in flight).
- **Confidence:** the reviewer's confidence in the risk call itself (`high` / `medium` / `low`). A HIGH-severity / low-confidence risk is one to investigate, not necessarily one to fully mitigate.
- **Status:** `OPEN` · `MITIGATED-IN-DESIGN` (design closes it, code must implement) · `RESIDUAL` (acknowledged, accepted, monitored).
- **Lands in:** the doc + section where the mitigation is specified. If the mitigation requires owner decisions or audits, those are tracked in [`05-PUNCH-LIST.md`](05-PUNCH-LIST.md).

## 2. Top-5 blockers (resolve first)

The five issues that cannot be deferred past pre-code. Each maps to one or more risk IDs below.

| # | Blocker | Risk IDs | Closed when |
|---|---|---|---|
| 1 | Promotion gate is not defined — "beats production" has no metric, threshold, holdout window, or segment guardrail. | R8, R9, R12 | DEC-2 confirmed; mechanics in [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §4. |
| 2 | Decision replay is incomplete — recommendation log can't reconstruct a past decision. | R2, R7, R9 | Schema in [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §1.4 + replay verified in §3. |
| 3 | Historical dataset cannot answer the full decision question — survivorship and pass-on counterfactual bias. | R3, R4 | v1/v2 scoped explicitly as bought-unit; pass-on logging begins day one ([`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §1.5). |
| 4 | Confidence is undefined but buyer-facing — "92% confidence" reads as a truth claim. | R11 (and DEC-3) | DEC-3 confirmed; UI shows "data strength" only ([`01-CHARTER.md`](01-CHARTER.md) §4). |
| 5 | Acceptance criteria do not prove MaxBuy works in the business — output-only, no adoption gates. | R5 | Adoption KPIs promoted to gating ([`01-CHARTER.md`](01-CHARTER.md) §5.2). |

## 3. Full register (R1–R18)

### R1 — MMR treated as a neutral anchor (DS, HIGH, conf high)

**Issue.** The core formula `expected_sale_price = current_mmr × expected_sale_pct_mmr` assumes MMR is a neutral reference. It isn't — MMR carries per-segment bias against TAV's actual portfolio, and YMM fallback (when VIN match isn't available) is lower-confidence but currently masquerades as full confidence.

**Why it matters.** MaxBuy can disguise inherited MMR error as TAV edge, especially at price extremes and on sparse/luxury/EV segments.

**Mitigation.** Store MMR method, timestamp, source, cache age, VIN-vs-YMM, and missing reason on every recommendation. Monitor residuals (`actual_sale_price − day_of_mmr`) by segment, price band, and MMR method. v2 ML training adds a **residual-dollar target alongside `sale_pct_mmr`** as an explicit hedge.

**Lands in.** [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) §3 (dual target), §4.2, §5; [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §1.4 (MMR provenance fields). **Status:** MITIGATED-IN-DESIGN.

### R2 — Recommendation log can't replay a past decision (ARCH, BLOCKER, conf high)

**Issue.** The prior log stored `model_version`, `inputs_used`, `recommendation`, `confidence`, `reason_codes`, `historical_comp_ids`, `created_at`. That is not enough to reconstruct what MaxBuy *knew* at the moment. Missing: immutable MMR snapshot, benchmark/feature-view version, policy/scoring code version, model artifact hash, exact feature vector, worker contract version.

**Why it matters.** Six months later, a lost-money VIN review becomes archaeology. The replay capability is the spine of governance.

**Mitigation.** Pin all replay fields in `maxbuy_recommendations`; row is append-only (no app-role `UPDATE`/`DELETE`); benchmark outputs preserved per version, never rebuilt in place.

**Lands in.** [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §1.4 + §3; [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) §4.3. **Status:** MITIGATED-IN-DESIGN. (Verify with AC-8 in CI.)

### R3 — "45–50K rows" is global, not segment-effective (DS, HIGH, conf high)

**Issue.** The 45–50K total is enough for a global GBM and for common segments, but the support per `year/make/model/trim/region/mileage_band` cell is much lower after recency weighting. Sparse cells will look statistically supported when they are fallback guesses.

**Why it matters.** False-confidence verdicts on low-volume segments — exactly where buyer trust is most fragile.

**Mitigation.** Build a segment support matrix before ML. Define minimum effective N for: exact segment, fallback segment (e.g. drop trim), global fallback. Surface support level as part of `data_strength`.

**Lands in.** [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) §5; punch-list #7. **Status:** OPEN (audit required).

### R4 — Future outcome capture doesn't solve pass-on counterfactual bias (DS, HIGH, conf high)

**Issue.** Capturing future `sold/no_sale/loss/in_stock` fixes outcome bias for cars TAV *bought*. It does not fix the deeper bias: the model never learns whether cars TAV *passed* would have been good buys.

**Why it matters.** v1/v2 can predict performance *conditional on TAV buying* — it cannot learn the opportunity boundary.

**Mitigation.** Scope v1/v2 explicitly as **bought-unit performance models** (Charter §6). Log every evaluated-but-not-bought VIN, ask/bid, MMR, buyer, and structured pass reason from day one. Counterfactual learning is deferred to v3+.

**Lands in.** [`01-CHARTER.md`](01-CHARTER.md) §6; [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §1.5 (`maxbuy_evaluated_passes`). **Status:** RESIDUAL (acknowledged limitation) + MITIGATED-IN-DESIGN (logging started).

### R5 — Acceptance criteria measured output, not adoption (BA, HIGH, conf high)

**Issue.** Prior ACs required outputs, formula examples, backtests, snapshots, no secret leakage. Necessary but not sufficient. MaxBuy can pass review while buyers ignore it.

**Why it matters.** First failure mode for an internal tool is non-use. Correct numbers nobody looks at = no business value.

**Mitigation.** Adoption KPIs promoted from monitoring to **launch-gating** (KPI-1 gates Phase 2→3; KPI-4 gates ML promotion). Override capture is one-click structured at the decision moment, not a free-text-after notes field.

**Lands in.** [`01-CHARTER.md`](01-CHARTER.md) §5.2; [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §1.6 (`maxbuy_overrides`). **Status:** MITIGATED-IN-DESIGN.

### R6 — Decay λ asserted, not validated (DS, MED, conf medium)

**Issue.** Recency-weighted medians use an exponential decay λ that was asserted in the master spec, not chosen empirically. Wrong λ either lags regime shifts or chases short-cycle noise.

**Why it matters.** A miscalibrated decay degrades v1 benchmarks before ML is even on.

**Mitigation.** λ-grid backtest (90/180/365/540-day half-life) by sale week and segment volume; compare sale-price MAE, gross-hit classification, segment-level stability. Pick λ from data; allow per-segment override.

**Lands in.** [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) §5; punch-list #10. **Status:** OPEN (backtest required).

### R7 — Weekly views create staleness / replay ambiguity (ARCH, HIGH, conf high)

**Issue.** If feature/benchmark materialized views are rebuilt in place weekly, a Tuesday-11pm recommendation can be "replayed" against Wednesday-rebuilt views and produce a different explanation.

**Why it matters.** Silent replay drift defeats AC-8 even when all the pin fields are stored.

**Mitigation.** Every benchmark/feature-view rebuild gets a `benchmark_version` / `feature_view_version`. Old outputs are preserved per version, never overwritten. Every recommendation pins the version it used.

**Lands in.** [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) §4.3; [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §1.4. **Status:** MITIGATED-IN-DESIGN.

### R8 — Offline pipeline has no scheduler/monitoring/recovery (ARCH, HIGH, conf high)

**Issue.** "Scheduled Python job, NOT a Worker" is architecturally right but operationally incomplete. A solo dev silently missing a retrain is the dominant failure mode.

**Why it matters.** Silent training failure → stale benchmarks → degrading verdicts with no visible signal.

**Mitigation.** `tav.maxbuy_pipeline_runs` row per run (status, ingested rows, versions produced, promotion decision, error); retry with backoff on transient ingest failure; alert on hard failure or skipped run; rollback = keep prior production model live, never auto-promote on failure.

**Lands in.** [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) §4.1; [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §1.7. **Status:** MITIGATED-IN-DESIGN (host choice = punch-list #11 spike).

### R9 — `tav-intelligence-worker` contract implied, not versioned (ARCH, HIGH, conf medium)

**Issue.** MaxBuy depends on the intelligence-worker for MMR but the request/response contract is not pinned. A worker change can silently alter MaxBuy decisions.

**Why it matters.** Cross-Worker drift breaks both replay (R2) and the promotion gate (since the score-change attribution becomes ambiguous).

**Mitigation.** Document the contract; version it; store `intelligence_worker_contract_version` on every recommendation. Add compatibility tests before MaxBuy depends on the worker. Decide which normalized MMR fields are safe + sufficient to persist (never raw payloads — see R18).

**Lands in.** [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) §4.2; [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §1.4, §2. **Status:** OPEN (contract pin = punch-list #12).

### R10 — Override capture named but not designed (BA, HIGH, conf high)

**Issue.** Earlier docs mention "user overrides" without specifying capture mechanics. Free-text-after-the-fact override notes are sparse, biased, and don't feed learning.

**Why it matters.** The override stream is the highest-signal feedback channel MaxBuy will ever have; if it's an afterthought, the learning loop starves.

**Mitigation.** One-click structured override at the decision moment with fixed reason codes (`bought_despite_pass`, `passed_despite_buy`, `bid_reduced`, `title_condition_concern`, `transport_concern`, `manager_call`, `inventory_need`, `other`); optional free text *in addition* to the code, never instead.

**Lands in.** [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §1.6 + §2. **Status:** MITIGATED-IN-DESIGN.

### R11 — Confidence display misleads buyers (BA/DS, HIGH, conf high — folded with DEC-3)

**Issue.** The earlier `confidence` field was a heuristic of sample size × recency × VIN-match × variance, exposed to buyers. "92% confidence" reads as a calibrated probability.

**Why it matters.** Buyers will treat the number as a truth claim; product trust collapses on the first counter-example.

**Mitigation.** Display label = `data_strength` (`low`/`medium`/`high`); never a percentage. Ban probability display until an empirical coverage test (80% predicted interval contains actual ~80% of time on rolling holdout) passes.

**Lands in.** [`01-CHARTER.md`](01-CHARTER.md) §4 + DEC-3; [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §2. **Status:** MITIGATED-IN-DESIGN (pending DEC-3 confirm).

### R12 — Eval rubric weights underweight adoption/UX for an internal buyer tool (METHOD, MED, conf high)

**Issue.** The original solution-evaluation rubric weighted Explainability and Product/UX at 10 each while Prediction and MLOps were higher. For a tool whose first failure mode is non-use, those weights are backwards.

**Why it matters.** A maturity score that overstates governance / understates adoption produces premature ML promotion and under-built UX.

**Mitigation.** Re-run the rubric with v1 adoption-weighted criteria: C5/C6 ↑ to ~15 each; downgrade C4 (governance/MLOps maturity) until promotion metrics and pipeline ops are actually specified. Document any changed conclusions.

**Lands in.** [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) §6; punch-list #18. **Status:** OPEN.

### R13 — Two-state display may add lane friction (BA, MED, conf medium)

**Issue.** A separate "vehicle fit" / "deal fit" toggle would require a buyer to switch modes under auction pressure (15–30s per lane vehicle).

**Why it matters.** Toggle UX = skipped UX = incomplete information at the decision moment.

**Mitigation.** When `asking_price` is present, show vehicle fit *and* deal fit together in one result. When absent, badge the result `vehicle-only` and suppress the verdict — never imply a final buy decision against a missing ask.

**Lands in.** [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §2 (two-state display logic). **Status:** MITIGATED-IN-DESIGN.

### R14 — Multiple targets → incoherent verdicts (DS, MED, conf medium)

**Issue.** Targets `sale_pct_mmr`, `net_gross`, P(hit target gross), `days_to_sale` can disagree (strong gross + slow turn → ambiguous verdict).

**Why it matters.** A "Strong Buy" with a slow-turn footnote erodes verdict trust.

**Mitigation.** Fixed verdict priority + conflict resolution: hard gate wins; then low data-strength caps at REVIEW; then `delta_to_ask` and expected net gross set the buy band; no STRONG_BUY when predicted turn exceeds segment threshold unless net premium offsets.

**Lands in.** [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §2 (verdict conflict resolution). **Status:** MITIGATED-IN-DESIGN.

### R15 — No preference filters, but hard exclusions still needed (BA, HIGH, conf high)

**Issue.** "No static preferred makes/models" is the correct stance, but conflating it with "no static exclusions" lets bad inventory through. Some conditions must block regardless of how optimistic the model is.

**Why it matters.** A model-recommended salvage truck is a legal/risk event, not a calibration issue.

**Mitigation.** Hard-gate catalog (`GATE_TITLE_BRAND`, `GATE_SALVAGE`, `GATE_FLOOD`, `GATE_FRAME_STRUCTURAL`, `GATE_ODOMETER`, `GATE_RECALL_STOPSALE`, `GATE_ARBITRATION`, `GATE_SOURCE_RESTRICTED`, `GATE_MMR_MISSING`, `GATE_YMM_FALLBACK_LOW`) that runs **before** scoring and forces `verdict = PASS`. Kept structurally **separate** from low-confidence → REVIEW routing.

**Lands in.** [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §5; [`01-CHARTER.md`](01-CHARTER.md) DEC-4. **Status:** MITIGATED-IN-DESIGN (catalog set; owner confirms membership in DEC-4).

### R16 — 90-day detail retention vs long-horizon replay (ARCH, MED, conf high)

**Issue.** Purging detailed lookup/session records at 90 days would also purge the inputs needed to replay older decisions.

**Why it matters.** Backtesting and post-hoc dispute review require old decisions to be reconstructable, sometimes years out.

**Mitigation.** Retention split: compact immutable recommendation snapshots kept **indefinitely**; only nonessential raw lookup/UI detail purged at 90 days; snapshots that created Opportunities stay permanently with the Opportunity. Confirm against Manheim contract terms (see R18).

**Lands in.** [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) §4.4. **Status:** MITIGATED-IN-DESIGN (vendor confirmation = punch-list #14).

### R17 — Buyer identity / provenance / vehicle history missing (DS, MED, conf high)

**Issue.** Without buyer ID, acquisition source/channel, and vehicle history events, the model attributes buyer skill or source risk to vehicle segment.

**Why it matters.** Hidden confounders silently degrade verdict quality and disguise which buyers / channels actually outperform.

**Mitigation.** `buyer_user_id`, `acquisition_source`, `announcement_flags`, `expense_breakdown` added to `tav.purchase_outcomes`; backfill where possible, future-only otherwise.

**Lands in.** [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §1.1. **Status:** MITIGATED-IN-DESIGN (capture quality verified in punch-list #6).

### R18 — Licensed MMR figures must not leak; replay still needs valuation (COMPLIANCE, HIGH, conf high)

**Issue.** Manheim contract restricts how raw valuation payloads can be stored. But decision replay needs the valuation that was used at the moment.

**Why it matters.** Vendor / compliance risk if raw payloads leak; audit risk if nothing is stored.

**Mitigation.** Store only normalized, contract-allowed MMR fields (`mmr_value`, `mmr_method`, `mmr_source`, `mmr_cache_age_seconds`, `mmr_missing_reason`, `mmr_observed_at`) and an immutable `valuation_snapshot_id`. **Never** persist raw payloads. CI scan + review enforces AC-7.

**Lands in.** [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) §4.4; [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §1.4; [`01-CHARTER.md`](01-CHARTER.md) AC-7. **Status:** MITIGATED-IN-DESIGN (vendor contract review = punch-list #14).

## 4. Severity / lens matrix

| | DS | ARCH | BA | METHOD | COMPLIANCE | Totals |
|---|---|---|---|---|---|---|
| **BLOCKER** | – | R2 | – | – | – | **1** |
| **HIGH** | R1, R3, R4 | R7, R8, R9 | R5, R10, R11, R15 | – | R18 | **11** |
| **MED** | R6, R14, R17 | R16 | R13 | R12 | – | **6** |
| **Totals per lens** | **7** | **5** | **5** | **1** | **1** | **18** |

## 5. Open items still requiring resolution

These risks are not yet fully closed at design time; each has a punch-list item that drives closure.

| Risk | Status | Closing action | Punch-list item |
|---|---|---|---|
| R3 | OPEN | Segment support matrix audit | #7 |
| R6 | OPEN | λ-grid backtest | #10 |
| R9 | OPEN | Worker contract pin + version | #12 |
| R12 | OPEN | Eval rubric re-run, adoption-weighted | #18 |
| R16 / R18 | MITIGATED, pending vendor check | Manheim contract review for indefinite retention | #14 |

All other risks are MITIGATED-IN-DESIGN — they ship closed when the design ships, verified by AC-1…AC-8.
