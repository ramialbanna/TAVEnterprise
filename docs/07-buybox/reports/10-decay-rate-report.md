# Report 10 — Decay-Rate Validation

**Run date:** 2026-06-01 · **Punch item:** #10
**Data source:** `tav.purchase_outcomes` (not `historical_sales`)
**Rows used:** 57,225 · **Excluded:** 3 (NULL `sale_date` or `sale_price`)
**Sale date range:** 2022-01-19 → 2026-05-20
**Evaluation window:** 2025-11-24 → 2026-05-24 (26 walk-forward weeks, Monday starts)

## Method

- Walk-forward: train = all sales with `sale_date < week_start(W)`; holdout = sales in week W.
- Decay weight: `0.5 ^ (age_days / half_life)`; no-decay arm uses uniform weights.
- Segment ladder: exact (Y+M+M+trim) → drop trim (Y+M+M) → make/model → global.
- Thin segment: effective N < 30.
- Gross-hit error: predicted `(benchmark_sale − price_paid ≥ $800)` vs actual `gross_profit > 0`.

## λ-grid results

| Half-life | Sale-price MAE | Gross-hit error | Stability P95 | Thin-segment MAE | N preds |
|---|---:|---:|---:|---:|---:|
| no_decay | $5,679 | 36.96% | 0.000 | $5,006 | 18,763 |
| 90d | $5,555 | 39.31% | 0.000 | $5,058 | 18,763 |
| 180d | $5,576 | 38.32% | 0.000 | $4,975 | 18,763 |
| 365d | $5,616 | 37.63% | 0.000 | $4,978 | 18,763 |
| 540d | $5,633 | 37.48% | 0.000 | $4,991 | 18,763 |

## Chosen λ

**Half-life:** `180.0` (180d)

**Rationale:** Raw MAE winner was 90d ($5,555). Chose 180d instead: only $21 worse on overall MAE (0.37%) but thin-segment MAE improves $84 ($5,058 → $4,975).

**Benchmark version naming:** use suffix `-180d` e.g. `bm-2026w22-180d`.

## Per-segment overrides

None for v1 — global half-life applied to all segments.

## Follow-ups

- Region/mileage decay sensitivity (out of scope for this spike).
- Regenerate Audit Kit 07 effective-N column with chosen λ (180d applied in migration `0056` benchmark views).
