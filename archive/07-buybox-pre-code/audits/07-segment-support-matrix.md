# Audit Kit 07 — Segment Support Matrix

**Punch-list item:** #7 · **Category:** Data Audit (read-only) · **Owner:** D ·
**Closes risk:** R3 · **Status:** Kit ready — not yet executed.
**Lands in:** [`../02-ARCHITECTURE.md`](../../docs/07-buybox/ARCHITECTURE.md) §5; routing rules
in [`../03-TECHNICAL-SPEC.md`](../../docs/07-buybox/TECHNICAL-SPEC.md) §2 (`data_strength`).

**What this is:** A copy-paste-ready, read-only audit kit. It produces the
segment row-count matrix and the minimum-N policy that drives `data_strength`.
It creates no code, no migration, no schema change.

---

## 1. Objective

MaxBuy predicts at the segment level. A verdict is only as trustworthy as the
number of comparable historical units behind it. This audit counts historical
support per segment — both **raw** rows and **effective** rows after recency
weighting — and defines the minimum N required to serve at three resolutions:

- **exact segment** — year · make · model · trim · region · mileage_band
- **fallback segment** — drop trim
- **global fallback** — make/model only, or national

The output feeds the `data_strength` (`low`/`medium`/`high`) routing rule.

## 2. Scope & guardrails

- Read-only. `SELECT` only. No writes to any `tav.*` object.
- No licensed Cox/Manheim payloads touched — segment counts use vehicle
  identity and date columns only.
- Every row excluded from a segment count carries a documented reason (NULL
  key field, out-of-range year, etc.). No silent drops.

## 3. Data sources — and a structural problem to resolve first

The full segment key is **year · make · model · trim · region · mileage_band**.
No single existing table carries all six:

| Table | year | make | model | trim | region | mileage |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `tav.purchase_outcomes` | yes | yes | yes | **no** | yes | yes (`mileage`) |
| `tav.historical_sales` | yes | yes | yes | yes | **no** | **no** |

**The audit's first task is a decision, not a query:** which table is the
training base, and how is the missing dimension handled.

- If `purchase_outcomes` is the base — trim is unavailable; segments are
  year/make/model/region/mileage_band, and the "drop trim" fallback is moot.
- If `historical_sales` is the base — region and mileage_band are unavailable;
  recover them by joining to `vehicle_candidates` / `valuation_snapshots` on
  `vin`, or accept national, mileage-agnostic segments for v1.
- A blended base requires a documented join key and its match rate.

Record the decision and its consequence in the report before counting.

## 4. Methodology

### 4.1 Mileage bands

Define bands before counting. Proposed v1 bands (the audit confirms or revises
against the actual mileage distribution):

```
0-30k, 30-60k, 60-90k, 90-120k, 120-150k, 150k+
```

Note this is **coarser** than the 5,000-mile MMR cache bucket in
[`../../03-api/intelligence-contracts.md`](../../docs/03-api/intelligence-contracts.md)
§A. Segment support needs broad bands for population; the MMR cache needs fine
buckets for reuse. They are intentionally different — document that.

### 4.2 Raw segment counts (base = `purchase_outcomes`)

```sql
WITH seg AS (
  SELECT
    year, lower(make) AS make, lower(model) AS model, region,
    CASE
      WHEN mileage IS NULL                 THEN 'unknown'
      WHEN mileage <  30000                THEN '0-30k'
      WHEN mileage <  60000                THEN '30-60k'
      WHEN mileage <  90000                THEN '60-90k'
      WHEN mileage < 120000                THEN '90-120k'
      WHEN mileage < 150000                THEN '120-150k'
      ELSE '150k+'
    END AS mileage_band,
    purchase_date
  FROM tav.purchase_outcomes
  WHERE year IS NOT NULL AND make IS NOT NULL AND model IS NOT NULL
)
SELECT year, make, model, region, mileage_band,
       count(*)                                                     AS raw_rows,
       count(*) FILTER (WHERE purchase_date >= now() - interval '6 months')  AS rows_6mo,
       count(*) FILTER (WHERE purchase_date >= now() - interval '12 months') AS rows_12mo
FROM seg
GROUP BY 1,2,3,4,5
ORDER BY raw_rows DESC;
```

Run the dropped-rows counterpart so exclusions are explicit:

```sql
SELECT
  count(*) FILTER (WHERE year IS NULL)   AS dropped_null_year,
  count(*) FILTER (WHERE make IS NULL)   AS dropped_null_make,
  count(*) FILTER (WHERE model IS NULL)  AS dropped_null_model
FROM tav.purchase_outcomes;
```

### 4.3 Effective N after recency weighting

Effective N = `SUM(recency_weight)`, weight = `0.5 ^ (age_days / half_life)`.
Until Audit Kit 10 picks the half-life, compute effective N at the **interim
365-day half-life** and clearly label it provisional.

```sql
SELECT year, lower(make) AS make, lower(model) AS model, region,
       round(SUM( power(0.5, (now()::date - purchase_date) / 365.0) )::numeric, 2)
         AS effective_n_365d
FROM tav.purchase_outcomes
WHERE year IS NOT NULL AND make IS NOT NULL AND model IS NOT NULL
  AND purchase_date IS NOT NULL
GROUP BY 1,2,3,4
ORDER BY effective_n_365d DESC;
```

Re-run this once Kit 10 lands the chosen λ; the matrix CSV is regenerated then.

### 4.4 Fallback-resolution coverage

For each resolution, count how many segments clear a candidate minimum N. This
shows what share of real lookups can be served exactly vs by fallback.

```sql
WITH base AS (
  SELECT year, lower(make) AS make, lower(model) AS model, count(*) AS n
  FROM tav.purchase_outcomes
  WHERE year IS NOT NULL AND make IS NOT NULL AND model IS NOT NULL
  GROUP BY 1,2,3
)
SELECT
  count(*) FILTER (WHERE n >= 30) AS segments_ge_30,
  count(*) FILTER (WHERE n >= 15) AS segments_ge_15,
  count(*) FILTER (WHERE n >= 5)  AS segments_ge_5,
  count(*)                        AS total_segments
FROM base;
```

## 5. Deliverable — report + CSV

1. `audits/reports/07-segment-support-matrix.csv` — one row per segment with
   `raw_rows`, `rows_6mo`, `rows_12mo`, `effective_n` (label the λ used).
2. `audits/reports/07-segment-support-report.md`:

```markdown
# Report 07 — Segment Support Matrix
Run date: YYYY-MM-DD · Training base table: ... · λ used for effective N: ...

## Training-base decision
Base = ... ; missing dimension(s) = ... ; handling = ...

## Coverage summary
- Segments served exactly (>= min N): ...
- Served by drop-trim fallback: ...
- Served by global fallback: ...
- % of last-6-month purchases each tier would have covered: ...

## Minimum-N policy (proposed)
| Resolution | Minimum effective N | data_strength awarded |
|---|---|---|
| exact segment | .. | high |
| fallback (drop trim) | .. | medium |
| global fallback | .. | low |

## Excluded rows
| Reason code | Count |
```

## 6. Data-shape findings to expect

1. **No table has the full six-dimension key** (§3) — the training-base
   decision is mandatory and must be recorded before any count is trusted.
2. `purchase_outcomes.region` is free text here (no CHECK constraint, unlike
   `tav.leads.region`) — expect dirty/with-NULL region values; normalize in
   the `WITH` clause and report the normalization.
3. The long tail will dominate — most year/make/model combinations will have
   very few rows. The minimum-N policy and fallback tiers exist precisely for
   that tail; size them against the actual distribution.

## 7. Definition of done

Support-matrix CSV committed; minimum-N policy documented; the `data_strength`
routing rule in [`../03-TECHNICAL-SPEC.md`](../../docs/07-buybox/TECHNICAL-SPEC.md) §2
references the matrix. Effective-N column regenerated once Kit 10 fixes λ.
