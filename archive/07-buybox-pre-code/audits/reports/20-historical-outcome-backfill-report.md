# Report 20 — Phase 0 Historical Outcome Backfill (Execution)

**Punch-list item:** #20 · **Category:** Data backfill (Phase 0 gate) · **Owner:** D ·
**Closes:** the [`05-PUNCH-LIST.md`](../../05-PUNCH-LIST.md) item-20 gate · **Status:** Backfill executed — staged, ready to load.
**Lands in:** [`maxbuy.md`](maxbuy.md) (narrative) · field tags → [`../../03-TECHNICAL-SPEC.md`](../../docs/07-buybox/TECHNICAL-SPEC.md) §1.1 · feeds Audit Kits [`../06-field-completeness-audit.md`](../06-field-completeness-audit.md), [`../07-segment-support-matrix.md`](../07-segment-support-matrix.md), [`../09-mmr-quality-residual-audit.md`](../09-mmr-quality-residual-audit.md), [`../10-decay-rate-validation-plan.md`](../10-decay-rate-validation-plan.md).

**Date:** 2026-05-22 · **Status:** Phase 0 only · **Repo prefix:** `TAV-BB`

> **Scope guardrail.** This report covers the historical outcome backfill *only*. No MaxBuy app code, UI, ML/model work, or Phase 1 implementation is started or implied here. Target of the load is `tav.purchase_outcomes` (additive, per §1.1 conventions) — **not** a standalone `buybox.*` table.

---

## 1. Backfill source inventory

Reconstructed dataset: **57,228 sold vehicle-cycles, Oct 2024 → May 2026** (53,598 distinct VINs; 2,868 re-entries kept as separate cycles).

| Role | Source type | Files (used) | Contributes |
|---|---|---|---|
| **Spine / labels** | iDMS Sales Reports | 19 of 21 (2 dup files skipped) | VIN, year/make/model/trim/body, acquired price, sale price, gross/net, dates, days-on-lot, mileage, expenses |
| **Buy-side** | Daily Car List (DCL) | 10 workbooks (~90,261 buy-side VINs) | MMR-at-buy, buyer, closer, deal type, `cot_city/state`, dealer-sold-to |
| **Condition** | Game Day (incl. Missing-Dates + single-week sheets) | 7 sources (71,006 VINs graded) | `CR` grade, consignor, title/collection status, arbitration (unwinds) |
| **Sell-side** | Manheim Buyer Detail + Selling Summary | 14 (35,869 VINs) | realized sale price + seller fee (`auction_fee`) |
| **Reference** | StatesRegions | 1 | state → US region |
| **Out of scope** | Lane Attendance | 1 | standalone analytics — not stitched |

**Files skipped (35), categorized — file-level, not row exclusions:**

| Reason | Count |
|---|---|
| Manheim **Summary-format** PDFs (buyer counts, no VIN/price) | 13 |
| `Performance_Analysis` PDFs (aggregate, not per-vehicle) | 10 |
| `Buyer_Detail___New_Buyers` variants (no per-VIN sale lines) | 5 |
| `Selling_Summary` PDF duplicates of the loaded `.xlsx` | 2 |
| `Client_AR` PDFs (accounts receivable, out of scope) | 2 |
| 0-byte / broken upload (CSV twin used instead) | 1 |
| _other PDF_ | 2 |

## 2. Final field mapping → `tav.purchase_outcomes`

Source column → staging → canonical. Duplicate-intent pairs resolved (authoritative noted). Coverage = % of 57,228 rows populated.

| `tav.purchase_outcomes` column | Source · column | Transform | Coverage |
|---|---|---|---|
| `vin` | iDMS · `VIN` | uppercase, strip non-alphanumerics, validate 17-char | 100% |
| `year` | iDMS · `Year Model` | `::numeric::int` (handles `2024.0`) → smallint | 100% |
| `make`, `model` | iDMS · `Make`, `Model` | trim | 100% |
| `trim` | iDMS · `Exterior Trim` | trim | **99%** |
| _(body_style)_ | iDMS · `Body Style` | trim | 81% |
| `purchase_date` | iDMS · `Acquired Date` | `::date` | 100% |
| `sale_date` | iDMS · `Contract Date` | `::date` | 100% |
| `price_paid` *(authoritative over `purchase_price`)* | iDMS · `Acquired Price` | `::numeric` | 100% |
| `sale_price` | iDMS · `Sales Price` (cross-checked vs Manheim `Purch Pr`) | `::numeric` | 100% |
| `gross_profit` *(authoritative over `gross_profit_est`)* | iDMS · `Profit Sales Gross Profit` | `::numeric` | 100% |
| `net_gross` | iDMS · `Profit Deal Net Profit` | `::numeric` | 100% |
| `mileage` *(authoritative over `odometer_at_purchase`)* | iDMS · `Mileage` | `::numeric` | 100% |
| `mmr_value_at_purchase` | DCL · `MMR` (fallback Game Day `MMR Wholesale`) | nearest-to-purchase-date | **92%** |
| `hold_days` | iDMS · `Days On Lot` | `::numeric` | ~100% |
| `misc_overhead` | derived `sale_price − price_paid − gross_profit` | — | 100% |
| `auction_fee` | Manheim · `Tot Exp` / `Tot Seller Exp` | nearest-to-sale-date | **66%** |
| `transport_cost` | — none (not itemized) | — | 0% (`unavailable`) |
| `condition_grade_raw` | Game Day · `CR GRADE` | nearest by VIN | **90%** |
| `purchase_channel` | iDMS · `Acquired Method` / DCL `Deal Type` | — | high |
| `selling_channel` | iDMS · `Customer Name` | — | high |
| `region` | StatesRegions · `Region` keyed on `cot_state` | lookup | **78%** |
| `cot_city`, `cot_state` | DCL · `City`, `State` | state → abbrev | 80% / 78% |
| `buyer_id` | DCL · `Buyer` (fallback Game Day) | — | 87% |
| `closer_id` | DCL · `Closer` | — | 81% |
| `week_label` | derived: ISO week of `sale_date` | — | 100% |
| `source` | const `idms` + `source_file` (provenance) | — | 100% |
| `import_batch_id` | const `phase0-backfill-2026-05-22` | stamped at load | 100% |
| `import_fingerprint` | `md5(vin · cycle_seq · source_file)` | computed at load | 100% |
| `outcome` | const `sold` (backfill = sold units only) | — | 100% |
| `lead_id`, `vehicle_candidate_id` | — | NULL (no linkage in history) | `unavailable` |

**Staging fields beyond the §1.1 baseline** (carried for QA / feature work; add as additive columns or keep in staging): `cycle_seq`, `display_id` (`VIN_N`), `consignor_dealer`, `dealer_sold_to`, `title_collection_status`, `arbitration_flag`, `price_vs_mmr`, `sale_price_manheim`, `sale_channel`, `condition_status`, `data_quality`.

## 3. Coverage summary — requested fields

| Field | Coverage | Notes |
|---|---|---|
| **purchase_date** | **100%** (57,228 / 57,228) | all rows dated; range Oct-2024 → May-2026 |
| **mileage / odometer** | **100%** | `mileage` authoritative; `odometer_at_purchase` is the duplicate-intent twin |
| **MMR-at-purchase** | **92%** (52,712) | DCL primary, Game Day fallback; misses cluster in Mar-2025 (corrupt DCL) + 2024 tail |
| **VIN / join key** | **100% valid 17-char**; `(vin, cycle_seq)` unique = **57,228 (zero duplicate keys)** | re-entries correctly separated into cycles |
| **region** | **78%** (44,730) | from StatesRegions on `cot_state`; blanks = rows with no `cot_state` |
| **source** | **100%** | `source_system`=`idms` + `source_file` (provenance per row) |
| **trim** | **99%** (57,221) | from iDMS `Exterior Trim` — **resolves Audit 07's "no trim" structural problem** |
| **expenses** | `misc_overhead` **100%**, `expense_total` **100%**, `auction_fee` **66%** | aggregate expense complete; itemized `transport_cost` unavailable |

## 4. Exclusion reason counts

Row-level exclusions (iDMS spine candidates):

| Reason | Rows | Detail |
|---|---|---|
| Duplicate export files | **7,170** | 2 byte-identical re-exports (`iDMS Sales Report - 04-2026.xlsx` = a March-2026 copy; `iDMS Sales Report 07-2025.xlsx` = a July-2025 copy), detected by content signature, skipped whole |
| Invalid VIN (non-17-char) | **1** | failed VIN validation |
| Empty VIN | **0** | — |
| **Retained (loaded)** | **57,228** | — |
| _Total VIN-bearing iDMS rows read_ | _64,399_ | 57,229 used-file + 7,170 dup-file |

Notes: enrichment-source rows (DCL/Game Day/Manheim) are not "excluded" — they attach to spine rows by VIN and contribute no standalone rows. The backfill is **sold-units only** by construction (R3/R4 survivorship) — `no_sale`/pass-on rows are `future-only`, not an exclusion.

## 5. Recommended import path — **staging table + idempotent upsert** (not direct update)

**Recommendation: staging → merge.** Do **not** `COPY`/`UPDATE` straight into `tav.purchase_outcomes`.

| | Staging + upsert (recommended) | Direct update |
|---|---|---|
| Type safety | all-text staging absorbs CSV quirks (`2024.0`, blanks), cast on merge | inline casts against prod — brittle |
| Idempotency | `ON CONFLICT (import_fingerprint)` → re-runs & forward loads merge, no dupes | none — re-runs duplicate or fail |
| Prod safety | merge wrapped in one transaction; staging truncated each load | partial writes hit the live table |
| Re-entries | `import_fingerprint = md5(vin·cycle_seq·source_file)` keeps each cycle distinct | hard to key |

Mechanics (the delivered `supabase_buybox_*.sql` already implements this pattern; **retarget the canonical table to `tav.purchase_outcomes`** per §1.1):
1. `truncate` staging; `\copy buybox_master.csv` into it (all text).
2. `INSERT … SELECT` with casts, computing `import_fingerprint` and stamping `import_batch_id = 'phase0-backfill-2026-05-22'`, `ON CONFLICT (import_fingerprint) DO UPDATE`.
3. Requires a unique index on `tav.purchase_outcomes.import_fingerprint` (add if absent). `cycle_seq` is additive — add the column or fold cycle into the fingerprint + distinct `purchase_date`.

## 6. Rollback plan

The load is an upsert into the live table, so rollback is pre-staged and batch-scoped:

1. **Pre-load snapshot** (cheap; the table holds only derived numbers, no licensed payloads):
   ```sql
   create table tav._po_backup_2026_05_22 as select * from tav.purchase_outcomes;
   ```
   (Or note a Supabase PITR timestamp before the load.)
2. **Batch stamp** every inserted/updated row: `import_batch_id = 'phase0-backfill-2026-05-22'`.
3. **Transactional load**: run the merge inside `begin; … commit;` so any failure aborts atomically with no partial state.
4. **Rollback after commit:**
   - Rows the backfill *inserted* (the expected case — the table had no history for these VINs):
     ```sql
     delete from tav.purchase_outcomes where import_batch_id = 'phase0-backfill-2026-05-22';
     ```
   - Rows the backfill *updated* (if any pre-existing rows were touched): restore from the snapshot:
     ```sql
     update tav.purchase_outcomes t set ... = b....
     from tav._po_backup_2026_05_22 b where b.id = t.id;   -- or full restore
     ```
5. **Verify clean rollback:**
   ```sql
   select count(*) from tav.purchase_outcomes where import_batch_id = 'phase0-backfill-2026-05-22';  -- expect 0
   ```
6. Drop the snapshot table once the load is confirmed good.

## 7. Post-backfill verification queries (Audits #6, #7, #9, #10)

Read-only `SELECT` only. **Audit 09 guardrail honored** — these touch only derived numerics (`mmr_value_at_purchase`, `sale_price`), never licensed MMR payloads.

**#6 — Field completeness** (confirms the backfill populated the modeled fields; runs the duplicate-field reconciliation):
```sql
select count(*) as rows,
  round(100.0*count(*) filter (where purchase_date is null)/count(*),1)         as purchase_date_null_pct,
  round(100.0*count(*) filter (where mileage is null)/count(*),1)               as mileage_null_pct,
  round(100.0*count(*) filter (where mmr_value_at_purchase is null
                              or mmr_value_at_purchase=0)/count(*),1)            as mmr_miss_pct,
  round(100.0*count(*) filter (where trim is null or trim='')/count(*),1)        as trim_miss_pct,
  round(100.0*count(*) filter (where region is null or region='')/count(*),1)    as region_miss_pct,
  round(100.0*count(*) filter (where condition_grade_raw is null)/count(*),1)    as cr_miss_pct,
  round(100.0*count(*) filter (where auction_fee is null)/count(*),1)            as auction_fee_null_pct,
  -- duplicate-field authority
  count(*) filter (where price_paid is not null and purchase_price is null)      as only_price_paid,
  count(*) filter (where gross_profit is not null and gross_profit_est is null)  as only_gross_actual
from tav.purchase_outcomes
where import_batch_id = 'phase0-backfill-2026-05-22';
```

**#7 — Segment support** (confirms trim now enables the exact segment key; rows-per-segment distribution + min-N):
```sql
with seg as (
  select lower(make)||'|'||lower(model)||'|'||lower(coalesce(nullif(trim,''),'base'))
         ||'|'||coalesce(region,'?')||'|'||width_bucket(coalesce(mileage,0),0,200000,20) as exact_key,
         lower(make)||'|'||lower(model)||'|'||coalesce(region,'?') as fallback_key
  from tav.purchase_outcomes where import_batch_id='phase0-backfill-2026-05-22')
select 'exact (ymm+trim+region+mileage_band)' as resolution,
       count(distinct exact_key) as segments,
       count(*) filter (where exact_key in (select exact_key from seg group by 1 having count(*)>=30)) as rows_in_segments_ge_30
from seg
union all
select 'fallback (ymm+region)', count(distinct fallback_key),
       count(*) filter (where fallback_key in (select fallback_key from seg group by 1 having count(*)>=30))
from seg;
```

**#9 — MMR quality & residual** (residual = realized sale − day-of MMR; derived numerics only):
```sql
select
  count(*) filter (where mmr_value_at_purchase is not null and mmr_value_at_purchase>0) as mmr_present,
  round(100.0*count(*) filter (where mmr_value_at_purchase is null or mmr_value_at_purchase=0)/count(*),1) as mmr_miss_pct,
  round(avg(sale_price - mmr_value_at_purchase) filter (where mmr_value_at_purchase>0),0)              as residual_bias,
  round(avg(abs(sale_price - mmr_value_at_purchase)) filter (where mmr_value_at_purchase>0),0)         as residual_mae,
  round(percentile_cont(0.5) within group (order by sale_price - mmr_value_at_purchase)
        filter (where mmr_value_at_purchase>0)::numeric,0)                                             as residual_p50
from tav.purchase_outcomes
where import_batch_id='phase0-backfill-2026-05-22' and sale_price is not null;
```

**#10 — Decay-rate backtest readiness** (confirms the walk-forward working set is populated by month; the decay backtest itself runs offline on this set):
```sql
select date_trunc('month', sale_date) as sale_month,
       count(*) as sold_units,
       count(*) filter (where sale_price is not null and gross_profit is not null
                        and trim is not null) as backtest_ready
from tav.purchase_outcomes
where import_batch_id='phase0-backfill-2026-05-22' and sale_date is not null
group by 1 order by 1;
```

---

### Definition of done (this report)
Source inventory, field mapping, per-field coverage, exclusion counts, import-path recommendation, rollback plan, and the four verification queries are committed. Next (separate, not started here): retarget the load to `tav.purchase_outcomes`, run the four audits, and update the §1.1 field tags. **No Phase 1 / app / ML work is begun.**
