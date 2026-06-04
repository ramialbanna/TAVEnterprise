# MaxBuy Historical Outcome Backfill Template

**Purpose:** Use this template to collect the external historical data that
exists outside the DB, so Phase 0 can load or stage the missing MaxBuy fields
before Phase 1 application code.

## Files

- `historical-outcome-backfill-template.csv` — the blank import template.
- `historical-outcome-backfill-data-dictionary.csv` — field definitions,
  required status, expected formats, and likely DB targets.

## How to use it

1. Open `historical-outcome-backfill-template.csv` in Excel, Google Sheets, or
   your export tool.
2. Keep the header row exactly as-is.
3. Add one row per historical purchased unit.
4. Fill every field you have from the source system, especially:
   - `purchase_date`
   - `mileage_at_purchase` or `odometer_at_purchase`
   - `mmr_value_at_purchase` or `mmr_snapshot_id`
   - `vin` or another durable join key
   - `price_paid`
   - `sale_price`
   - `year`, `make`, `model`
5. Leave unknown fields blank. Do not invent linkage or inferred values unless
   the source explicitly supports them.
6. If a row should not be imported, fill `exclude_reason_code`.

## Required before DB loading

Before any import/update, produce aggregate counts only:

| Check | Required aggregate |
|---|---|
| Row count | total template rows |
| Purchase date coverage | count and percent with `purchase_date` |
| Mileage coverage | count and percent with `mileage_at_purchase` or `odometer_at_purchase` |
| MMR coverage | count and percent with `mmr_value_at_purchase` or `mmr_snapshot_id` |
| Identity coverage | count and percent with VIN, stock number, or existing outcome id |
| Economics coverage | count and percent with `price_paid` and `sale_price` |
| Linkage coverage | count and percent with `lead_id` or `vehicle_candidate_id` |
| Exclusions | count by `exclude_reason_code` |

## Safety rules

- Do not commit filled templates.
- Do not paste raw VIN rows into reports.
- Do not paste individual MMR values into reports.
- Do not include raw Cox / Manheim payloads.
- Do not include secrets, URLs with tokens, passwords, or API keys.
- Keep reports aggregate-only.

## Recommended matching order

1. `existing_purchase_outcome_id`
2. `existing_import_fingerprint`
3. `vin` + `purchase_date` + price sanity check
4. `stock_number` + `purchase_date`
5. manual review queue

If linkage is not defensible, leave `lead_id` and `vehicle_candidate_id` blank.
