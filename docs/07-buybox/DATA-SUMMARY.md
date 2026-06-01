# MaxBuy — Data Summary

**Source of truth:** `tav.purchase_outcomes` in Supabase  
**Last verified:** 2026-06-01 (live query)  
**Batch:** `phase0-backfill-2026-05-22` → `import_batch_id = 8f690463-54de-3c8d-c674-4dbc0adb8f37`

---

## Headline

| Metric | Value |
|---|---|
| Total rows | **57,228** |
| Distinct VINs | 53,598 (2,868 re-entry cycles) |
| Date range (purchase) | 2024-10-01 → 2026-05-20 |
| Outcome type | All **sold** (bought-unit model; no pass-on history) |
| Pipeline linkage | `lead_id` / `vehicle_candidate_id` **NULL by design** for history |

`tav.historical_sales` is **empty** (0 rows). MaxBuy trains on `purchase_outcomes`.

---

## Field coverage

| Field | Populated | % |
|---|---|---|
| purchase_date, sale_date, mileage | 57,228 | 100% |
| price_paid, sale_price, gross_profit | 57,228 | 100% |
| trim | 57,221 | 99.99% |
| mmr_value_at_purchase | 52,709 | 92.1% |
| condition_grade_raw | 51,567 | 90.1% |
| buyer_id | 49,846 | 87.1% |
| region | 44,730 | 78.2% |
| auction_fee | 38,131 | 66.6% |
| transport_cost | 0 | unavailable (only aggregate overhead) |
| purchase_channel / selling_channel | 0 | deferred at load (enum mismatch) |

---

## Segment support (year/make/model)

| Resolution | Segments | ≥30 rows | ≥5 rows |
|---|---|---|---|
| year / make / model | 5,138 | 409 (high data strength) | 1,824 |
| year / make / model / trim | 16,157 | 204 | 2,747 |

**Implication for v1:** Most lookups land in medium/low data strength → verdict capped at Review per DEC-3. ~409 YMM segments have enough history for high strength.

Recency weighting is now possible (`purchase_date` populated). Trailing 365 days: ~36,087 rows.

---

## MMR residuals (sale_price − mmr_value_at_purchase)

52,709 rows with both values (1 corrupt outlier excluded):

| Metric | Value |
|---|---|
| Median residual | **+$885** |
| Mean residual | +$817 |
| Sold above MMR | 68.6% |
| Sold below MMR | 31.3% |

TAV clears above day-of MMR on the median deal. This is the evidence base for benchmark calibration.

Live MMR path (separate from history): `valuation_snapshots` hit rate ~11%; 71% of hits are YMM fallback, not VIN. MMR weakness routes to Review/data-strength, not hard PASS (DEC-4).

---

## Known gaps

| Gap | Impact | Status |
|---|---|---|
| No pass-on / no-sale rows | Model learns bought-unit performance only | Acknowledged; logging starts at v1 ship |
| No pipeline linkage on history | Can't join outcomes to leads for training features | By design for backfill |
| transport_cost not itemized | Use segment transport benchmarks or misc_overhead | future-only / derived |
| Repo schema.sql behind prod | Backfill columns exist in prod, not yet in committed migrations | **Fix in Phase 1** |

---

## Raw export (not in git)

CSV rebuild lives outside the repo: `…/Data for BuyBox - IDMS Reports/BuyBox Output/buybox_master.csv`.  
Load runbook archived at [`archive/pre-code/audits/reports/20-backfill-load-sql-package.md`](archive/pre-code/audits/reports/20-backfill-load-sql-package.md).
