# MaxBuy — Project Charter

**What this is / who it's for:** The business charter for MaxBuy, the ML-driven max-buy-price recommendation engine being built inside TAV-AIP. It defines the mission, scope, non-goals, **measurable acceptance criteria** (including launch-gating adoption KPIs), and the **business decisions that must be resolved before code is written**. Audience: TAV ownership (decision owner), product/implementation lead, and the solo dev. Companion docs: [`00-LEADERSHIP-BRIEF.md`](00-LEADERSHIP-BRIEF.md) · [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) · [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) · [`04-RISK-REGISTER.md`](04-RISK-REGISTER.md) · [`05-PUNCH-LIST.md`](05-PUNCH-LIST.md).

**Date:** 2026-05-20 · **Status:** Pre-code · **Repo prefix:** `TAV-BB`

---

## 1. Mission

Replace the question *"is this vehicle priced below MMR?"* with TAV's actual operating question:

> **What will TAV sell this vehicle for, what will it cost us to own, and what is the most we should pay?**

MaxBuy is a TAV-only decision engine. Given a VIN (+ optional mileage + optional asking price) it returns a predicted sale price (as a % of Manheim MMR), an expected net gross after transport and expenses, a **recommended max buy**, and an explainable verdict — Strong Buy / Buy / Review / Pass — with reason codes and a data-strength indicator.

It is **not** a generic valuation book. MMR stays the external market anchor; MaxBuy's proprietary edge is learning how TAV performs against MMR by segment, channel, region, expense load, and velocity.

## 2. Business objective

| Objective | Why |
|---|---|
| Stop overbidding under auction time pressure | A buyer has 15–30s per lane vehicle; emotional momentum drives overpay. |
| Make TAV's own clearing behavior the authority, not a third-party book | MMR is biased per-segment for TAV's actual portfolio; MaxBuy corrects for it. |
| Convert lookups into auditable buyer work items (Opportunities) | Every recommendation must be reconstructable later — see [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §3 Decision Replay. |
| Improve weekly from real sale outcomes under strict governance | The model must get better without silently drifting into bad buys. |

## 3. Scope

### In scope — v1 (explainable, pre-ML)
- VIN-first lookup; optional mileage and asking price.
- Live MMR via the existing `tav-intelligence-worker` (VIN-first, YMM fallback, cached).
- Recency-weighted segment **benchmark** medians (not ML) for `sale_pct_mmr`, net gross, transport, expenses.
- Additive max-buy math and a Strong Buy / Buy / Review / Pass verdict with reason codes and a data-strength badge.
- Immutable recommendation snapshots; Create-Opportunity hand-off.
- Adoption + decision-quality telemetry from day one (§5).

### In scope — v2 (shadow ML)
- Offline-trained gradient-boosted model (XGBoost/LightGBM) predicting `sale_pct_mmr`, `net_gross`, P(hit target gross), `days_to_sale`.
- **Dual training target:** train both `sale_pct_mmr` and a residual-dollar / raw-price target in parallel; compare residuals by price band, MMR source, age, mileage. This detects MMR bias at price extremes that pure %MMR normalization hides.
- Shadow mode first; promotion only through the governance gate (see [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §4).

### Enterprise / later (explicitly deferred)
- Per-VIN live inference service (Option C — see [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) §3); only if backtests prove it beats segment lookups on decision metrics.
- Holding-cost-per-day subtraction from net (owner deferred — §7).
- TAV's own market-drift index (public Manheim Index ships first; internal index later).
- Pass-on / counterfactual buy-decision learning (v1/v2 are explicitly **bought-unit** performance models — §6, R4).

### Non-goals
- Not a public app, not a report, not a static rules box.
- No static preferred-make/model/region filters. Hard gates are for legal/risk and confidence, never taste — see [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §5.
- Does not become a fifth four-concept source-of-truth. A MaxBuy lookup is not a Raw/Normalized Listing, Vehicle Candidate, or Lead; it may *create* an Opportunity, but the snapshot stays separate and auditable.
- Never displays licensed Manheim raw payloads; only normalized, contract-allowed MMR fields are persisted.

## 4. Confidence vs data-strength semantics (resolves punch-list item 4)

The buyer-facing indicator is labeled **"data strength,"** not "confidence," and **never** as a probability-style percentage, until a calibration test is defined and passed.

- v1 data-strength is a heuristic composite: effective sample size · recency · VIN-match-vs-YMM · segment variance. It answers *"how much do we know about this segment?"* — not *"what is the probability this is a good buy?"*
- A "92% confidence"-style number is **banned** from the UI until calibrated.
- **Calibrated confidence (future, gated):** if a probability is ever displayed, it must pass an empirical coverage test — e.g. an 80% predicted interval must contain the actual sale price ~80% of the time over a rolling holdout. Until that test passes, display data-strength only.

## 5. Measurable acceptance criteria

Two classes of criteria. **Resolved** criteria have a fixed pass/fail rule. **Open-value** criteria are stated in measurable *form* with a recommended default the owner must confirm before code — the threshold itself is an OPEN DECISION (see §7).

> **Critical change vs prior charter:** Adoption KPIs are **launch-gating**, not monitoring (closes R5). Phase 2 does not roll out to all buyers until KPI-1 baseline clears the owner-set floor.

### 5.1 Build / correctness criteria (RESOLVED — pass/fail)

| ID | Criterion | Metric + threshold | Window |
|---|---|---|---|
| **AC-1** | Explainable verdict | A user enters a VIN and can read *why* the result is Strong Buy / Buy / Review / Pass (reason codes + comp summary present on 100% of results). | Per lookup |
| **AC-2** | Complete recommendation packet | Every recommendation includes expected sale price, expected net gross, recommended max buy, data-strength, reason codes, and the model/benchmark version. 0 missing fields. | Per lookup |
| **AC-3** | Max-buy formula validation | Fixed worked examples reproduce the documented max-buy math exactly (e.g. MMR 18,000 → max buy 15,530 at the doc's inputs). 100% match. | CI / pre-release |
| **AC-4** | Historical backtest exists | Benchmark recommendations are backtested against actual sale outcomes by segment and sale week; report produced. | Pre-release + weekly |
| **AC-5** | ML stays shadow-only until it earns promotion | No ML output reaches buyers before passing the promotion gate ([`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §4). 0 violations. | Continuous |
| **AC-6** | Snapshot preserved on Opportunity creation | When a lookup creates an Opportunity, the full immutable snapshot persists and is replayable ([`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §3). 100%. | Per Opportunity |
| **AC-7** | No secret/licensed-data leakage | No secrets, licensed valuation figures, or raw Manheim payloads are committed, logged, or pasted. 0 occurrences (CI scan + review). | Continuous |
| **AC-8** | Decision replay completeness | A past recommendation can be reconstructed from pinned versioned inputs (MMR snapshot, benchmark/feature-view version, feature vector, policy/scoring version, model artifact hash). 100% reconstructable. | Continuous |

### 5.2 Adoption KPIs — LAUNCH-GATING (resolves punch-list item 17, closes R5)

These prove MaxBuy is *used* and *trusted*, not just that it produces output. **Promoted from monitoring to gating** — each KPI's gate column states what it blocks.

| ID | KPI | Metric definition | Window | Gate |
|---|---|---|---|---|
| **KPI-1** | Buyer lookup rate | Distinct active buyers performing ≥1 MaxBuy lookup / total active buyers. | Weekly | **Gates Phase 2 → Phase 3.** Owner-set floor; recommended default ≥ 90% active utilization. |
| **KPI-2** | Lookup-to-buy conversion | Acquisitions with a prior MaxBuy lookup / total acquisitions. | Rolling 4 weeks | **Gates Phase 4.** Baseline measured month 1; floor set month 2. |
| **KPI-3** | Override rate + reason distribution | Overrides / total verdicts shown, broken down by structured reason code ([`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §2). | Weekly | No fixed target; sustained high "Bought despite Pass" is an investigation trigger. |
| **KPI-4** | Actual-vs-predicted sale error (bought units) | MAPE of predicted vs actual sale price on acquired vehicles. | Rolling 8 sale weeks | **Gates ML promotion (DEC-2).** Master spec proposes MAPE < 4.2%; validate achievability on real backtest before committing. |
| **KPI-5** | Gross-hit rate vs target net gross | Share of acquisitions whose realized net gross ≥ target net gross. | Rolling 8 sale weeks | Depends on DEC-1; cannot evaluate until target net gross policy exists. |

> **Note on KPI-5 / target net gross:** The owner has stated there is currently **no per-unit target gross number**. KPI-5 therefore cannot be evaluated until DEC-1 is resolved. It is stated here in measurable form so it is ready the moment a policy exists. Do not invent the number.

## 6. Key risks acknowledged at charter level

(Full register in [`04-RISK-REGISTER.md`](04-RISK-REGISTER.md).)

- **Survivorship / pass-on bias (R4):** v1/v2 are **bought-unit** performance models. They predict performance *conditional on TAV buying*, not whether passed cars were good buys. This is acceptable **only** because stated explicitly. TAV clears ~97%, so historical no-sale backfill is low priority; evaluated-but-not-bought logging still begins day one for future learning ([`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §1.5).
- **MMR inherited bias (R1):** MaxBuy can inherit MMR's per-segment error and disguise it as TAV edge. Mitigated by storing MMR method/source/cache-age/VIN-vs-YMM on every recommendation and monitoring residuals. v2 ML adds a residual-dollar target alongside %MMR.
- **Goodhart on target gross:** optimizing only for target-gross hits can starve fast-turn inventory. The verdict should distinguish high-gross vs fast-turn vs inventory-fill, not collapse all value into one number.

## 7. Decisions required before implementation

Every open **business** decision before code. Recommended defaults are recommendations only — the owner confirms before code. (Architecture/data spikes are tracked in [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md); schema/gate mechanics in [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md); execution order in [`05-PUNCH-LIST.md`](05-PUNCH-LIST.md).)

| ID | Punch-list # | Decision | Recommended default | Owner | Status |
|---|---|---|---|---|---|
| **DEC-1** | 1 | **Target net gross policy:** the required net the max-buy floor subtracts. | v1 uses one company-wide default target net gross of **$800 per unit**, versioned in `tav.maxbuy_policy` ([`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §1.3). Segment/source/price-band targets are deferred until outcome data shows the need. | TAV Ownership | CONFIRMED |
| **DEC-2** | 2 | **Promotion gate:** proof required before ML can become buyer-facing. | **Confirmed:** ML stays shadow-only until it proves, over at least **8 recent sale weeks**, that it improves max-buy decisions versus the benchmark by protecting the **$800 target net gross**, reducing overbid/loss cases, and avoiding regression in major vehicle segments. Promotion requires documented human approval. Mechanics in [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §4. | Product Mgmt | CONFIRMED |
| **DEC-3** | 4 | **Confidence semantics:** display "confidence" or "data strength"? Allow probability-style values? | **Confirmed:** display **data strength** only. Never show percentage-style confidence in v1. Low data strength may still return a useful result, but caps the verdict at **Review** and cannot produce Buy or Strong Buy. | Product Mgmt | CONFIRMED |
| **DEC-4** | 5 | **Hard gates:** which conditions are absolute legal/risk exclusions vs low-confidence review routing. | **Confirmed force-PASS gates:** branded title including rebuilt/lemon/manufacturer buyback, salvage, flood, frame/structural damage, odometer rollback/discrepancy/not-actual miles, open recall/stop-sale when available, arbitration or adverse announcement flags, and source-restricted vehicles. MMR missing and weak YMM fallback remain data-quality Review routes unless ownership later promotes them to hard gates. | TAV Ownership | CONFIRMED |

### Owner decisions already settled (do not re-litigate)

| Topic | Settled answer |
|---|---|
| No-sale backfill | Not required for v1 (TAV clears ~97%). Still start pass-on logging day one. |
| Holding cost | Deferred to future development. |
| Market index | Use public Manheim Used Vehicle Value Index first; build internal index later; eventually both. |
| Mileage default | Always have real mileage; if absent, use 15k/yr with a **highly visible** estimate badge. |
| Asking-price treatment | Deal-fit framing — TAV looks for opportunities, not vehicles. |
| Inference infra appetite | Willing to run one small Python service later (Option C is on the table, gated by backtest evidence). |

---

## 8. Punch-list coverage map (all 18 items)

| # | Punch-list item | Lands in |
|---|---|---|
| 1 | Target net gross policy | CHARTER §7 DEC-1; TECHNICAL-SPEC §1.3 (`maxbuy_policy`) |
| 2 | Promotion gate | CHARTER §7 DEC-2; TECHNICAL-SPEC §4 |
| 3 | Decision replay schema | TECHNICAL-SPEC §1.4 (`maxbuy_recommendations`) + §3 |
| 4 | Confidence semantics | CHARTER §4, §7 DEC-3; TECHNICAL-SPEC §2 (API) |
| 5 | Hard gates | CHARTER §7 DEC-4; TECHNICAL-SPEC §5 |
| 6 | Historical field completeness audit | ARCHITECTURE §5 (data-audit spikes); TECHNICAL-SPEC §1.1 (field backfill flags) |
| 7 | Segment support matrix | ARCHITECTURE §5 (min effective N) |
| 8 | Survivorship / pass-on logging | CHARTER §6; TECHNICAL-SPEC §1.5 (`maxbuy_evaluated_passes`) |
| 9 | MMR quality & residuals | ARCHITECTURE §4 (intelligence-worker contract) + §5; TECHNICAL-SPEC §1.4 (MMR fields on replay) |
| 10 | Decay-rate validation | ARCHITECTURE §5 (offline backtest spike) |
| 11 | Offline pipeline operations | ARCHITECTURE §2, §4 (`maxbuy_pipeline_runs`, artifact storage/hash, retry/alert/rollback) |
| 12 | `tav-intelligence-worker` contract | ARCHITECTURE §4; TECHNICAL-SPEC §2 (versioned API contract) |
| 13 | Feature & benchmark versioning | ARCHITECTURE §4; TECHNICAL-SPEC §1.4 (`benchmark_version`) + §3 |
| 14 | Retention split | ARCHITECTURE §4 (retention); TECHNICAL-SPEC §1 (snapshot vs detail) |
| 15 | Override capture | CHARTER §5 KPI-3; TECHNICAL-SPEC §1.6 (`maxbuy_overrides`) |
| 16 | Two-state display | CHARTER §3 (deal-fit); TECHNICAL-SPEC §2 (two-state logic) |
| 17 | Adoption KPIs (now gating) | CHARTER §5.2 |
| 18 | Evaluation rubric refresh | ARCHITECTURE §6 (rubric refresh + adoption-weighted rescore) |
