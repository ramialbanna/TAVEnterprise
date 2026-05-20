# Report 07 — Segment Support Matrix (interim)

**Punch item:** #7 · **Kit:** [`../07-segment-support-matrix.md`](../07-segment-support-matrix.md)
**Date:** 2026-05-20 · **Status:** Interim — training-base decision analyzed
and recommended; segment row-counts pending a Supabase read run.

**Method:** read-only inspection of `supabase/schema.sql`
(`tav.purchase_outcomes`, `tav.historical_sales`, `tav.vehicle_candidates`).
No live query run — the counting SQL is ready in kit §4 and is `SELECT`-only.

---

## 1. Structural finding — no table carries the full segment key

The target segment key is **year · make · model · trim · region · mileage_band**.
Confirmed from schema: no single existing table has all six.

| Table | year | make | model | trim | region | mileage |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `tav.purchase_outcomes` | yes | yes | yes | **no** | yes | yes (`mileage`) |
| `tav.historical_sales` | yes | yes | yes | yes | **no** | **no** |

## 2. Recommended training base (decision the kit required)

**Recommendation: base = `tav.purchase_outcomes`.**

Rationale:
- It is the bought-unit table — the population MaxBuy actually predicts on and
  scores a max-buy against. `historical_sales` is a sale-record table loaded
  from weekly CSVs and lacks region and mileage entirely.
- It already carries `region` and `mileage`, the two dimensions
  `historical_sales` cannot supply.
- The missing dimension is `trim`. Recover trim where possible by joining
  `vehicle_candidate_id` → `tav.vehicle_candidates`; where the join misses,
  the segment is trim-agnostic and the "drop trim" fallback tier is moot.

Consequence for the fallback ladder (replaces kit §1's generic ladder):

```
exact      : year · make · model · region · mileage_band   (+ trim where joinable)
fallback 1 : drop mileage_band
fallback 2 : drop region
global     : make · model only
```

Record this decision in [`../../02-ARCHITECTURE.md`](../../02-ARCHITECTURE.md) §5
once the row counts confirm the ladder produces enough population per tier.

## 3. Mileage bands (proposed — confirm against the data run)

```
0-30k · 30-60k · 60-90k · 90-120k · 120-150k · 150k+ · unknown
```

Intentionally coarser than the 5,000-mile MMR cache bucket
([`../../../03-api/intelligence-contracts.md`](../../../03-api/intelligence-contracts.md)
§A) — segment support needs broad bands for population; the MMR cache needs
fine buckets for reuse.

## 4. Pending — requires a Supabase read run

Not produced in this docs-only phase:
- `07-segment-support-matrix.csv` — raw + effective row counts per segment;
- fallback-tier coverage (% of recent purchases each tier would serve);
- the minimum-N policy table feeding `data_strength`.

The kit §4 SQL (`SELECT`-only) is ready. Effective-N must be recomputed once
Report 10 fixes the decay half-life; until then it is provisional at a 365-day
half-life.

## 5. Interaction with closed decisions

DEC-3 (closed): `data_strength` is the only confidence display, and **low data
strength caps the verdict at Review**. The minimum-N policy this audit produces
is therefore launch-critical — it is the rule that decides `low` vs `medium` vs
`high`, and `low` directly suppresses Buy / Strong Buy. Size the thresholds
conservatively.

## 6. Definition of done — status

Training-base decision: **done (recommended — confirm with counts).** Support
matrix CSV + minimum-N policy: **pending data run.**
