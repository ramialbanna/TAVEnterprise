# Audit Kit 09 — MMR Quality & Residuals

**Punch-list item:** #9 · **Category:** Data Audit (read-only) · **Owner:** D ·
**Closes risk:** R1 · **Status:** Kit ready — not yet executed.
**Lands in:** [`../02-ARCHITECTURE.md`](../../docs/07-buybox/ARCHITECTURE.md) §5;
[`../03-TECHNICAL-SPEC.md`](../../docs/07-buybox/TECHNICAL-SPEC.md) §1.4 (MMR fields on replay).

**What this is:** A copy-paste-ready, read-only audit kit. It measures how good
TAV's MMR history is and how far actual sale prices land from the day-of MMR.
It creates no code, no migration, no schema change.

---

## 1. Objective

MMR is MaxBuy's anchor benchmark. This audit answers four questions over the
~18-month MMR history:

1. How often is MMR a true VIN lookup vs a YMM fallback, by segment?
2. When MMR is missing, why — what miss reasons and error codes dominate?
3. How stale is the MMR data that gets used (cache age distribution)?
4. What is the residual — `actual_sale_price − day-of MMR` — by segment,
   price band, and MMR method?

The YMM-fallback-rate output directly sets the `GATE_YMM_FALLBACK_LOW`
threshold (owner item #5).

## 2. Scope & guardrails — licensed data

**Cox/Manheim MMR payloads are licensed.** This audit must not leak them.

- **Never `SELECT`** `tav.valuation_snapshots.raw_response`,
  `tav.mmr_queries.mmr_payload`, or `tav.mmr_cache.mmr_payload` into a report,
  a log line, an external service, a client doc, or this repo.
- Use **derived numeric columns only**: `mmr_value`, `mmr_wholesale_avg`,
  `mmr_value_at_purchase`, `sale_price`, `valuation_method`, `lookup_type`,
  `missing_reason`, `error_code`, `cache_hit`, `fetched_at`, `expires_at`.
- Aggregate residuals (MAE, bias, percentiles) are derived statistics, not
  licensed payloads — safe to commit. Individual `(vin, mmr_value)` pairs are
  not — keep them out of committed reports.
- Read-only. `SELECT` only. No writes to any `tav.*` object.

## 3. Data sources

- `tav.valuation_snapshots` — per-listing/candidate MMR result. `valuation_method`
  is `'vin'` or `'year_make_model'`. Hit rows have `mmr_value`; miss rows have
  `missing_reason` (XOR enforced by a CHECK constraint).
- `tav.mmr_queries` — append-only audit log of every lookup. `lookup_type`,
  `source` (`manheim`/`cache`/`manual`), `cache_hit`, `error_code`.
- `tav.mmr_cache` — Postgres mirror of the KV cache; `fetched_at` / `expires_at`
  give cache-age distribution.
- `tav.purchase_outcomes` — `mmr_value_at_purchase` is the day-of MMR captured
  at buy time; `sale_price` is the realized sale. These two columns are the
  residual.

## 4. Methodology

### 4.1 VIN vs YMM-fallback rate, overall and by segment

```sql
-- Overall
SELECT valuation_method,
       count(*)                                                     AS rows,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1)           AS pct
FROM tav.valuation_snapshots
WHERE mmr_value IS NOT NULL
GROUP BY valuation_method;

-- By segment (year/make/model) — feeds the GATE_YMM_FALLBACK_LOW threshold
SELECT year, lower(make) AS make, lower(model) AS model,
       count(*)                                                     AS mmr_rows,
       count(*) FILTER (WHERE valuation_method = 'year_make_model')  AS ymm_fallback_rows,
       round(100.0 * count(*) FILTER (WHERE valuation_method = 'year_make_model')
             / count(*), 1)                                         AS ymm_fallback_pct
FROM tav.valuation_snapshots
WHERE mmr_value IS NOT NULL AND year IS NOT NULL
GROUP BY 1,2,3
ORDER BY mmr_rows DESC;
```

### 4.2 Miss reasons and error codes

```sql
-- Snapshot misses (mmr_value NULL ⇒ missing_reason set)
SELECT missing_reason, count(*) AS rows
FROM tav.valuation_snapshots
WHERE mmr_value IS NULL
GROUP BY missing_reason
ORDER BY rows DESC;

-- Query-log errors
SELECT error_code, count(*) AS rows
FROM tav.mmr_queries
WHERE error_code IS NOT NULL
GROUP BY error_code
ORDER BY rows DESC;
```

### 4.3 Cache-age distribution

```sql
-- How stale is cached MMR when served, from the query log
SELECT source, cache_hit, count(*) AS rows
FROM tav.mmr_queries
GROUP BY source, cache_hit
ORDER BY rows DESC;

-- Age of cache rows at the moment they expire (mirror table)
SELECT
  width_bucket(extract(epoch FROM (expires_at - fetched_at)) / 86400.0,
               0, 30, 6)                                            AS age_days_bucket,
  count(*)                                                          AS rows
FROM tav.mmr_cache
GROUP BY 1
ORDER BY 1;
```

### 4.4 Residual backtest — `actual_sale_price − day-of MMR`

```sql
-- Aggregate residual by segment. Derived stats only — no payloads.
SELECT
  year, lower(make) AS make, lower(model) AS model,
  count(*)                                                          AS n,
  round(avg(sale_price - mmr_value_at_purchase))                    AS mean_residual,   -- bias
  round(avg(abs(sale_price - mmr_value_at_purchase)))               AS mae,
  round(percentile_cont(0.5) WITHIN GROUP
        (ORDER BY sale_price - mmr_value_at_purchase))              AS p50_residual,
  round(percentile_cont(0.9) WITHIN GROUP
        (ORDER BY abs(sale_price - mmr_value_at_purchase)))         AS p90_abs_residual
FROM tav.purchase_outcomes
WHERE sale_price IS NOT NULL
  AND mmr_value_at_purchase IS NOT NULL
  AND mmr_value_at_purchase > 0
GROUP BY 1,2,3
HAVING count(*) >= 5
ORDER BY n DESC;
```

Price-band cut — repeat §4.4 grouped by an MMR price band
(`< 10k, 10-20k, 20-30k, 30-45k, 45k+`) instead of segment.

**MMR-method join caveat:** `purchase_outcomes` stores `mmr_value_at_purchase`
as a number but not the method that produced it. To split residuals by VIN vs
YMM method, join to `valuation_snapshots` on `vehicle_candidate_id` (nearest
`fetched_at` ≤ `purchase_date`) or to `mmr_queries` on `vehicle_candidate_id`.
Document the join's match rate; rows that cannot be matched are reported as a
`method_unknown` bucket — not dropped.

## 5. Deliverable — report template

Commit as `audits/reports/09-mmr-quality-residual-report.md`:

```markdown
# Report 09 — MMR Quality & Residuals
Run date: YYYY-MM-DD · MMR history window: ... to ... · Rows analyzed: N

## VIN vs YMM-fallback
- Overall: VIN ..% / YMM ..%
- Segments above the proposed GATE_YMM_FALLBACK_LOW line: ...

## Miss reasons
| missing_reason / error_code | Count | % |

## Cache age
- Cache-hit share: ..% · median served-age: .. days

## Residual (actual sale − day-of MMR)
| Segment / price band | N | Bias | MAE | P50 | P90 abs | Method split |

## GATE_YMM_FALLBACK_LOW recommendation
Proposed threshold: YMM-fallback rate above ..% ⇒ gate. Rationale: ...

## Method-join match rate
Matched ..% ; method_unknown ..%
```

## 6. Data-shape findings to expect

1. The XOR CHECK on `valuation_snapshots` guarantees every row is a clean hit
   or a clean miss — `missing_reason` is reliable; lean on it.
2. `purchase_outcomes.mmr_value_at_purchase` makes residual analysis possible
   **without** re-pulling any licensed payload — the number is already stored.
3. Method is not stored on `purchase_outcomes` — the §4.4 join is required and
   its match rate is itself a finding (it bounds how confidently residuals can
   be split by VIN vs YMM).
4. Older outcome rows may pre-date the MMR integration entirely — expect a
   block of `mmr_value_at_purchase IS NULL`; that share is a finding, not an
   error.

## 7. Definition of done

Residual-by-segment report committed; YMM-fallback rate by segment documented;
the `GATE_YMM_FALLBACK_LOW` threshold (item #5) is informed by this audit and
handed to the owner as part of the item-5 decision memo. No licensed payload
appears anywhere in the committed report.
