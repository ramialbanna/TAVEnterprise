# Report 06 — Historical Field Completeness

**Punch item:** #6 · **Kit:** [`../06-field-completeness-audit.md`](../06-field-completeness-audit.md)
**Date:** 2026-05-20 · **Status:** Complete — live Supabase run folded in.

**Method:** read-only structural analysis of `supabase/schema.sql` plus the
live SELECT-only results of kit §4 (queries Q6.1–Q6.4), run in Supabase Studio.
No licensed payloads involved — `purchase_outcomes` holds derived numbers only.

---

## 1. Headline

`tav.purchase_outcomes` has **12,904 rows**. It is a **flat financial-outcome
table** — buy price, sell price, gross, and hold days are populated for the
full table — but it carries **almost no acquisition context**: no purchase
date, no mileage, no region (mostly), no MMR-at-purchase, and no link to the
Vehicle Candidate or Lead pipeline. This materially constrains MaxBuy's v1
feature set and is the central finding of this audit.

## 2. Per-field completeness (12,904 rows)

| Field group | Field | State |
|---|---|---|
| Financial | `price_paid` | **populated — all 12,904** |
| Financial | `sale_price` | **populated — all 12,904** |
| Financial | `gross_profit` | **populated — all 12,904** |
| Financial | `hold_days` | **populated — all 12,904** |
| Financial | `purchase_price` | effectively all NULL — unused |
| Financial | `gross_profit_est` | effectively all NULL — unused |
| Financial | `transport_cost`, `auction_fee`, `listed_price` | mostly/all NULL |
| Condition | `condition_grade_normalized` | populated |
| Channel | `purchase_channel`, `selling_channel` | populated |
| Vehicle | `year`, `make`, `model` | populated (0 dropped — see Report 07 Q7.2) |
| Vehicle | `mileage`, `odometer_at_purchase` | **both unavailable — all NULL** |
| Vehicle | `vin` | mostly/all NULL |
| Context | `purchase_date` | **NULL on all 12,904 rows** (see F1) |
| Context | `region` | mostly missing |
| Context | `source` | mostly/all NULL |
| Linkage | `lead_id` | mostly/all NULL |
| Linkage | `vehicle_candidate_id` | mostly/all NULL |
| Provenance | `buyer_id` | 176 missing (98.6% populated) |
| Provenance | `closer_id` | 1,781 missing (86.2% populated) |

## 3. Critical findings

### F1 — `purchase_date` is NULL for the entire table

Q6.2 (completeness trend, `WHERE purchase_date IS NOT NULL`) returned **0 rows**;
Report 07's Q7.3 and the `rows_6mo`/`rows_12mo` columns of Q7.1 confirm it
independently. **There is no purchase-time signal on `purchase_outcomes`.**
Consequences: no temporal feature, and **no recency or decay weighting is
possible from this table** (Audit #7 effective-N, Audit #10 decay). The only
time-like columns left are `created_at` (import time, not economically
meaningful) and `week_label` (text) — both must be investigated as the fallback
time anchor before training.

### F2 — Bought units are not linked to the pipeline

`lead_id` and `vehicle_candidate_id` are mostly/all NULL. `purchase_outcomes`
is a standalone import, **not joined to `leads`, `vehicle_candidates`, or
`valuation_snapshots`.** Any feature that depends on a pipeline join is
unavailable for history.

### F3 — `mmr_value_at_purchase` is not backfillable

Q6.4: `po_missing_mmr` = 0 and `recoverable_from_snapshots` = 0. Because
`vehicle_candidate_id` is empty, the `valuation_snapshots` join recovers
**nothing**. Day-of MMR cannot be reconstructed for bought units — this is why
the Report 09 residual backtest returns no rows.

### F4 — Duplicate-pair verdicts (resolved)

Q6.3 settles all three pairs from the kit:

| Pair | Verdict |
|---|---|
| `purchase_price` vs `price_paid` | **`price_paid` authoritative** — `purchase_price` unused (all NULL) |
| `gross_profit` vs `gross_profit_est` | **`gross_profit` authoritative** — `gross_profit_est` unused (all NULL) |
| `mileage` vs `odometer_at_purchase` | **neither usable** — both unavailable |

### F5 — `mileage` unavailable

Both odometer columns are NULL across the table. MaxBuy cannot segment or
feature on mileage from `purchase_outcomes` (see Report 07).

## 4. Final field tags

| Field | Tag | Note |
|---|---|---|
| `price_paid`, `sale_price`, `gross_profit`, `hold_days` | usable | full coverage |
| `condition_grade_normalized`, `purchase_channel`, `selling_channel` | usable | populated |
| `year`, `make`, `model` | usable | full coverage |
| `buyer_id` | usable | 98.6% — treat NULL as `unknown` |
| `closer_id` | usable-with-gaps | 86.2% — treat NULL as `unknown` |
| `purchase_price`, `gross_profit_est` | unavailable | superseded by F4 |
| `mileage`, `odometer_at_purchase` | unavailable | F5 |
| `purchase_date` | unavailable | F1 |
| `mmr_value_at_purchase` | unavailable | F3 — not backfillable |
| `vin`, `source`, `region` | future-only | sparse; only forward-fill helps |
| `lead_id`, `vehicle_candidate_id` | unavailable | F2 |

## 5. Definition of done

Per-field completeness: **done (live, 12,904 rows).** Duplicate-pair verdicts:
**done.** Field tags: **done** — to be reconciled into
[`../../03-TECHNICAL-SPEC.md`](../../03-TECHNICAL-SPEC.md) §1.1, which must
account for the no-date / no-mileage / no-pipeline-link reality. F1–F3 are
escalation-grade: they shrink MaxBuy's v1 feature set and need a charter /
architecture review before Phase 1 (see [`06-EXECUTION-PLAN.md`](../../06-EXECUTION-PLAN.md)).
