# MaxBuy — Documentation Set

**Date:** 2026-05-20 · **Status:** Pre-code · **Repo prefix:** `TAV-BB`

MaxBuy is TAV's internal adaptive buybox decision engine — a VIN-first tool that predicts TAV's own sale price, expected net gross, and a recommended max buy, returning an explainable Strong Buy / Buy / Review / Pass verdict at the lane.

This folder is the **complete pre-code documentation set**. It is the synthesis of two earlier solution drafts, retaining the engineering rigor of one and the discovery / ownership framing of the other. Nothing in `apps/maxbuy/*` ships until every item in [`05-PUNCH-LIST.md`](05-PUNCH-LIST.md) is closed.

## Core documents

| # | Document | Audience | When to read it |
|---|---|---|---|
| 00 | [`00-LEADERSHIP-BRIEF.md`](00-LEADERSHIP-BRIEF.md) | TAV ownership, operators, implementation leads | Start here. The executive-readable strategic doc — what MaxBuy is, what TAV has, what's missing, the 6-phase plan, the four owner decisions. |
| 01 | [`01-CHARTER.md`](01-CHARTER.md) | Owner + product + dev | Mission, scope, non-goals, **measurable acceptance criteria** (AC-1…8 + KPI-1…5 with adoption KPIs promoted to launch-gating), and the four owner decisions (DEC-1…4). |
| 02 | [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) | Dev + reviewer | System context, online/offline split, **serving decision A/B/C** with recommendation (v1=A, v2=B1, C earned), offline pipeline operations, retention split, architecture risks. |
| 03 | [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) | Dev (implementer) | The engineering contract: **full SQL DDL** for `tav.*` extensions, versioned serving API, decision-replay mechanics, promotion/governance, hard-gate catalog. Implementable as written. |
| 04 | [`04-RISK-REGISTER.md`](04-RISK-REGISTER.md) | Reviewer, future auditor | All 18 risks (R1–R18) across 5 reviewer lenses (DS / ARCH / BA / METHOD / COMPLIANCE), with severity, reviewer confidence, mitigation, and landing page. Includes the top-5 blockers. |
| 05 | [`05-PUNCH-LIST.md`](05-PUNCH-LIST.md) | Execution owner (the dev) | The **ordered 18-item execution checklist** with owner column, category, closed risks, landing page, and definition of done. The release-blocking checklist. |
| 06 | [`06-EXECUTION-PLAN.md`](06-EXECUTION-PLAN.md) | Dev + orchestrator | Pre-code execution order, status table, workstreams, and audit/spike kit index. |

## Audit and spike kits

| Kit | Purpose |
|---|---|
| [`audits/06-field-completeness-audit.md`](audits/06-field-completeness-audit.md) | Read-only `purchase_outcomes` null-rate and field-availability audit. |
| [`audits/07-segment-support-matrix.md`](audits/07-segment-support-matrix.md) | Segment support and fallback-matrix audit. |
| [`audits/09-mmr-quality-residual-audit.md`](audits/09-mmr-quality-residual-audit.md) | MMR quality and residual audit without licensed raw payload leakage. |
| [`audits/10-decay-rate-validation-plan.md`](audits/10-decay-rate-validation-plan.md) | Recency-decay backtest plan. |
| [`audits/12-worker-contract-pinning-plan.md`](audits/12-worker-contract-pinning-plan.md) | `tav-intelligence-worker` MMR contract pinning plan. |
| [`audits/19-marketcheck-vin-enrichment-spike.md`](audits/19-marketcheck-vin-enrichment-spike.md) | MarketCheck VIN enrichment spike plan. |
| [`audits/20-historical-outcome-backfill-plan.md`](audits/20-historical-outcome-backfill-plan.md) | Phase 0 plan to load known external outcome fields before Phase 1 code. |

## How to read the set

- **If you have 5 minutes:** read [`00-LEADERSHIP-BRIEF.md`](00-LEADERSHIP-BRIEF.md) only.
- **If you're an owner being asked to decide something:** read [`00-LEADERSHIP-BRIEF.md`](00-LEADERSHIP-BRIEF.md) + [`01-CHARTER.md`](01-CHARTER.md) §7 + the four items in [`05-PUNCH-LIST.md`](05-PUNCH-LIST.md) marked **O** (1, 5, parts of 8, parts of 14).
- **If you're product:** read [`01-CHARTER.md`](01-CHARTER.md) end to end + the items in [`05-PUNCH-LIST.md`](05-PUNCH-LIST.md) marked **P** (2, 4, 15, 16, 17, 18).
- **If you're the dev:** read the core docs in order. [`06-EXECUTION-PLAN.md`](06-EXECUTION-PLAN.md) is the day-one plan.
- **If you're reviewing this:** [`04-RISK-REGISTER.md`](04-RISK-REGISTER.md) §2 (top-5 blockers) and §4 (severity/lens matrix) are the fastest read.

## What's outside this folder (deferred but referenced)

- **Per-VIN live inference (Option C)** — only after Phase 5 backtests prove it beats segment lookups on **decision metrics**, not just sale-price MAE. See [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) §3.
- **Holding-cost-per-day** — owner deferred. See [`01-CHARTER.md`](01-CHARTER.md) §7.
- **Internal market-drift index** — public Manheim Used Vehicle Value Index ships first. See [`01-CHARTER.md`](01-CHARTER.md) §7.
- **Pass-on counterfactual learning** — v1/v2 are explicitly bought-unit models. Pass-on *logging* begins day one; learning is v3+. See [`01-CHARTER.md`](01-CHARTER.md) §6 + [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §1.5.
- **Probability-style confidence display** — banned until empirical coverage test passes. See [`01-CHARTER.md`](01-CHARTER.md) §4.
- **MarketCheck as a hard dependency** — deferred until the VIN enrichment spike proves account entitlements, data quality, rate/cost profile, caching rights, and safe-persist fields. See [`audits/19-marketcheck-vin-enrichment-spike.md`](audits/19-marketcheck-vin-enrichment-spike.md).

## Source provenance

This set supersedes the following prior drafts (kept in repo history for reference):
- `maxbuy-leadership-brief.md` — folded into `00-LEADERSHIP-BRIEF.md`
- `buybox-best-in-class-spec.md` — folded into `02-ARCHITECTURE.md` + `03-TECHNICAL-SPEC.md`
- `buybox-solution-evaluation.md` — re-run prescribed in [`05-PUNCH-LIST.md`](05-PUNCH-LIST.md) #18
- `product-direction.md` — folded into `00-LEADERSHIP-BRIEF.md` and `01-CHARTER.md`
- `maxbuy-design-stress-test-review.md` — folded into `04-RISK-REGISTER.md` (with the original per-bet verdict table preserved in repo history)
- `maxbuy-pre-code-punch-list.md` — superseded by `05-PUNCH-LIST.md` (this version adds owner column, closes-risks column, landing-page column, and definition-of-done column)

## Definition of "ready to write code"

MaxBuy is ready to leave pre-code when all of the following are true:

1. [`05-PUNCH-LIST.md`](05-PUNCH-LIST.md) items 1, 2, 4, 5 (owner/product decisions) are closed.
2. [`05-PUNCH-LIST.md`](05-PUNCH-LIST.md) items 6, 7, 9, 10 (read-only data audits) are closed with reports committed.
3. [`05-PUNCH-LIST.md`](05-PUNCH-LIST.md) item 12 (worker contract pin) is closed with compatibility tests in CI.
4. Items 11, 13, 14 (architecture spikes) are scoped and assigned, even if not yet executed.
5. Items 15, 16 (override capture + two-state display) have UI mocks approved by product.
6. Items 17, 18 (adoption KPIs + rubric refresh) are closed with KPI floors set by owner.
7. MarketCheck remains optional unless the spike proves it should be enabled; MaxBuy must still work when MarketCheck is unavailable.
8. If the missing historical outcome fields exist outside the database, the
   Phase 0 backfill gate in [`audits/20-historical-outcome-backfill-plan.md`](audits/20-historical-outcome-backfill-plan.md)
   is closed and audits 6, 7, 9, and 10 are re-run against the enriched data.

At that point, `git checkout -b TAV-BB-phase-1-data-foundation` and start work.
