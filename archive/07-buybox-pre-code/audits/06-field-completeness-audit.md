# Audit Kit 06 — Historical Field Completeness

**Punch-list item:** #6 · **Category:** Data Audit (read-only) · **Owner:** D ·
**Closes risk:** R17 · **Status:** Kit ready — not yet executed.
**Lands in:** [`../03-TECHNICAL-SPEC.md`](../../docs/07-buybox/TECHNICAL-SPEC.md) §1.1 (field
tags) · [`../02-ARCHITECTURE.md`](../../docs/07-buybox/ARCHITECTURE.md) §5.

**What this is:** A copy-paste-ready, read-only audit kit. It tells the dev
exactly which queries to run and how to write the report. It creates no code,
no migration, no schema change.

---

## 1. Objective

MaxBuy trains on `tav.purchase_outcomes`. Before any field is used as a model
feature it must be classified by how complete it actually is in history. The
audit produces a per-field null-rate table and assigns every field one of:

- **backfillable** — reconstructable from another existing table.
- **future-only** — populated reliably only going forward; history is sparse.
- **unavailable** — not obtainable for history; the model must treat NULL as a
  first-class value, never impute silently.

## 2. Scope & guardrails

- Read-only. `SELECT` only. No writes to any `tav.*` object.
- No licensed Cox/Manheim payloads are touched by this audit. `purchase_outcomes`
  holds derived numbers, not vendor payloads — safe to aggregate.
- Distinguish three kinds of "missing": column **absent** from the table,
  column present but **NULL**, and column present but **0 / empty string**
  (an effective miss for a price or mileage). Report all three.
- Every excluded row carries a documented reason — no silent drops in analysis.

## 3. Data sources

Primary: `tav.purchase_outcomes`. Reference tables for backfill assessment:
`tav.valuation_snapshots`, `tav.mmr_queries`, `tav.leads`,
`tav.vehicle_candidates`, `tav.import_rows` / `tav.import_batches`.

Columns present today on `tav.purchase_outcomes` (audit baseline):

```
id, lead_id, vehicle_candidate_id, purchase_price, mmr_value_at_purchase,
gross_profit_est, odometer_at_purchase, purchase_date, buyer, notes, vin,
year, make, model, mileage, source, region, listed_price, price_paid,
sale_price, gross_profit, hold_days, transport_cost, auction_fee,
misc_overhead, condition_grade_raw, condition_grade_normalized,
purchase_channel, selling_channel, week_label, buyer_id, closer_id,
cot_city, cot_state, import_batch_id, import_fingerprint, created_at
```

Before running, open [`../03-TECHNICAL-SPEC.md`](../../docs/07-buybox/TECHNICAL-SPEC.md) §1.1
and list every **proposed** `purchase_outcomes` addition. For each proposed
field, decide if it maps to an existing column above (audit it directly) or is
genuinely new (tag it `future-only` by definition and note the first source
that will populate it).

## 4. Methodology

### 4.1 Overall null + effective-miss rate per field

```sql
SELECT
  count(*)                                                          AS total_rows,
  -- financial
  count(*) FILTER (WHERE purchase_price IS NULL)                    AS purchase_price_null,
  count(*) FILTER (WHERE purchase_price = 0)                        AS purchase_price_zero,
  count(*) FILTER (WHERE price_paid IS NULL)                        AS price_paid_null,
  count(*) FILTER (WHERE price_paid = 0)                            AS price_paid_zero,
  count(*) FILTER (WHERE mmr_value_at_purchase IS NULL)             AS mmr_at_purchase_null,
  count(*) FILTER (WHERE mmr_value_at_purchase = 0)                 AS mmr_at_purchase_zero,
  count(*) FILTER (WHERE gross_profit IS NULL)                      AS gross_profit_null,
  count(*) FILTER (WHERE gross_profit_est IS NULL)                  AS gross_profit_est_null,
  count(*) FILTER (WHERE sale_price IS NULL)                        AS sale_price_null,
  count(*) FILTER (WHERE listed_price IS NULL)                      AS listed_price_null,
  count(*) FILTER (WHERE hold_days IS NULL)                         AS hold_days_null,
  count(*) FILTER (WHERE transport_cost IS NULL)                    AS transport_cost_null,
  count(*) FILTER (WHERE auction_fee IS NULL)                       AS auction_fee_null,
  count(*) FILTER (WHERE misc_overhead IS NULL)                     AS misc_overhead_null,
  -- vehicle identity
  count(*) FILTER (WHERE vin IS NULL OR vin = '')                   AS vin_missing,
  count(*) FILTER (WHERE year IS NULL)                              AS year_null,
  count(*) FILTER (WHERE make IS NULL OR make = '')                 AS make_missing,
  count(*) FILTER (WHERE model IS NULL OR model = '')               AS model_missing,
  count(*) FILTER (WHERE mileage IS NULL)                           AS mileage_null,
  count(*) FILTER (WHERE odometer_at_purchase IS NULL)              AS odometer_null,
  -- context
  count(*) FILTER (WHERE source IS NULL OR source = '')             AS source_missing,
  count(*) FILTER (WHERE region IS NULL OR region = '')             AS region_missing,
  count(*) FILTER (WHERE purchase_date IS NULL)                     AS purchase_date_null,
  count(*) FILTER (WHERE condition_grade_normalized IS NULL)        AS cond_norm_null,
  count(*) FILTER (WHERE condition_grade_normalized = 'unknown')    AS cond_norm_unknown,
  count(*) FILTER (WHERE purchase_channel IS NULL)                  AS purchase_channel_null,
  count(*) FILTER (WHERE selling_channel IS NULL)                   AS selling_channel_null,
  -- provenance / linkage
  count(*) FILTER (WHERE lead_id IS NULL)                           AS lead_id_null,
  count(*) FILTER (WHERE vehicle_candidate_id IS NULL)              AS candidate_id_null,
  count(*) FILTER (WHERE buyer_id IS NULL OR buyer_id = '')         AS buyer_id_missing,
  count(*) FILTER (WHERE closer_id IS NULL OR closer_id = '')       AS closer_id_missing,
  count(*) FILTER (WHERE week_label IS NULL OR week_label = '')     AS week_label_missing
FROM tav.purchase_outcomes;
```

### 4.2 Completeness trend over time

A field can be 60% null overall but 5% null in recent months. Slice by purchase
period so the model uses the *recent* completeness, not the lifetime average.

```sql
SELECT
  date_trunc('quarter', purchase_date)                              AS purchase_quarter,
  count(*)                                                          AS rows,
  round(100.0 * count(*) FILTER (WHERE mmr_value_at_purchase IS NULL) / count(*), 1) AS mmr_null_pct,
  round(100.0 * count(*) FILTER (WHERE sale_price IS NULL)          / count(*), 1) AS sale_price_null_pct,
  round(100.0 * count(*) FILTER (WHERE hold_days IS NULL)           / count(*), 1) AS hold_days_null_pct,
  round(100.0 * count(*) FILTER (WHERE condition_grade_normalized IS NULL) / count(*), 1) AS cond_null_pct,
  round(100.0 * count(*) FILTER (WHERE vin IS NULL OR vin = '')     / count(*), 1) AS vin_missing_pct
FROM tav.purchase_outcomes
WHERE purchase_date IS NOT NULL
GROUP BY 1
ORDER BY 1;
```

### 4.3 Duplicate-field reconciliation

`purchase_outcomes` carries pairs that may both, either, or neither be
populated. Determine which is authoritative before modeling:

- `purchase_price` vs `price_paid`
- `gross_profit_est` vs `gross_profit`
- `mileage` vs `odometer_at_purchase`

```sql
SELECT
  count(*) FILTER (WHERE purchase_price IS NOT NULL AND price_paid IS NULL)        AS only_purchase_price,
  count(*) FILTER (WHERE price_paid IS NOT NULL AND purchase_price IS NULL)        AS only_price_paid,
  count(*) FILTER (WHERE purchase_price IS NOT NULL AND price_paid IS NOT NULL
                   AND purchase_price <> price_paid)                              AS both_set_disagree,
  count(*) FILTER (WHERE mileage IS NOT NULL AND odometer_at_purchase IS NULL)     AS only_mileage,
  count(*) FILTER (WHERE odometer_at_purchase IS NOT NULL AND mileage IS NULL)     AS only_odometer,
  count(*) FILTER (WHERE gross_profit IS NOT NULL AND gross_profit_est IS NULL)    AS only_gross_actual,
  count(*) FILTER (WHERE gross_profit_est IS NOT NULL AND gross_profit IS NULL)    AS only_gross_est
FROM tav.purchase_outcomes;
```

### 4.4 Backfill feasibility check

For each `unavailable`-looking field, test whether a reference table can supply
it. Example — `mmr_value_at_purchase` from `valuation_snapshots` via
`vehicle_candidate_id`:

```sql
SELECT
  count(*)                                                          AS po_missing_mmr,
  count(vs.id)                                                      AS recoverable_from_snapshots
FROM tav.purchase_outcomes po
LEFT JOIN LATERAL (
  SELECT id FROM tav.valuation_snapshots vs
  WHERE vs.vehicle_candidate_id = po.vehicle_candidate_id
    AND vs.mmr_value IS NOT NULL
  ORDER BY vs.fetched_at DESC
  LIMIT 1
) vs ON true
WHERE po.mmr_value_at_purchase IS NULL
  AND po.vehicle_candidate_id IS NOT NULL;
```

A field is **backfillable** only if a reference table recovers a material
share of the missing rows.

## 5. Deliverable — report template

Commit as `audits/reports/06-field-completeness-report.md` (create
`reports/` when the first report is committed):

```markdown
# Report 06 — Historical Field Completeness
Run date: YYYY-MM-DD · Rows in purchase_outcomes: N · Date range: ... to ...

## Per-field completeness
| Field | Type | Null % | Zero/empty % | Effective-miss % | Recent-quarter miss % | Tag | NULL-handling decision |
|---|---|---|---|---|---|---|---|
| mmr_value_at_purchase | int | .. | .. | .. | .. | backfillable | impute from valuation_snapshots |
| ... | | | | | | | |

## Duplicate-field verdicts
- purchase_price vs price_paid: authoritative = ...
- gross_profit vs gross_profit_est: authoritative = ...
- mileage vs odometer_at_purchase: authoritative = ...

## Fields proposed in TECHNICAL-SPEC §1.1 not yet in the table
| Proposed field | Maps to existing? | Tag | First populating source |

## Recommended model behavior for NULL-heavy fields
...
```

## 6. Data-shape findings to expect

Seed the report by confirming or refuting these — they are visible from the
schema alone and must be resolved:

1. `purchase_outcomes` has **no `trim` column** — trim-level features must come
   from `vehicle_candidates` / `historical_sales` or be tagged `unavailable`.
   This also constrains Audit Kit 07.
2. Three duplicate-intent field pairs exist (§4.3) — modeling must pick one per
   pair, not average them.
3. `lead_id` is nullable by design — historical CSV imports have no Lead.
   Any feature joined through `leads` inherits that null rate.
4. Provenance fields (`buyer_id`, `closer_id`, `cot_city`, `cot_state`,
   `week_label`) were added across migrations 0018–0019 — expect them
   `unavailable` for pre-migration rows and `future-only` thereafter.

## 7. Definition of done

Per-field null-rate table committed alongside this doc; field tags in
[`../03-TECHNICAL-SPEC.md`](../../docs/07-buybox/TECHNICAL-SPEC.md) §1.1 confirmed against the
audit; NULL-handling decision recorded for every NULL-heavy modeled field.
