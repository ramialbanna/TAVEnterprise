# MaxBuy

**Status:** P0–P2 shipped on `main` · **Next:** P5 evaluate API · **Repo prefix:** `TAV-BB`

MaxBuy is TAV's adaptive buybox decision engine: VIN in → expected sale price, net gross, recommended max buy, and an explainable Strong Buy / Buy / Review / Pass verdict.

v1 ships **explainable benchmark math** (segment lookups + max-buy formula), not ML. Shadow ML comes later.

---

## Active docs (start here)

| Doc | When to read it |
|---|---|
| **[`../IMPLEMENTATION-PLAN.md`](../IMPLEMENTATION-PLAN.md)** | **Unified execution plan — progress tracker §2.3** |
| **[`MMR-LAB-MAXBUY-PAGE.md`](MMR-LAB-MAXBUY-PAGE.md)** | **Combined `/mmr-lab` + MaxBuy Cox-style page — UI-first spec** |
| [`STATUS.md`](STATUS.md) | Punch list + what's done / what's next |
| [`DATA-SUMMARY.md`](DATA-SUMMARY.md) | The 57k deal dataset in Supabase — coverage, segments, MMR residuals |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System design: online Worker vs offline Python, Option A/B/C serving |
| [`TECHNICAL-SPEC.md`](TECHNICAL-SPEC.md) | Implement against this: DDL, API contract, replay, gates, promotion |
| [`WORKER-CONTRACT.md`](WORKER-CONTRACT.md) | Pinned MMR contract (`mmr-v1`) from `tav-intelligence-worker` |
| [`reports/10-decay-rate-report.md`](reports/10-decay-rate-report.md) | Chosen decay half-life: **180 days** |

---

## Build sequence (canonical — IMPLEMENTATION-PLAN P0–P10)

| Phase | Focus | Status |
|-------|--------|--------|
| **0** | `purchase_outcomes` schema reconcile | ✅ |
| **1** | λ decay backtest (180d) | ✅ |
| **2** | `maxbuy_*` DDL, benchmark views, `src/maxbuy/scoring/` | ✅ |
| **3** | Intake parse + `entry_method` | ⬜ |
| **4** | Workflow UI shell + MaxBuy card placeholder | ⬜ |
| **5** | `maxbuy-worker` + `POST /maxbuy/evaluate` | ⬜ **Next** |
| **6** | `/maxbuy` + deal detail evaluate live | ⬜ |
| **7–9** | Overrides, async badges, UAT | ⬜ |

Branches used: `TAV-MVP-phase-0-schema-reconcile`, `TAV-BB-phase-1-decay-backtest`, `TAV-BB-phase-2-data-foundation` (all merged to `main`).

---

## Key decisions (already closed)

| Decision | Answer |
|---|---|
| Target net gross (DEC-1) | **$800/unit** company-wide for v1 |
| ML promotion (DEC-2) | Shadow-only until 8-week bid-quality proof + human approval |
| Buyer-facing confidence (DEC-3) | **Data strength** only (`low`/`medium`/`high`); no % confidence in v1 |
| Hard gates (DEC-4) | Title/salvage/flood/structural/odometer/recall/arbitration/source — force PASS |
| Decay λ (Phase 1) | **180 days** — see decay report |

Full charter and punch-list detail: [`../../archive/07-buybox-pre-code/`](../../archive/07-buybox-pre-code/)

---

## Archive

Pre-code audit kits, backfill runbooks, risk register, and stakeholder briefs live under [`../../archive/07-buybox-pre-code/`](../../archive/07-buybox-pre-code/). Kept for audit trail; not needed for day-to-day build work.
