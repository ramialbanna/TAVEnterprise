# MaxBuy Audit 20 — Historical Outcome Backfill Plan

**Punch item:** Phase 0 data backfill gate · **Date:** 2026-05-20 ·
**Status:** Planned

## 1. Purpose

The live audits proved that `tav.purchase_outcomes` does not currently carry
the historical context MaxBuy needs: purchase date, mileage at purchase,
day-of MMR, and linkage back to the Vehicle Candidate / Lead pipeline. TAV
ownership has confirmed that the missing data exists outside the database.

Therefore MaxBuy should **not pivot**. Instead, Phase 1 is preceded by a
bounded Phase 0 backfill: load the known external outcome data, verify it, and
re-run audits 6, 7, 9, and 10 before writing MaxBuy application code.

## 2. Non-negotiables

- Do not paste or commit raw VIN lists, raw vendor payloads, secrets, or
  individual Manheim / Cox valuation figures.
- Use staging/import review first; do not mutate production `tav.*` rows until
  the mapping and rollback plan are approved.
- Preserve the four-concept boundary. Backfill may link outcomes to
  `vehicle_candidates` or `leads`, but it must not collapse Raw Listing,
  Normalized Listing, Vehicle Candidate, or Lead into the outcome table.
- Every excluded import row must have a structured reason code.

## 3. Minimum source inventory

Before migration or import code, inventory the external source files/tables and
answer these questions in aggregate only:

| Question | Required output |
|---|---|
| Row count | total rows available for historical outcome backfill |
| Time coverage | earliest and latest purchase / acquisition date |
| Identity coverage | percent with VIN, stock number, buyer id, closer id, or other join key |
| Vehicle coverage | percent with year, make, model, trim, mileage / odometer |
| Economics coverage | percent with price paid, sale price, expenses, gross / net gross |
| MMR coverage | percent with day-of MMR or a safe reference to a lookup snapshot |
| Pipeline linkage | percent matchable to `vehicle_candidates`, `leads`, or existing outcomes |
| License boundary | which fields are safe to persist vs derived-only / reference-only |

## 4. Target field contract

The backfill should prioritize the smallest field set that unblocks MaxBuy
training and audit replay:

| Target | Required for | Notes |
|---|---|---|
| `purchase_date` / acquisition date | recency weighting, decay audit, sale-week backtests | Do not use import timestamp as a substitute. |
| `mileage` or `odometer_at_purchase` | mileage bands, MMR lookup quality, segment support | Prefer true purchase odometer over estimated mileage. |
| `mmr_value_at_purchase` or immutable snapshot reference | residual audit, promotion gate calibration | Persist only safe derived values or references allowed by vendor terms. |
| `vin` or durable internal join key | dedupe, pipeline linkage, MMR matching | Raw VINs must stay inside DB; reports use counts only. |
| `vehicle_candidate_id` / `lead_id` where matchable | replay and attribution | Null is allowed when no defensible match exists. |
| `region` / source location | segment fallback and transport assumptions | Normalize to existing region taxonomy where possible. |
| `trim` if available | segment quality and MMR quality | May land in a staging or future extension if not currently present. |
| expense components | net-gross policy and benchmark views | Keep `price_paid` + `gross_profit` authoritative unless reconciled. |

## 5. Matching strategy

Use deterministic matches before fuzzy matches:

1. Existing `purchase_outcomes.id` / import fingerprint / row hash, if present.
2. VIN + purchase date window + price paid / sale price sanity match.
3. Stock number or source system id + date window, if present in both sources.
4. VIN to `vehicle_candidates` where candidate VIN exists.
5. Candidate/Lead fuzzy match only after explicit review thresholds are defined.

Rows that cannot be matched safely should still be imported into a reviewed
historical outcome staging path, but must keep `lead_id` and
`vehicle_candidate_id` null rather than inventing linkage.

## 6. Verification gates

After backfill, re-run the live audit packet or equivalent SELECT-only checks
and require:

| Gate | Pass condition |
|---|---|
| Field completeness | `purchase_date`, mileage/odometer, and MMR-at-purchase coverage reported with aggregate counts |
| Recency support | Q7.3 returns rows; effective-N can be computed |
| Segment support | `mileage_band` no longer entirely `unknown`; region coverage measured |
| Residual audit | Q9.4a/Q9.4b return rows or a documented small-N reason |
| Decay validation | Audit #10 can run a sale-week / purchase-week backtest |
| Data quality | model artifacts (`q60 ·`, `4runner ·`, make=`2024`) have a cleaning rule or exclusion reason |
| Safety | no raw VINs, raw payloads, secrets, or individual MMR figures appear in committed reports |

## 7. Exit criteria

Phase 0 is closed when:

1. The external source inventory is documented in aggregate.
2. The approved mapping identifies each target field as loaded, deferred, or
   unavailable with a reason.
3. The import/backfill path has a rollback plan and does not violate vendor
   retention or persistence restrictions.
4. Audits 6, 7, 9, and 10 are re-run and their reports updated.
5. The Phase 1 go/no-go decision is updated in `06-EXECUTION-PLAN.md`.

Only then should MaxBuy start `TAV-BB-phase-1-data-foundation`.

## 8. Operator prompt

```text
Create the MaxBuy Phase 0 historical outcome backfill package. Use audit 20 as
the plan. Do not write app code. First inventory the external source data in
aggregate, then propose the staging/import mapping for purchase_date,
mileage/odometer, day-of MMR or snapshot reference, VIN/internal linkage,
region/source, trim, and expense fields. Preserve the Raw Listing /
Normalized Listing / Vehicle Candidate / Lead boundary. Do not paste or commit
raw VINs, secrets, raw vendor payloads, or individual MMR values. End with the
verification queries needed to re-run audits 6, 7, 9, and 10 after backfill.
```
