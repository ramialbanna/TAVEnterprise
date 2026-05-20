# MaxBuy — Pre-Code Execution Plan

**What this is / who it's for:** The dev-facing execution plan that operationalizes
[`05-PUNCH-LIST.md`](05-PUNCH-LIST.md). The punch list defines *what* must close
before code; this plan defines *the order the dev works it*, *what is unblocked
today*, *what is blocked on owner/product*, and *where each closed item is
written*. Audience: the solo dev (execution owner). Companion docs:
[`00-LEADERSHIP-BRIEF.md`](00-LEADERSHIP-BRIEF.md) ·
[`01-CHARTER.md`](01-CHARTER.md) · [`02-ARCHITECTURE.md`](02-ARCHITECTURE.md) ·
[`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) ·
[`04-RISK-REGISTER.md`](04-RISK-REGISTER.md).

**Date:** 2026-05-20 · **Status:** Pre-code · **Repo prefix:** `TAV-BB`

---

## 1. Phase boundary — what this phase is and is not

This phase is **MaxBuy pre-code readiness only**. It closes the punch list and
nothing else.

**In scope this phase**
- Owner / product decisions (punch-list items 1, 2, 4, 5).
- Read-only data audits against the existing `tav.*` schema (items 6, 7, 9, 10).
- Architecture spikes that produce documents and throwaway experiments, not
  production code (items 11, 12, 13, 14, 19).
- Workflow / UX decisions and approved mocks (items 15, 16, 17, 18).
- Acknowledgement of the already-specified replay schema and pass-on logging
  design (items 3, 8).

**Explicitly out of scope this phase**
- No `apps/maxbuy/` scaffold or application code.
- No new Supabase migrations, no `tav.maxbuy_*` tables created.
- No new Worker routes or `/app/maxbuy*` API surface.
- No UI.
- No live offline pipeline host provisioning (the pipeline spike chooses and
  smoke-tests; standing infrastructure waits for Phase 1).
- No MarketCheck runtime integration yet. MarketCheck is evaluated as an
  enrichment spike only.

The first line of code is `git checkout -b TAV-BB-phase-1-data-foundation`, and
it is not written until the exit criteria in §3 are all true.

## 2. Hard constraints (carry into every item)

- **Four-concept boundary is preserved.** See §4.
- **No licensed-data leakage.** Manheim / Cox MMR raw payloads
  (`tav.valuation_snapshots.raw_response`, `tav.mmr_queries.mmr_payload`,
  `tav.mmr_cache.mmr_payload`) are licensed. Audits read derived numeric
  columns only. Raw payload JSON is never copied into a committed report, a
  log line, an external service, or a client-facing doc.
- **Every rejection has a `reason_code`.** Any audit query that drops or
  excludes rows documents why. Silent drops are forbidden in analysis the
  same as in the pipeline.
- **Read-only.** Audit and spike work issues `SELECT` only. No `INSERT`,
  `UPDATE`, `DELETE`, `CREATE`, or `ALTER` against any `tav.*` object.

## 3. Exit criteria — "ready to write code"

Restated from [`README.md`](README.md). MaxBuy leaves pre-code when **all**
are true:

1. Items **1, 2, 4, 5** (owner / product blocker decisions) are closed and
   recorded in [`01-CHARTER.md`](01-CHARTER.md) §7 +
   [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md).
2. Items **6, 7, 9, 10** (read-only data audits) are closed with reports
   committed and field/segment tags reconciled against the audit findings.
3. Item **12** (`tav-intelligence-worker` contract pin) is closed with a
   pinned `intelligence_worker_contract_version` and compatibility tests in CI.
4. Items **11, 13, 14** (architecture spikes) are scoped and assigned — the
   spike kits exist — even if the experiments are not yet run.
5. Items **15, 16** (override capture + two-state display) have UI mocks
   approved by product.
6. Items **17, 18** (adoption KPIs + rubric refresh) are closed with KPI
   floor numbers set by the owner.

## 4. Four-concept boundary

The pipeline's four concepts stay distinct and unmodified:

1. **Raw Listing** — `tav.raw_listings`
2. **Normalized Listing** — `tav.normalized_listings`
3. **Vehicle Candidate** — `tav.vehicle_candidates`
4. **Lead** — `tav.leads`

MaxBuy introduces a **fifth, parallel concept — the buy Recommendation** — and
must not merge, rename, or repurpose any of the four.

- MaxBuy **reads** from the outcome / valuation layer that sits *downstream* of
  Lead: `tav.purchase_outcomes`, `tav.historical_sales`,
  `tav.valuation_snapshots`, `tav.mmr_queries`, `tav.mmr_cache`,
  `tav.market_velocities`.
- MaxBuy **writes** only to future `tav.maxbuy_*` tables (a parallel decision
  layer specified in [`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §1).
- MaxBuy **never writes** to `raw_listings`, `normalized_listings`,
  `vehicle_candidates`, or `leads`, and never collapses two pipeline concepts
  into one.
- A MaxBuy Recommendation links to a Vehicle Candidate by id where one exists,
  but it is its own concept: a decision artifact, not a Lead state.

Any audit or spike that appears to need a pipeline-concept change is a stop —
open a plan, do not refactor inline.

## 5. Workstreams

The 19 punch-list items group into five workstreams by who unblocks them.

### WS-A — Owner decisions
Items **1** (target net gross) and **5** (hard gates) — **both closed
2026-05-20**: DEC-1 (v1 company-wide $800 net gross per unit) and DEC-4 (the
force-PASS hard-gate catalog). Decisions recorded in
[`05-PUNCH-LIST.md`](05-PUNCH-LIST.md) §3.

### WS-B — Product decisions
Items **2** (promotion gate) and **4** (confidence semantics) — **both closed
2026-05-20**: DEC-2 (ML stays shadow-only until an 8-week bid-quality proof +
documented human approval) and DEC-3 (`data_strength` only, never percentage
confidence; low data strength caps the verdict at Review). Items **15**
(override capture), **16** (two-state display), **17** (adoption KPIs), **18**
(rubric refresh) remain blocked on Product Mgmt; 15/16 also need approved UI
mocks.

### WS-C — Dev read-only data audits (unblocked today)
Items **6, 7, 9, 10**. No owner/product decision required. Each has a kit
under [`audits/`](audits/) — methodology, copy-paste SQL, and a report
template. The dev runs the SQL against Supabase and commits the report.

### WS-D — Dev architecture spikes (item 12 unblocked today; 11/13/14 scoped)
Items **11, 12, 13, 14**. Item **12** (worker contract pin) has a kit and
starts now — it gates the most downstream work. Items **11, 13, 14** are
scoped (kits to follow) and run in Week 1.

Item **19** (MarketCheck VIN enrichment spike) starts now as a provider-risk
and data-quality spike. It may inform data strength, hard-gate evidence, and
buyer explanation later, but it does not replace MMR, TAV outcomes, or the v1
benchmark recommendation engine.

### WS-E — Acknowledgements (design already done)
Item **3** (decision replay schema) — design is written in
[`03-TECHNICAL-SPEC.md`](03-TECHNICAL-SPEC.md) §1.4 + §3; the dev's remaining
work is the CI replay test (Phase 1). Item **8** (pass-on logging) — table
design done; logging code starts at v1 ship.

## 6. Dependency map

```text
WS-A  item 1  ─┐
               ├─► recommended_max_buy / KPI-5 definable
WS-B  item 4  ─┘

WS-C  item 6  ──► purchase_outcomes field tags (TECH §1.1) ──┐
WS-C  item 7  ──► data_strength routing input               ├─► training base frozen
WS-C  item 9  ──► GATE_YMM_FALLBACK_LOW threshold ──► item 5 ┘
WS-C  item 10 ──► benchmark decay λ ──► benchmark view definitions

WS-D  item 12 ──► safe-persist MMR field list ──► item 3 replay fields (TECH §1.4)
WS-D  item 13 ──► benchmark/feature versioning ──► item 3 replay fields
WS-D  item 11 ──► offline pipeline host ──► Phase 1 training job
WS-D  item 19 ──► optional VIN/spec/listing-history enrichment ──► data_strength / UI context

WS-B  item 2  ──► promotion thresholds ──► depends on items 9, 10 residual numbers
WS-B  item 17 ──► KPI floors ──► depends on item 1 (KPI-5)
```

Reading: the four dev audits (6, 7, 9, 10) and the worker-contract spike (12)
are the critical path — they are unblocked today and feed nearly everything
else. Audit #9 directly informs owner item 5. Audit #10 must land before
benchmark views are defined.

## 7. Phased schedule

### Week 0 (now) — unblock the critical path
- **Owner / Product:** items 1, 2, 4, 5 **closed 2026-05-20** (DEC-1..4).
- **Dev:** execute WS-C audits 6, 7, 9, 10 using the kits in [`audits/`](audits/).
- **Dev:** execute WS-D item 12 worker-contract pin using its kit.
- **Dev:** execute WS-D item 19 MarketCheck enrichment spike using its kit.

### Week 1 — architecture spikes + workflow decisions
- **Dev:** scope and run spikes 11, 13, 14.
- **Dev:** stand up the CI replay test for item 3.
- **Product:** items 15, 16 mocks; items 17, 18 closed with owner KPI floors.

### Week 1 exit — gate check
- Walk the §3 exit criteria. Every box true → branch
  `TAV-BB-phase-1-data-foundation` and begin Phase 1.

## 8. Status table — all 19 items

Legend: **Unblocked** = dev can act now · **In progress** = execution started,
interim report filed · **Blocked-O/P** = waiting on owner/product · **Scoped** =
kit/plan to be written before execution · **Ack** = design done, acknowledgement
or downstream CI work only.

| # | Item | WS | Owner | Status (2026-05-20) | Kit / lands in |
|---|---|---|---|---|---|
| 1 | Target net gross policy | A | O | **Closed — v1 global $800 net per unit** | CHARTER §7; TECH §1.3 |
| 2 | Promotion gate | B | P | **Closed — shadow-only until 8-week bid-quality proof + human approval** | CHARTER §7; TECH §4 |
| 3 | Decision replay schema | E | D | Ack — design done; CI test in Phase 1 | TECH §1.4, §3 |
| 4 | Confidence semantics | B | P | **Closed — data strength only; low caps at Review** | CHARTER §4; TECH §2 |
| 5 | Hard gates | A | O | **Closed — legal/title/source risks force PASS; MMR/YMM weakness routes Review** | CHARTER §7; TECH §5 |
| 6 | Historical field completeness | C | D | **Done — live audit complete (12,904 rows); data-gap findings escalated** | [`audits/reports/06-field-completeness-report.md`](audits/reports/06-field-completeness-report.md) |
| 7 | Segment support matrix | C | D | **Done — live audit complete; training-base decision reopened** | [`audits/reports/07-segment-support-report.md`](audits/reports/07-segment-support-report.md) |
| 8 | Survivorship & pass-on logging | E | D+O | Ack — table design done; logging at v1 | CHARTER §6; TECH §1.5 |
| 9 | MMR quality & residuals | C | D | **Done — quality metrics live; residual backtest blocked on data gap** | [`audits/reports/09-mmr-quality-residual-report.md`](audits/reports/09-mmr-quality-residual-report.md) |
| 10 | Decay-rate validation | C | D | **In progress — plan + status report filed; backtest pending** | [`audits/reports/10-decay-rate-report.md`](audits/reports/10-decay-rate-report.md) |
| 11 | Offline pipeline operations | D | D | Scoped — spike kit to follow | ARCH §4.1; TECH §1.7 |
| 12 | `tav-intelligence-worker` contract | D | D | **In progress — contract pinned (`mmr-v1`); CI compat test pending** | [`audits/reports/12-worker-contract.md`](audits/reports/12-worker-contract.md) |
| 13 | Feature & benchmark versioning | D | D | Scoped — spike kit to follow | ARCH §4.3; TECH §1.2, §1.4 |
| 14 | Retention split | D | D+O | Scoped — spike kit to follow | ARCH §4.4 |
| 15 | Override capture | B | P | Blocked-P — needs UI mock | TECH §1.6 |
| 16 | Two-state display | B | P | Blocked-P — needs UI mock | TECH §2 |
| 17 | Adoption KPIs (gating) | B | P | Blocked-P — needs item 1 (KPI-5) | CHARTER §5.2 |
| 18 | Evaluation rubric refresh | B | P | Blocked-P | ARCH §6 |
| 19 | MarketCheck VIN enrichment spike | D | D | **In progress — interim report filed; live API checks pending** | [`audits/reports/19-marketcheck-spike-report.md`](audits/reports/19-marketcheck-spike-report.md) |

## 9. Audit & spike kit index

The dev-owned, read-only kits started in this phase live under
[`audits/`](audits/):

| Kit | Punch item | Type | Output |
|---|---|---|---|
| [`06-field-completeness-audit.md`](audits/06-field-completeness-audit.md) | 6 | Data audit | Per-field null-rate table; field tags |
| [`07-segment-support-matrix.md`](audits/07-segment-support-matrix.md) | 7 | Data audit | Segment row-count matrix; minimum-N policy |
| [`09-mmr-quality-residual-audit.md`](audits/09-mmr-quality-residual-audit.md) | 9 | Data audit | VIN/YMM rates; residual-by-segment report |
| [`10-decay-rate-validation-plan.md`](audits/10-decay-rate-validation-plan.md) | 10 | Spike plan | λ-grid backtest design |
| [`12-worker-contract-pinning-plan.md`](audits/12-worker-contract-pinning-plan.md) | 12 | Spike plan | Contract pin + compatibility-test design |
| [`19-marketcheck-vin-enrichment-spike.md`](audits/19-marketcheck-vin-enrichment-spike.md) | 19 | Provider spike | MarketCheck endpoint, quality, cost, rate-limit, and safe-persist decision |

Each kit is read-only: it specifies queries and methodology. No kit creates
code, migrations, or schema.

Reports are committed under [`audits/reports/`](audits/reports/). As of
2026-05-20: item 12 is fully executed (contract `mmr-v1` pinned from worker
source); items 6, 7, 9 have completed live read-only Supabase audits — the
runs surfaced material data gaps (`purchase_outcomes` has no purchase date, no
mileage, and no MMR / pipeline linkage), escalated in their reports; item 10
carries the backtest status; item 19 carries the design-level findings with
live-API checks pending TAV account access.

## 10. Definition of done for this plan

This execution plan is "done" when the §8 status of every item is **Closed**
and the §3 exit criteria all hold. At that point this document is the
historical record of the pre-code phase and Phase 1 begins.
