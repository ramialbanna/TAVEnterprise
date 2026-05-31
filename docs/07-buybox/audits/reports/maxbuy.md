# MaxBuy — Historical Outcome Backfill & Source of Truth (Phase 0)

**What this is / who it's for:** The record of the **Phase 0 historical outcome backfill** — how 18 months of TAV sale outcomes were reconstructed from fragmented department spreadsheets into one keyed, deduplicated dataset that loads into `tav.purchase_outcomes`. It documents the source corpus, the lifecycle stitch, the output schema, the field-by-field completeness results (the deliverable Audit Kit 06 was waiting on), and what is recoverable vs structurally absent. Audience: the solo dev (data owner) and reviewers. Companion docs: [`00-LEADERSHIP-BRIEF.md`](../../00-LEADERSHIP-BRIEF.md) · [`03-TECHNICAL-SPEC.md`](../../03-TECHNICAL-SPEC.md) · [`05-PUNCH-LIST.md`](../../05-PUNCH-LIST.md) · [`06-EXECUTION-PLAN.md`](../../06-EXECUTION-PLAN.md) · [`audits/06-field-completeness-audit.md`](../06-field-completeness-audit.md).

**Date:** 2026-05-22 · **Status:** Backfill complete — pending load into `tav` schema · **Repo prefix:** `TAV-BB`

> **Why this exists:** [`05-PUNCH-LIST.md`](../../05-PUNCH-LIST.md) item 20 and [`06-EXECUTION-PLAN.md`](../../06-EXECUTION-PLAN.md) made a **Phase 0 historical outcome backfill gate** the prerequisite to Phase 1 code: ownership confirmed the history exists *outside* the DB (department spreadsheets), and audits 6/7/9 can't run until it's staged. This document is that backfill, executed. It produces the rows and the per-field completeness needed to close item 20 and execute Audit Kit 06 / R17.

---

## 1. Outcome

A single canonical dataset — **57,228 sold vehicle-cycles, Oct 2024 → May 2026** — stitched from six source types and keyed for clean re-loads.

- 53,598 distinct VINs · **2,868 re-entries** (arbitration buy-backs) split into separate cycles so each cycle carries its own cost stack.
- Labels are complete and trustworthy: **price paid, sale price, gross, mileage = 100%** (iDMS system-of-record), independently reconciled against Manheim.
- Deliverables live in `…/Data for BuyBox - IDMS Reports/BuyBox Output/` (data folder, not this repo): `buybox_master.csv` (48-col canonical), `tav_import_full.csv` (model-shape), `coverage_by_month.csv`, `FULL_18mo_QA.md`, and the Supabase schema/load SQL (see §9).

**Survivorship caveat (R3/R4):** every backfill row is a unit TAV **bought and sold**. There are no `no_sale` / pass-on / counterfactual rows — those are `future-only` (logging starts day one per [`03-TECHNICAL-SPEC.md`](../../03-TECHNICAL-SPEC.md) §1.5). The backfill is a bought-unit dataset by construction, consistent with the v1/v2 scope.

## 2. Source corpus & lifecycle stages

A unit moves through stages, and each department's sheet captures a different stage — they are complementary, not duplicates. The stitch is a **lifecycle assembly on VIN + cycle**, with conflict reconciliation only on the few fields that genuinely overlap.

| Stage | Source (files) | Contributes |
|---|---|---|
| 1. Purchase initiated / buy-side | **Daily Car List (DCL)** — 10 workbooks (heavily duplicated; ~90,261 buy-side VINs) | MMR-at-buy, buyer, closer, deal type, `cot_city/state`, `DEALER SOLD TO` |
| 2. Bought & inventoried | **iDMS Sales Reports** — 21 files (19 used, 2 byte-identical dupes auto-skipped) | the spine: cost, sale price, gross/net, dates, mileage, days-on-lot, expenses, trim, body style |
| 3. Sales day / condition | **Game Day** — 7 sources (incl. a 368-tab "Missing Dates" workbook + single-week sheets); 71,006 VINs graded | condition grade (`CR`), `Prev Arb`→consignor, `S`→title/collection status; `UNWINDS` → arbitration |
| 4. Sold (at auction) | **Manheim** — Buyer Detail (Detail format) + **Selling Summary**; 35,869 VINs | realized sale price + **seller fee** (`Tot Exp` → `auction_fee`) |
| — | **StatesRegions** | state → US region map (drives `region`) |
| — | **Lane Attendance** | standalone analytics — **not** stitched into the per-vehicle record |

**Skipped, with reason (35 files):** Manheim **Summary-format PDFs** (buyer counts, no VIN/price), `Performance_Analysis` / `Client_AR` PDFs, `New_Buyers` variants, duplicate `Selling_Summary` PDFs, and a 0-byte upload (its CSV twin was used). Every file in the directory is accounted for as used or skipped-with-reason.

## 3. Pipeline

Python (calamine for fast xlsx), six stages, fully re-runnable:

```
parse (per source) → normalize (VIN/date/$/people) → stitch (VIN + cycle, nearest-date)
   → reconcile (precedence + completeness flags) → conform (model shape) → load (Postgres upsert)
```

Scripts: `rebuild_gameday.py`, `dcl_full.py`, `manheim_parse.py`, `build_full.py`, `conform_to_import.py`, `build_master.py`. **Open item:** these currently live in a working scratch area, not the repo — see §11.

Key engineering choices:
- **Cycle key** = VIN + acquisition-date order; `display_id = VIN_N`. iDMS rejects duplicate VINs, so re-entries surface as new acquisitions; the stitch counts them as distinct cycles (verified — e.g. one VIN with three legitimate `_1/_2/_3` cycles, each its own buy/sell).
- **Enrichment matched by nearest date** (DCL → purchase date; Manheim → sale date) so re-entries attach to the correct cycle.
- **Duplicate iDMS export files** removed by content signature (row count + VIN set + acq range + sale-price sum), not by filename.

## 4. Mapping to `tav.purchase_outcomes`

The backfill columns map onto the existing `tav.purchase_outcomes` baseline (per [`audits/06-field-completeness-audit.md`](../06-field-completeness-audit.md) §3) plus the [`03-TECHNICAL-SPEC.md`](../../03-TECHNICAL-SPEC.md) §1.1 additions. Measured fill rate is over all 57,228 rows.

| `tav.purchase_outcomes` field | Backfill source | Fill | §1.1 tag — confirmed / updated |
|---|---|---|---|
| `vin`, `year`, `make`, `model` | iDMS | 100% | confirmed |
| `mileage` / `odometer_at_purchase` | iDMS Mileage | 100% | confirmed (authoritative: `mileage`) |
| `purchase_date` | iDMS Acquired Date | 100% | confirmed |
| `price_paid` (vs `purchase_price`) | iDMS Acquired Price | 100% | **authoritative = `price_paid`** |
| `sale_price` | iDMS Sales Price | 100% | confirmed backfillable |
| `gross_profit` (vs `gross_profit_est`) | iDMS | 100% | **authoritative = `gross_profit`** |
| `net_gross` | iDMS Net Profit | 100% | confirmed (derivable) |
| `mmr_value_at_purchase` | DCL / Game Day MMR | **92%** | confirmed backfillable |
| `hold_days` / `days_to_sale` | iDMS Days On Lot | ~100% | confirmed |
| `misc_overhead` | derived: `sale − price − gross` | 100% | confirmed (= total expense load) |
| `auction_fee` | Manheim `Tot Exp` | **66%** | backfillable-**partial** (Jan-2025+; see §7) |
| `transport_cost` | — not itemized in any source | 0% | **unavailable** in backfill (only aggregate `misc_overhead`) → `future-only` |
| `condition_grade_raw` | Game Day `CR` | **90%** | **UPDATE §1.1: backfillable, not unavailable** — CR is mandatory on Manheim sales; see §6 |
| `condition_grade_normalized` | derive from raw | — | derived |
| `purchase_channel` / `selling_channel` | iDMS / DCL | high | confirmed |
| `sale_channel` | derived: Manheim vs Direct | 100% | **coarser than §1.1 enum** (`in_lane/ove/…`) — needs refinement, see §11 |
| `week_label` | ISO week of sale date | 100% | confirmed |
| `buyer_id` | DCL / Game Day | **87%** | **UPDATE: backfillable** (audit §6 expected `unavailable` pre-migration) |
| `closer_id` | DCL | **81%** | **UPDATE: backfillable** |
| `cot_city` / `cot_state` | DCL (state abbreviated) | 80% / 78% | **UPDATE: backfillable** |
| `region` | StatesRegions (US region) | 78% | confirmed (note: US region, not TX-metro) |
| **`trim`** | iDMS Exterior Trim | high | **UPDATE: refutes audit §6 finding #1** — trim *is* available from iDMS, not absent |
| `lead_id`, `vehicle_candidate_id` | — | NULL | **unavailable** for history (no Lead/Candidate on CSV imports) — confirms audit §6 #3 |
| `outcome` | all rows = `sold` | 100% | backfill is sold-only (R3/R4) |
| `source` / provenance | `source_system`, `source_file`, `import_batch` | 100% | added |

The backfill also carries fields beyond the baseline that are useful for QA/feature work: `consignor_dealer`, `dealer_sold_to`, `title_collection_status`, `arbitration_flag`, `price_vs_mmr`, `sale_price_manheim`, `cycle_seq`/`display_id`, and the completeness flags (§6).

## 5. Reconciliation / derivation rules

- **Sale price reconciles deterministically.** Where both iDMS and Manheim carry a sale price, the gap **equals the Manheim seller fee in 92% of cases** — `iDMS Sales Price ≈ Manheim Purch Pr − Tot Exp`. A known offset, not a conflict; the label is trustworthy.
- `misc_overhead = sale_price − price_paid − gross_profit` (validated 100%).
- `week_label` = ISO week of **sale** date · `cot_city/state` = DCL meeting location (state abbreviated) · `region` = `StatesRegions[cot_state]`.
- `arbitration_flag` from Game Day `UNWINDS` tabs only (the `Prev Arb` column is a **consignor/dealer name**, not a flag — corrected).

## 6. Channel-aware completeness (the key reliability nuance)

Manheim **requires** a CR on every lane sale; **direct-to-dealer sales** (e.g. Toyota of Richardson) never have one. So a missing CR is only a gap when the unit went through Manheim. Three flags encode this:

- **`sale_channel`** — Manheim **96%** · Direct-to-dealer **4%**
- **`condition_status`** — `present` **90%** · `na_direct` (legitimately no CR) **3%** · `missing_expected` (Manheim sale, CR not yet matched — recoverable) **7%**
- **`data_quality`** — high **86%** · medium **12%** · low **2%** (only penalizes fields *expected* for that unit's channel)

Net: condition is **~93% as complete as it can be**; the 7% `missing_expected` is recoverable with more Game Day matching, not structurally absent. **Modeling guidance:** keep all rows; use `sale_channel` + `condition_status` as features. Do **not** drop incomplete rows — the missingness is channel-correlated and dropping biases toward Manheim-lane behavior. For a clean core, filter `data_quality = 'high'` (~49k rows).

## 7. Coverage by month

| Month | Units | DCL% | Cond% | MMR% | Manheim/fee% |
|---|---|---|---|---|---|
| 2024-10 | 2,703 | 81 | 81 | 76 | 1 |
| 2024-11 | 2,392 | 83 | 76 | 70 | 3 |
| 2024-12 | 2,491 | 82 | 73 | 79 | 18 |
| 2025-01 | 2,603 | 82 | 80 | 90 | 85 |
| 2025-02 | 2,472 | 90 | 68 | 91 | 84 |
| 2025-03 | 3,121 | **8** | 93 | 82 | 84 |
| 2025-04 → 2025-11 | ~3,000/mo | 83–89 | 94–96 | 95–97 | 84–89 |
| 2025-12 | 2,694 | 86 | 93 | 95 | 72 |
| 2026-01 | 2,700 | 94 | 94 | 94 | 58 |
| 2026-02 | 3,062 | 93 | 94 | 94 | **11** |
| 2026-03 | 4,151 | 81 | 92 | 94 | 59 |
| 2026-04 | 3,389 | 87 | 94 | 95 | 73 |
| 2026-05 | 1,673 | 87 | 95 | 96 | 60 |

Recent window (Apr-2025+, 41,446 rows) is **91% full-core** and is the most representative of current operations.

## 8. Known gaps & recoverability

| Gap | Effect | Recoverable? |
|---|---|---|
| **March 2025 DCL** corrupted/unrecoverable | buy-side thin that month (DCL 8%, MMR 57%) | No — file is gone |
| **`auction_fee` 66%** — Selling Summary covers Jan–Dec 2025 only | Oct–Dec 2024 + 2026 tail (esp. Feb 2026) sparse | Yes — a **2026 Selling Summary** (or Detail-format Buyer Detail) pushes it to ~90%. No label impact (iDMS = 100% of sale prices) |
| **7% `missing_expected` CR** | Manheim sales without matched CR | Yes — more/better Game Day matching |
| `transport_cost`, `lead_id`, `vehicle_candidate_id`, pass-on rows | absent for history | No — `future-only` capture |

## 9. Source-of-truth store (Supabase)

Deliverable SQL stages the dataset into Postgres, keyed on `vin + cycle_seq` so forward loads **upsert** (no duplicates). Files in `BuyBox Output/`: `supabase_buybox_schema.sql`, `supabase_buybox_load.sql`, `SUPABASE_SETUP.md`.

> **Schema reconciliation (important):** the delivered SQL uses a standalone `buybox` schema for portability. Per [`03-TECHNICAL-SPEC.md`](../../03-TECHNICAL-SPEC.md) §1.1 conventions, the **canonical home is `tav.purchase_outcomes`** (additive `ALTER`, `gen_random_uuid()`, `smallint` year) — the standalone `buybox_*` form is explicitly superseded. The §4 mapping makes the merge into `tav.*` mechanical; the recommended path is to load the backfill into `tav.purchase_outcomes` (+ the §1.1 additions) rather than a parallel `buybox` table.

## 10. How this closes Phase 0 / Audit 06

- **Punch-list item 20** (stage the historical backfill): done — 57,228 rows staged, re-loadable.
- **Audit Kit 06 / R17** (field completeness): §4 + §6 + §7 deliver the per-field fill, the duplicate-field verdicts (`price_paid`, `gross_profit`, `mileage` authoritative), the recent-quarter slice, and tag confirmations/updates. Recommended: commit a `audits/reports/06-field-completeness-report.md` from these results and update the §1.1 tags (notably **`condition_grade_raw`, `buyer_id`, `closer_id`, `cot_*`, `trim` → backfillable**).
- **Audits 07/09** (benchmark feasibility / segment N): now executable against the staged rows.

## 11. Reproduction & forward data

1. Drop new source exports into the data folder (the pipeline auto-detects date-named Manheim Detail files and all DCL/Game Day workbooks).
2. Re-run the pipeline → regenerates `buybox_master.csv`.
3. `psql "$SUPABASE_DB_URL" -f supabase_buybox_load.sql` → upserts on `vin + cycle_seq`.

**Open items**
- **Persist the pipeline** into the repo (`apps/maxbuy/etl/` or similar) — today it lives in scratch, so the backfill is reproducible by the operator who built it but not yet self-service. Recommended next step (+ optional scheduled weekly refresh).
- **Reconcile to `tav.purchase_outcomes`** per §9 instead of the standalone `buybox` schema.
- **Refine `sale_channel`** from the coarse Manheim/Direct split to the §1.1 enum (`in_lane/ove/simulcast/digital/other`).
- **Update §1.1 field tags** and commit the Audit 06 report.
- Going forward the operating platform captures everything, so new rows land at ~100% — the historical backfill is the statistical mass; forward data is the pristine, fully-attributed slice.
