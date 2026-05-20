# MaxBuy — Leadership Brief

**Date:** 2026-05-20 · **Status:** Approved direction · **Repo prefix:** `TAV-BB` · **Working name:** MaxBuy
**Audience:** TAV ownership, operators, implementation leads
**Companion docs:** [`01-CHARTER.md`](01-CHARTER.md) · [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) · [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) · [`04-RISK-REGISTER.md`](04-RISK-REGISTER.md) · [`05-PUNCH-LIST.md`](05-PUNCH-LIST.md)

---

## Executive summary

MaxBuy is TAV's internal adaptive **buybox decision engine**: a VIN-first tool that, given an optional mileage and optional asking price, predicts **TAV's own sale price**, expected net gross, and a **recommended max buy**, and returns an explainable Strong Buy / Buy / Review / Pass verdict at the lane.

The first release ships **explainable benchmark intelligence before live ML** — recency-weighted internal comps, transport and expense modeling, max-buy math, and a buyer-readable verdict. A gradient-boosted model trains in parallel in **shadow mode**, and reaches production only after passing a defined governance gate.

The goal is not to replace Manheim MMR with another generic book. The goal is to answer TAV's actual operating question:

> **What will we sell this vehicle for, what will it cost us, and what is the most we should pay?**

## Strategic positioning

MMR remains the external wholesale anchor. MaxBuy's proprietary edge is learning **how TAV performs against MMR** by segment, channel, region, expense load, and velocity — and correcting for the per-segment bias MMR carries against TAV's actual portfolio.

The core math (validated by fixed worked examples — see [`01-CHARTER.md`](01-CHARTER.md) §5.1 AC-3):

```text
expected_sale_price   = current_mmr × expected_sale_pct_mmr
expected_net_gross    = expected_sale_price − purchase_or_ask − expected_transport − expected_expenses
recommended_max_buy   = expected_sale_price − target_net_gross  − expected_transport − expected_expenses
```

The primary learning target is **sale price as a percentage of MMR**, not raw dollars — this normalizes against wholesale market movement so MaxBuy adapts when the market rises or falls. v2 ML training also evaluates a **residual-dollar target** in parallel to detect MMR bias at price extremes ([`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) §3).

## What TAV already has (the unfair advantage)

- **18 months of clean buy/sell history** — TAV buy price, sell price, gross, transport expense, day-of MMR, purchase city/state.
- **Live MMR access** via the existing `tav-intelligence-worker` (VIN-first, YMM fallback, cached).
- **TAV-AIP spine** — Supabase, Cloudflare Workers, Google-authenticated web app, Opportunities workflow.
- **Cleaner labeled data than the marketplace-leads side of TAV-AIP** — every acquisition has a sale outcome.

This is enough to build the explainable v1 today and to begin training shadow ML sooner than other TAV-AIP modules.

## What's missing (and what we're going to do about it)

The highest-impact gaps are fields that prevent biased predictions or hide true net economics. Each is closed by a punch-list item in [`05-PUNCH-LIST.md`](05-PUNCH-LIST.md).

| Gap | Why it matters | Closed by |
|---|---|---|
| No-sale / loss / still-in-stock outcomes | Training only on clean sales overpredicts performance (survivorship bias). TAV clears ~97%, so this is lower priority, but still tracked. | Punch #8 |
| **Target net gross policy** | Without a required-net number, `recommended_max_buy` is undefined. | Punch #1 (**DEC-1 — owner**) |
| Condition / CR grade / announcements / title risk | Major price + risk drivers; some are hard gates, not features. | Punch #5 (**DEC-4 — owner**); Tech Spec §5 |
| Sale channel + location | In-lane, OVE, simulcast, location clear differently. | Tech Spec §1.1 |
| Holding cost + days-to-sale | Slow-turn vehicles erode net even with attractive gross. | Holding cost deferred; days-to-sale captured |
| Expense breakdown | Lumped expenses hide recon-heavy segments. | Tech Spec §1.1 `expense_breakdown` |
| Market trend feature | MMR controls level, not direction. | Public Manheim Index first; internal index later |
| Buyer identity, acquisition provenance, vehicle history | Without these the model attributes buyer skill or source risk to segment. | Tech Spec §1.1 |
| Pass-on logging (evaluated-but-not-bought) | Model can predict performance given a buy, not whether passed cars were good buys. v1/v2 are scoped explicitly as **bought-unit models**. | Tech Spec §1.5 |
| MMR quality (VIN-vs-YMM, cache age, missing reason) | YMM fallback can masquerade as full confidence. | Tech Spec §1.4 |

**The two launch-critical fills are complete outcome capture and a market-trend feature.** Without them MaxBuy will look smarter than it is in a rising market and too optimistic on segments where TAV tends to hold or lose.

## What the v1 buyer actually sees (the useful sentence)

> **"MMR says $18,000. TAV usually clears this segment at 97% of MMR after ~$1,100 transport/recon. Recommended max buy: $15,530. Verdict: BUY. Data strength: high."**

If the UI only says "101% of MMR, Strong Buy, 82% confidence," it's dressed-up MMR and buyers will ignore it. The reason codes, the comp summary, and the data-strength label are not optional — they are the product.

## Build plan (6 phases, each with an exit gate)

| Phase | What ships | Exit gate before next phase |
|---|---|---|
| **0. Pre-code** | Owner decisions DEC-1…DEC-4 confirmed; data audits #6, #7, #9, #10 completed; worker contract pinned (#12). | All five blocker decisions resolved; audit reports produced. |
| **1. Data foundation** | `tav.purchase_outcomes` extended; benchmark views; segment support matrix; λ-grid backtest. | Null-rate audit, segment matrix, and MMR residual audit signed off. |
| **2. Explainable MaxBuy MVP (Option A serving)** | API Worker, hard gates, immutable recommendation snapshots, override capture, evaluated-pass logging, Strong Buy / Buy / Review / Pass verdict. | **KPI-1 buyer lookup rate ≥ owner-set floor (default ≥ 90%)** measured over 4 weeks. |
| **3. Opportunity creation** | Create-Opportunity hand-off preserving the full snapshot. | AC-6 = 100% snapshot retention on Opportunity creation. |
| **4. ML shadow model (Option B1)** | Offline Python pipeline, model registry, backtests; **no buyer-facing ML output**. | DEC-2 promotion gate parameters defined; backtest framework producing reports. |
| **5. Governance loop + promotion** | Champion/challenger; rolling-holdout backtest; segment guardrails; recorded manual approval; rollback-to-prior. | KPI-4 MAPE ≤ owner-defined threshold; no high-volume segment regression. |
| **6. Hybrid (Option C) — only if earned** | Per-VIN inference service layered behind the benchmark base, evaluated on **decision metrics** (gross-hit, max-buy regret), not just MAE. | Backtests beat Option B1 on decision metrics with no high-volume segment regression. |

## Acceptance criteria — leadership review

MaxBuy is ready for leadership review when **all of the following hold** (full criteria in [`01-CHARTER.md`](01-CHARTER.md) §5):

**Build / correctness (pass/fail):**
- A user can enter a VIN and read **why** the result is Strong Buy / Buy / Review / Pass (reason codes + comp summary).
- Every recommendation includes expected sale price, net gross, recommended max buy, data-strength, reason codes, and the benchmark/model version.
- Fixed worked examples reproduce the max-buy math exactly (e.g. MMR 18,000 → max buy 15,530).
- Historical backtests compare benchmark recommendations against actual sale outcomes by segment and sale week.
- ML output remains shadow-only until it passes the promotion gate.
- Opportunity creation preserves the full immutable snapshot.
- A past recommendation can be **reconstructed exactly** from pinned versioned inputs (decision replay).
- No secrets, licensed valuation figures, or raw Manheim payloads are committed, logged, or pasted.

**Adoption (gating, not monitoring):**
- KPI-1 buyer lookup rate ≥ owner-set floor.
- KPI-3 override rate + reason distribution monitored; sustained "Bought despite Pass" triggers investigation.
- KPI-4 actual-vs-predicted MAPE ≤ owner-set threshold (master spec proposes <4.2%; validate on real backtest first).

## Decisions required from ownership (4 items, ~1 hour each)

The following block code. They are detailed in [`01-CHARTER.md`](01-CHARTER.md) §7 and tracked in [`05-PUNCH-LIST.md`](05-PUNCH-LIST.md) items 1–5.

| ID | Decision | Owner | Recommended default |
|---|---|---|---|
| **DEC-1** | Target net gross policy: company-wide default, versioning, and who can change it. | TAV Ownership | **Confirmed:** v1 starts with one company-wide default of **$800 net per unit**, versioned in policy. Segment/source variation comes later. |
| **DEC-2** | Promotion gate: proof required before ML can become buyer-facing. | Product Mgmt | **Confirmed:** ML stays shadow-only until it proves over at least **8 recent sale weeks** that it improves max-buy decisions versus the benchmark by protecting the **$800 target net gross**, reducing overbid/loss cases, and avoiding regression in major vehicle segments. Promotion requires documented human approval. |
| **DEC-3** | Confidence semantics: display "confidence" or "data strength"? | Product Mgmt | **Confirmed:** use **data strength** only. Never show percentage-style confidence in v1. Low data strength caps the verdict at Review and cannot produce Buy or Strong Buy. |
| **DEC-4** | Hard gates catalog: which conditions are absolute exclusions vs low-confidence review? | TAV Ownership | **Confirmed force-PASS gates:** branded title including rebuilt/lemon/manufacturer buyback, salvage, flood, frame/structural damage, odometer rollback/discrepancy/not-actual miles, open recall/stop-sale when available, arbitration or adverse announcement flags, and source restrictions. |

## Decisions already settled (do not re-litigate)

| Topic | Settled answer |
|---|---|
| No-sale backfill | Not required for v1 (TAV clears ~97%). Pass-on logging still begins day one. |
| Holding cost | Deferred. |
| Market index | Public Manheim Used Vehicle Value Index first; internal index later. |
| Mileage default | Real mileage where present; if absent, 15k/yr with a highly visible estimate badge. |
| Asking-price treatment | Deal-fit framing — TAV looks for opportunities, not vehicles. |
| Inference infra appetite | Willing to run one small Python service later (Option C is on the table, gated by backtest evidence). |

## Interfaces and architecture (one-paragraph version)

MaxBuy is **standalone but not isolated**: its own deployable, reusing the TAV-AIP spine. It is a **separate Cloudflare Worker** that exposes one endpoint (`POST /maxbuy/evaluate`); it **reuses** the existing `tav-intelligence-worker` for MMR (VIN-first, YMM fallback, KV cache, contract version-pinned), **reuses Supabase** with new tables added under the `tav` schema (additive — no breaking changes), and **reuses Google-domain auth**. The only genuinely new infrastructure is an **offline scheduled Python pipeline** (cron-style; Cloud Run / Fly / Modal) that weekly ingests sale outcomes, rebuilds versioned feature/benchmark views, trains the shadow GBM, runs backtests, and produces a hashed artifact. Buyer-facing Worker code never trains. Full details in [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md).

## What's deferred (do not scope-creep)

- Per-VIN live inference (Option C) — only after backtests prove it beats segment lookups on decision metrics.
- Holding-cost-per-day subtraction from net — owner deferred.
- TAV's own market-drift index — public Manheim Index ships first.
- Pass-on / counterfactual buy-decision learning — pass-on *logging* begins day one for future use.
- Probability-style confidence display — banned until empirical coverage test (80% interval contains actual ~80% of time) passes.
- Generic public buybox; static preferred-make/model/region filters; replacing MMR as a market source.

## External references

- [Manheim Used Vehicle Value Index](https://site.manheim.com/en/services/consulting/used-vehicle-value-index.html)
- [XGBoost documentation](https://xgboost.readthedocs.io/en/stable/index.html)
- [LightGBM documentation](https://lightgbm.readthedocs.io/en/stable/index.html)
