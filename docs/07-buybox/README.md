# MaxBuy

**Status:** Pre-code complete · Phase 1 ready to start · **Repo prefix:** `TAV-BB`

MaxBuy is TAV's adaptive buybox decision engine: VIN in → expected sale price, net gross, recommended max buy, and an explainable Strong Buy / Buy / Review / Pass verdict.

v1 ships **explainable benchmark math** (segment lookups + max-buy formula), not ML. Shadow ML comes later.

---

## Active docs (start here)

| Doc | When to read it |
|---|---|
| **[`../IMPLEMENTATION-PLAN.md`](../IMPLEMENTATION-PLAN.md)** | **Unified execution plan — MaxBuy + workflow/UI redesign (point Cursor here)** |
| [`STATUS.md`](STATUS.md) | What's done, what's blocking Phase 1, exit criteria |
| [`DATA-SUMMARY.md`](DATA-SUMMARY.md) | The 57k deal dataset in Supabase — coverage, segments, MMR residuals |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System design: online Worker vs offline Python, Option A/B/C serving |
| [`TECHNICAL-SPEC.md`](TECHNICAL-SPEC.md) | Implement against this: DDL, API contract, replay, gates, promotion |
| [`WORKER-CONTRACT.md`](WORKER-CONTRACT.md) | Pinned MMR contract (`mmr-v1`) from `tav-intelligence-worker` |

---

## Build sequence (short)

1. **Phase 1 — Data foundation** — benchmark SQL views, decay λ, schema migrations for `tav.maxbuy_*`
2. **Phase 2 — MVP API** — `POST /maxbuy/evaluate`, immutable snapshots, hard gates
3. **Phase 3 — UI** — `/maxbuy` page + deal-detail evaluate (see [`../02-product/workflow-and-ui-redesign.md`](../02-product/workflow-and-ui-redesign.md))
4. **Phase 4+ — Shadow ML** — weekly Python pipeline; buyers never see ML until promotion gate passes

First code branch: `TAV-BB-phase-1-data-foundation`

---

## Key decisions (already closed)

| Decision | Answer |
|---|---|
| Target net gross (DEC-1) | **$800/unit** company-wide for v1 |
| ML promotion (DEC-2) | Shadow-only until 8-week bid-quality proof + human approval |
| Buyer-facing confidence (DEC-3) | **Data strength** only (`low`/`medium`/`high`); no % confidence in v1 |
| Hard gates (DEC-4) | Title/salvage/flood/structural/odometer/recall/arbitration/source — force PASS |

Full charter and punch-list detail: [`archive/pre-code/`](archive/pre-code/)

---

## Archive

Pre-code audit kits, backfill runbooks, risk register, and stakeholder briefs live under [`archive/pre-code/`](archive/pre-code/). Kept for audit trail; not needed for day-to-day build work.
