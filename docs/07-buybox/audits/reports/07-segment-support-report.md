# Report 07 — Segment Support Matrix

**Punch item:** #7 · **Kit:** [`../07-segment-support-matrix.md`](../07-segment-support-matrix.md)
**Date:** 2026-05-20 · **Status:** Complete — live Supabase run folded in.

**Method:** read-only structural analysis plus the live SELECT-only results of
kit §4 (queries Q7.1–Q7.4), run in Supabase Studio.

---

## 1. Headline

Segmenting `tav.purchase_outcomes` (12,904 rows) is only possible at
**year/make/model**. Trim has no column, `mileage_band` is entirely `unknown`
(mileage all NULL — Report 06 F5), `region` is mostly NULL, and `purchase_date`
is NULL on every row, so **recency / effective-N weighting cannot be computed
from this table at all**. Support is also thin and truck-concentrated.

## 2. Live results

### Segment counts (Q7.1)
- Segmentation realised: **year/make/model only**. `mileage_band` returned
  `unknown` for every row; `region` mostly NULL with sparse labels.
- Distribution is truck-heavy. Largest segments: 2023 Ford F-150 (217),
  2024 Ford F-150 (170), 2025 Ford F-150 (155), 2022 Ford F-150 (146),
  2024 GMC Sierra 1500 (144), 2024 GMC Sierra 2500HD (144).
- `rows_6mo` and `rows_12mo` were **0 across all segments** — a direct
  consequence of `purchase_date` being all-NULL, not of low recent volume.

### Dropped rows (Q7.2)
- `dropped_null_year` 0 · `dropped_null_make` 0 · `dropped_null_model` 0 —
  year/make/model are fully populated; no exclusions.

### Effective N (Q7.3)
- **0 rows returned.** The recency-weighted query filters on
  `purchase_date IS NOT NULL`; with the column all-NULL, **effective N cannot
  be computed**. Recency weighting on `purchase_outcomes` is impossible.

### Fallback coverage (Q7.4)
- **2,176** distinct year/make/model segments.
- ≥30 rows: **78** segments (3.6%)
- ≥15 rows: **181** segments (8.3%)
- ≥5 rows: **600** segments (27.6%)
- <5 rows: **1,576** segments (72.4%) — a long, thin tail.

## 3. Training-base decision must be revisited

Report 07's earlier recommendation (base = `purchase_outcomes`) assumed it
carried region, mileage, and a purchase date. The live run refutes that:
`purchase_outcomes` gives **year/make/model and nothing else** usable for
segmentation, and **no time axis**.

`tav.historical_sales` has `trim`, `sale_date`, and `acquisition_date` but no
region or mileage. **Neither table alone is sufficient.** Recommended next
step (a decision, not a query): re-evaluate the base —

- Option A — use `historical_sales` as the segment/time base (gains trim +
  `sale_date` for recency); accept no region/mileage.
- Option B — join `purchase_outcomes` ↔ `historical_sales` on `vin` (where
  `purchase_outcomes.vin` is present — mostly NULL per Report 06) or another
  key, and measure the match rate first.
- Option C — investigate `purchase_outcomes.week_label` as the time anchor.

Record the chosen base in [`../../02-ARCHITECTURE.md`](../../02-ARCHITECTURE.md)
§5 before Phase 1.

## 4. Minimum-N policy (proposed, year/make/model resolution)

With recency weighting unavailable, the policy uses **raw** counts for v1:

| Resolution | Raw N | `data_strength` |
|---|---|---|
| exact year/make/model | ≥ 30 | high |
| exact year/make/model | 5–29 | medium |
| exact year/make/model | < 5, or make/model fallback only | low |

## 5. Interaction with DEC-3 (closed)

DEC-3: low `data_strength` **caps the verdict at Review**. With only 78
segments at ≥30 rows and 1,576 segments below 5 rows, **the majority of
year/make/model lookups will land in low/medium `data_strength`** — i.e. most
v1 verdicts will be capped at Review and cannot reach Buy / Strong Buy. This is
a launch-shaping finding: MaxBuy v1 will be conservative by data necessity.
Owner/product should see this before Phase 1.

## 6. Definition of done

Support matrix counts: **done (live).** Minimum-N policy: **done (raw-count
v1 version).** Effective-N weighting: **not possible from `purchase_outcomes`**
— blocked on the §3 base decision and Audit #10. Training-base recommendation:
**revised — needs an owner/architecture decision.**
