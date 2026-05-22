# Phase 0 Backfill — `tav.purchase_outcomes` Load SQL Package

**Punch item:** #20 (Phase 0 gate) · **Date:** 2026-05-22 · **Status:**
**Planning + SQL only — not executed.** No production load run. No migration
file created. No app / UI / ML / scoring / Phase 1 work.

**Sources:** [`maxbuy.md`](maxbuy.md) · [`20-historical-outcome-backfill-report.md`](20-historical-outcome-backfill-report.md)
· current `supabase/schema.sql` (`tav.purchase_outcomes`).

**Purpose:** retarget the Phase 0 historical-outcome backfill — delivered
originally against a standalone `buybox.*` schema — onto the canonical
`tav.purchase_outcomes` table, as an additive, idempotent, reversible load.

---

## 0. Guardrails (carry into every step)

- **Canonical target is `tav.purchase_outcomes`.** No standalone `buybox.*`
  table. The originally delivered `supabase_buybox_*.sql` is superseded.
- **Four-concept boundary preserved.** `purchase_outcomes` is the outcome layer
  *downstream of Lead*. This package adds columns to it and inserts rows. It
  does **not** touch `raw_listings`, `normalized_listings`,
  `vehicle_candidates`, or `leads`, and does not collapse any two concepts.
- **`lead_id` / `vehicle_candidate_id` are never written by this load.** On
  INSERT they default NULL (no history linkage exists); on UPDATE they are
  **excluded from the `SET` list** so an existing row's linkage is never
  overwritten.
- **Re-entry cycles preserved.** Each (VIN, acquisition-cycle) is its own row;
  `cycle_seq` distinguishes the 2,868 re-entries.
- **Additive only.** Every `ALTER` adds a nullable column or an index — no
  drop, no type change, no `NOT NULL`, no rewriting default. Safe on the
  existing rows.
- **No licensed data in this doc.** SQL templates only — no VINs, no MMR
  dollar values, no Cox/Manheim payloads.
- **Execution is gated.** See §7. Nothing here runs until the owner approves.

## 1. Schema diff — backfill fields vs `tav.purchase_outcomes`

Current `tav.purchase_outcomes` columns (from `supabase/schema.sql`): `id,
lead_id, vehicle_candidate_id, purchase_price, mmr_value_at_purchase,
gross_profit_est, odometer_at_purchase, purchase_date, buyer, notes, vin, year,
make, model, mileage, source, region, listed_price, price_paid, sale_price,
gross_profit, hold_days, transport_cost, auction_fee, misc_overhead,
condition_grade_raw, condition_grade_normalized, purchase_channel,
selling_channel, week_label, buyer_id, closer_id, cot_city, cot_state,
import_batch_id, import_fingerprint, created_at`.

### 1.1 Backfill field → column → action

| Backfill field | Target column | Status |
|---|---|---|
| `vin, year, make, model` | same | exists |
| `purchase_date` | `purchase_date` | exists |
| `price_paid, sale_price, gross_profit` | same | exists |
| `mileage_at_purchase` | `mileage` | exists (rename on map) |
| `odometer_at_purchase` | `odometer_at_purchase` | exists |
| `mmr_value_at_purchase` | same | exists |
| `region, source` | same | exists |
| `purchase_channel, selling_channel` | same | exists (enum-checked) |
| `condition_grade_raw, condition_grade_normalized` | same | exists (enum-checked) |
| `buyer_id, closer_id` | same | exists |
| `transport_cost, auction_fee, misc_overhead` | same | exists |
| `notes` | `notes` | exists |
| `import_fingerprint` | `import_fingerprint` | exists — **needs unique index** |
| `trim` | `trim` | **MISSING — add** |
| `sale_date` | `sale_date` | **MISSING — add** |
| `net_gross` | `net_gross` | **MISSING — add** |
| (derived) cycle number | `cycle_seq` | **MISSING — add** |
| `recon_cost` | `recon_cost` | **MISSING — add** |
| `expense_total` | `expense_total` | **MISSING — add** |
| `mmr_source, mmr_method, mmr_lookup_date` | same | **MISSING — add** |
| `mmr_snapshot_id` | `mmr_snapshot_id` | **MISSING — add** |
| `lead_id, vehicle_candidate_id` | same | exists — **never written by this load** |
| 8 hard-gate flags + `announcement_flags_json` | — | **deferred** — staging only; Phase-1 additive set |
| `source_system, source_file_name, source_row_id, import_batch_label, stock_number, existing_*, match_*, exclude_reason_code` | — | **staging only** (provenance / QA) |

### 1.2 Two type notes that change the plan

- **`import_batch_id` is `uuid`**, not text. The backfill's human label
  `phase0-backfill-2026-05-22` cannot go in directly. This package derives a
  deterministic batch UUID: `md5('phase0-backfill-2026-05-22')::uuid` —
  stable across re-runs, traceable, and what rollback (§5) keys on.
- **`import_fingerprint` has no unique index today.** `ON CONFLICT` requires
  one; §2 adds it after a duplicate pre-check.

## 2. Additive migration plan (missing fields only)

Apply as a new migration **`supabase/migrations/0045_purchase_outcomes_maxbuy_backfill_fields.sql`**
when approved. Not created here — this is the plan.

```sql
-- 0045 — additive MaxBuy Phase 0 backfill columns. Additive only:
-- nullable adds (metadata-only, no table rewrite) + one unique index.

ALTER TABLE tav.purchase_outcomes
  ADD COLUMN IF NOT EXISTS trim             text,
  ADD COLUMN IF NOT EXISTS sale_date        date,
  ADD COLUMN IF NOT EXISTS cycle_seq        smallint,
  ADD COLUMN IF NOT EXISTS net_gross        integer,
  ADD COLUMN IF NOT EXISTS recon_cost       integer,
  ADD COLUMN IF NOT EXISTS expense_total    integer,
  ADD COLUMN IF NOT EXISTS mmr_source       text,
  ADD COLUMN IF NOT EXISTS mmr_method       text,
  ADD COLUMN IF NOT EXISTS mmr_lookup_date  date,
  ADD COLUMN IF NOT EXISTS mmr_snapshot_id  uuid;

ALTER TABLE tav.purchase_outcomes
  ADD CONSTRAINT purchase_outcomes_cycle_seq_chk
    CHECK (cycle_seq IS NULL OR cycle_seq >= 1),
  ADD CONSTRAINT purchase_outcomes_recon_cost_chk
    CHECK (recon_cost IS NULL OR recon_cost >= 0),
  ADD CONSTRAINT purchase_outcomes_expense_total_chk
    CHECK (expense_total IS NULL OR expense_total >= 0);
```

Unique index for the upsert key — **run the pre-check first**:

```sql
-- Pre-check: there must be no existing duplicate non-null fingerprints,
-- or the unique index creation fails. Expect 0 rows.
SELECT import_fingerprint, count(*)
FROM tav.purchase_outcomes
WHERE import_fingerprint IS NOT NULL
GROUP BY 1 HAVING count(*) > 1;

-- If the pre-check returned 0 rows:
CREATE UNIQUE INDEX IF NOT EXISTS purchase_outcomes_import_fingerprint_key
  ON tav.purchase_outcomes (import_fingerprint);
-- NULL fingerprints remain allowed and are treated as distinct by Postgres.
```

Deferred (Phase 1, not now): the 8 hard-gate flag booleans +
`announcement_flags_json` — MaxBuy scoring inputs, mostly unpopulated by the
backfill; they stay in the staging table this phase.

## 3. Staging table DDL

All-text staging absorbs CSV quirks (`2024.0`, blank cells); casts happen on
merge. Transient — underscore-prefixed, dropped after load.

```sql
DROP TABLE IF EXISTS tav._stg_phase0_backfill;
CREATE TABLE tav._stg_phase0_backfill (
  source_system text, source_file_name text, source_row_id text,
  import_batch_label text, existing_purchase_outcome_id text,
  existing_import_fingerprint text, vin text, stock_number text,
  year text, make text, model text, trim text,
  purchase_date text, sale_date text, price_paid text, sale_price text,
  gross_profit text, net_gross text, mileage_at_purchase text,
  odometer_at_purchase text, mmr_value_at_purchase text, mmr_snapshot_id text,
  mmr_source text, mmr_method text, mmr_lookup_date text, region text,
  source text, purchase_channel text, selling_channel text,
  condition_grade_raw text, condition_grade_normalized text,
  buyer_id text, closer_id text, lead_id text, vehicle_candidate_id text,
  transport_cost text, auction_fee text, recon_cost text, misc_overhead text,
  expense_total text, title_brand_flag text, salvage_flag text, flood_flag text,
  frame_structural_flag text, odometer_issue_flag text, recall_stop_sale_flag text,
  arbitration_flag text, source_restricted_flag text, announcement_flags_json text,
  match_confidence text, match_method text, exclude_reason_code text, notes text,
  -- present in buybox_master.csv; absent from the blank operator template.
  -- Staging tolerates either: the merge COALESCEs to a derived value.
  cycle_seq text, display_id text
);

-- Load (psql):
-- \copy tav._stg_phase0_backfill FROM 'buybox_master.csv' WITH (FORMAT csv, HEADER true)
```

If the load file's column order/set differs from the above, adjust this DDL to
match the file — staging must mirror the CSV exactly.

## 4. Idempotent upsert — keyed on `import_fingerprint`

`cycle_seq` is taken from the CSV when present, else derived as the
acquisition-date rank within a VIN (preserves re-entry cycles). The
fingerprint `md5(vin · cycle_seq · source_file)` makes re-runs and forward
loads converge on the same row.

```sql
BEGIN;

WITH cleaned AS (
  SELECT
    upper(regexp_replace(coalesce(vin,''), '[^A-Za-z0-9]', '', 'g')) AS vin_clean,
    *
  FROM tav._stg_phase0_backfill
  WHERE coalesce(exclude_reason_code,'') = ''                       -- documented exclusions skipped
),
keyed AS (
  SELECT
    *,
    COALESCE(
      nullif(cycle_seq,'')::smallint,
      row_number() OVER (PARTITION BY vin_clean
                         ORDER BY nullif(purchase_date,'')::date, source_row_id)::smallint
    ) AS cycle_seq_final
  FROM cleaned
  WHERE length(vin_clean) = 17                                      -- invalid VINs skipped (reason: invalid_vin)
)
INSERT INTO tav.purchase_outcomes (
  vin, cycle_seq, import_fingerprint, import_batch_id,
  year, make, model, trim, purchase_date, sale_date,
  price_paid, sale_price, gross_profit, net_gross,
  mileage, odometer_at_purchase,
  mmr_value_at_purchase, mmr_snapshot_id, mmr_source, mmr_method, mmr_lookup_date,
  region, source, purchase_channel, selling_channel,
  condition_grade_raw, condition_grade_normalized,
  buyer_id, closer_id,
  transport_cost, auction_fee, recon_cost, misc_overhead, expense_total,
  notes
)
SELECT
  vin_clean,
  cycle_seq_final,
  md5(vin_clean || '|' || cycle_seq_final || '|' || coalesce(source_file_name,'')),
  md5('phase0-backfill-2026-05-22')::uuid,
  nullif(year,'')::numeric::int::smallint,
  nullif(make,''), nullif(model,''), nullif(trim,''),
  nullif(purchase_date,'')::date, nullif(sale_date,'')::date,
  nullif(price_paid,'')::numeric::int,
  nullif(sale_price,'')::numeric::int,
  nullif(gross_profit,'')::numeric::int,
  nullif(net_gross,'')::numeric::int,
  nullif(mileage_at_purchase,'')::numeric::int,
  nullif(odometer_at_purchase,'')::numeric::int,
  nullif(mmr_value_at_purchase,'')::numeric::int,
  nullif(mmr_snapshot_id,'')::uuid,
  nullif(mmr_source,''), nullif(mmr_method,''), nullif(mmr_lookup_date,'')::date,
  nullif(region,''), nullif(source,''),
  nullif(purchase_channel,''), nullif(selling_channel,''),
  nullif(condition_grade_raw,''), nullif(condition_grade_normalized,''),
  nullif(buyer_id,''), nullif(closer_id,''),
  nullif(transport_cost,'')::numeric::int,
  nullif(auction_fee,'')::numeric::int,
  nullif(recon_cost,'')::numeric::int,
  nullif(misc_overhead,'')::numeric::int,
  nullif(expense_total,'')::numeric::int,
  nullif(notes,'')
FROM keyed
ON CONFLICT (import_fingerprint) DO UPDATE SET
  vin                        = EXCLUDED.vin,
  cycle_seq                  = EXCLUDED.cycle_seq,
  import_batch_id            = EXCLUDED.import_batch_id,
  year                       = EXCLUDED.year,
  make                       = EXCLUDED.make,
  model                      = EXCLUDED.model,
  trim                       = EXCLUDED.trim,
  purchase_date              = EXCLUDED.purchase_date,
  sale_date                  = EXCLUDED.sale_date,
  price_paid                 = EXCLUDED.price_paid,
  sale_price                 = EXCLUDED.sale_price,
  gross_profit               = EXCLUDED.gross_profit,
  net_gross                  = EXCLUDED.net_gross,
  mileage                    = EXCLUDED.mileage,
  odometer_at_purchase       = EXCLUDED.odometer_at_purchase,
  mmr_value_at_purchase      = EXCLUDED.mmr_value_at_purchase,
  mmr_snapshot_id            = EXCLUDED.mmr_snapshot_id,
  mmr_source                 = EXCLUDED.mmr_source,
  mmr_method                 = EXCLUDED.mmr_method,
  mmr_lookup_date            = EXCLUDED.mmr_lookup_date,
  region                     = EXCLUDED.region,
  source                     = EXCLUDED.source,
  purchase_channel           = EXCLUDED.purchase_channel,
  selling_channel            = EXCLUDED.selling_channel,
  condition_grade_raw        = EXCLUDED.condition_grade_raw,
  condition_grade_normalized = EXCLUDED.condition_grade_normalized,
  buyer_id                   = EXCLUDED.buyer_id,
  closer_id                  = EXCLUDED.closer_id,
  transport_cost             = EXCLUDED.transport_cost,
  auction_fee                = EXCLUDED.auction_fee,
  recon_cost                 = EXCLUDED.recon_cost,
  misc_overhead              = EXCLUDED.misc_overhead,
  expense_total              = EXCLUDED.expense_total,
  notes                      = EXCLUDED.notes;
  -- NOT in the SET list, by design: id, created_at, import_fingerprint,
  -- lead_id, vehicle_candidate_id. Pre-existing linkage is never overwritten.

COMMIT;
```

Rows skipped (invalid VIN, `exclude_reason_code` set) are documented exclusions
— quantify them with the dry-run in §6 before the merge; no silent drops.

## 5. Rollback — keyed on `import_batch_id`

```sql
-- Run BEFORE the merge: cheap snapshot (table holds derived numbers only).
CREATE TABLE IF NOT EXISTS tav._po_backup_2026_05_22 AS
  SELECT * FROM tav.purchase_outcomes;

-- ── Rollback A — remove every row this batch INSERTED (the expected case) ──
DELETE FROM tav.purchase_outcomes
WHERE import_batch_id = md5('phase0-backfill-2026-05-22')::uuid;

-- ── Rollback B — only if the merge UPDATED pre-existing rows ──
-- (the §6 overlap dry-run tells you whether this case applies). Full restore:
BEGIN;
  DELETE FROM tav.purchase_outcomes;
  INSERT INTO tav.purchase_outcomes SELECT * FROM tav._po_backup_2026_05_22;
COMMIT;

-- Verify rollback:
SELECT count(*) AS remaining_batch_rows
FROM tav.purchase_outcomes
WHERE import_batch_id = md5('phase0-backfill-2026-05-22')::uuid;   -- expect 0

-- Drop the snapshot once the load is confirmed good:
-- DROP TABLE tav._po_backup_2026_05_22;
```

## 6. Dry-run validation — run on staging BEFORE the merge

All `SELECT`-only. Run after `\copy` into staging, before §4.

### 6.1 The eleven required assertions

```sql
WITH s AS (
  SELECT * FROM tav._stg_phase0_backfill WHERE coalesce(exclude_reason_code,'') = ''
)
SELECT
  count(*)                                                                 AS cycles,
  (count(*) = 57228)                                                       AS pass_57228_cycles,
  count(DISTINCT upper(regexp_replace(coalesce(vin,''),'[^A-Za-z0-9]','','g'))) AS distinct_vins,
  (count(DISTINCT upper(regexp_replace(coalesce(vin,''),'[^A-Za-z0-9]','','g'))) = 53598) AS pass_53598_vins,
  round(100.0*count(*) FILTER (WHERE nullif(purchase_date,'')        IS NOT NULL)/count(*),1) AS purchase_date_pct,
  round(100.0*count(*) FILTER (WHERE nullif(mileage_at_purchase,'')  IS NOT NULL)/count(*),1) AS mileage_pct,
  round(100.0*count(*) FILTER (WHERE nullif(price_paid,'')           IS NOT NULL)/count(*),1) AS price_paid_pct,
  round(100.0*count(*) FILTER (WHERE nullif(sale_price,'')           IS NOT NULL)/count(*),1) AS sale_price_pct,
  round(100.0*count(*) FILTER (WHERE nullif(gross_profit,'')         IS NOT NULL)/count(*),1) AS gross_profit_pct,
  round(100.0*count(*) FILTER (WHERE nullif(mmr_value_at_purchase,'')IS NOT NULL)/count(*),1) AS mmr_pct,
  round(100.0*count(*) FILTER (WHERE nullif(trim,'')                 IS NOT NULL)/count(*),1) AS trim_pct,
  round(100.0*count(*) FILTER (WHERE nullif(region,'')               IS NOT NULL)/count(*),1) AS region_pct
FROM s;
```

Expected: `pass_57228_cycles = true`, `pass_53598_vins = true`,
`purchase_date_pct / mileage_pct / price_paid_pct / sale_price_pct /
gross_profit_pct = 100.0`, `mmr_pct ≈ 92`, `trim_pct ≈ 99`, `region_pct ≈ 78`.

### 6.2 Zero duplicate `(vin, cycle_seq)`

```sql
WITH s AS (
  SELECT
    upper(regexp_replace(coalesce(vin,''),'[^A-Za-z0-9]','','g')) AS vin_clean,
    COALESCE(
      nullif(cycle_seq,'')::smallint,
      row_number() OVER (
        PARTITION BY upper(regexp_replace(coalesce(vin,''),'[^A-Za-z0-9]','','g'))
        ORDER BY nullif(purchase_date,'')::date, source_row_id)::smallint
    ) AS cycle_seq_final
  FROM tav._stg_phase0_backfill
  WHERE coalesce(exclude_reason_code,'') = ''
)
SELECT count(*) AS duplicate_vin_cycle_pairs           -- expect 0
FROM (SELECT vin_clean, cycle_seq_final FROM s GROUP BY 1,2 HAVING count(*) > 1) d;
```

### 6.3 Enum pre-check (would fail the merge `CHECK` constraints)

```sql
SELECT 'condition_grade_normalized' AS field, condition_grade_normalized AS bad_value, count(*)
FROM tav._stg_phase0_backfill
WHERE coalesce(exclude_reason_code,'')='' AND nullif(condition_grade_normalized,'') IS NOT NULL
  AND condition_grade_normalized NOT IN ('excellent','good','fair','poor','unknown')
GROUP BY 2
UNION ALL
SELECT 'purchase_channel', purchase_channel, count(*)
FROM tav._stg_phase0_backfill
WHERE coalesce(exclude_reason_code,'')='' AND nullif(purchase_channel,'') IS NOT NULL
  AND purchase_channel NOT IN ('auction','private','dealer')
GROUP BY 2
UNION ALL
SELECT 'selling_channel', selling_channel, count(*)
FROM tav._stg_phase0_backfill
WHERE coalesce(exclude_reason_code,'')='' AND nullif(selling_channel,'') IS NOT NULL
  AND selling_channel NOT IN ('retail','wholesale','auction')
GROUP BY 2;
-- Expect 0 rows. Any row is a value that must be conformed before the merge.
```

### 6.4 Merge dry-run — insert vs update, and existing-row overlap

```sql
-- How the merge would split:
WITH fp AS (
  SELECT md5(
    upper(regexp_replace(coalesce(vin,''),'[^A-Za-z0-9]','','g')) || '|' ||
    COALESCE(nullif(cycle_seq,'')::smallint,
      row_number() OVER (
        PARTITION BY upper(regexp_replace(coalesce(vin,''),'[^A-Za-z0-9]','','g'))
        ORDER BY nullif(purchase_date,'')::date, source_row_id)) || '|' ||
    coalesce(source_file_name,'')) AS import_fingerprint
  FROM tav._stg_phase0_backfill
  WHERE coalesce(exclude_reason_code,'')=''
)
SELECT count(*)                                          AS staged_rows,
       count(*) FILTER (WHERE po.import_fingerprint IS NOT NULL) AS would_update,
       count(*) FILTER (WHERE po.import_fingerprint IS NULL)     AS would_insert
FROM fp LEFT JOIN tav.purchase_outcomes po USING (import_fingerprint);

-- Existing-rows overlap — the pre-flight question (see §7):
SELECT
  (SELECT count(*) FROM tav.purchase_outcomes)                          AS existing_rows_total,
  (SELECT count(*) FROM tav.purchase_outcomes
     WHERE import_batch_id = md5('phase0-backfill-2026-05-22')::uuid)    AS existing_this_batch,
  (SELECT count(DISTINCT upper(regexp_replace(coalesce(vin,''),'[^A-Za-z0-9]','','g')))
     FROM tav.purchase_outcomes
     WHERE upper(regexp_replace(coalesce(vin,''),'[^A-Za-z0-9]','','g')) IN (
       SELECT upper(regexp_replace(coalesce(vin,''),'[^A-Za-z0-9]','','g'))
       FROM tav._stg_phase0_backfill))                                  AS vins_overlapping_existing;
```

### 6.5 Excluded-row accounting (no silent drops)

```sql
SELECT coalesce(nullif(exclude_reason_code,''),
                CASE WHEN length(upper(regexp_replace(coalesce(vin,''),'[^A-Za-z0-9]','','g'))) <> 17
                     THEN 'invalid_vin' END) AS exclude_reason,
       count(*) AS rows
FROM tav._stg_phase0_backfill
WHERE coalesce(exclude_reason_code,'') <> ''
   OR length(upper(regexp_replace(coalesce(vin,''),'[^A-Za-z0-9]','','g'))) <> 17
GROUP BY 1;
```

## 7. STOP — explicit gate before the production merge

**Do not run §4 until all of the following are cleared with the owner:**

1. **Existing-rows decision (blocker).** `tav.purchase_outcomes` already holds
   ~12,904 rows (per Audit 06) — the incomplete pre-backfill data. The §6.4
   overlap query quantifies how many VINs they share with the 57,228-row
   backfill. The upsert keys on `import_fingerprint`; legacy rows carry a
   *different* fingerprint formula, so without a decision the merge **adds
   57,228 rows alongside the 12,904**, duplicating VINs. Owner must choose:
   archive/remove the legacy partial rows first (recommended — the backfill is
   the corrected superset), or define a VIN-level reconciliation. **Not decided
   here.**
2. §2 migration `0045` applied; `import_fingerprint` unique-index pre-check
   returned 0 rows.
3. §6.1 shows `pass_57228_cycles` and `pass_53598_vins` true and the fill
   percentages on target.
4. §6.2 returns `0`.
5. §6.3 returns 0 rows (no enum violations).
6. §6.5 exclusion counts reviewed and accepted.
7. §5 pre-load snapshot taken (or a Supabase PITR timestamp recorded).

Only then: run §4 inside its `BEGIN; … COMMIT;`. After load, run the Audit
6/7/9/10 verification queries in [`20-historical-outcome-backfill-report.md`](20-historical-outcome-backfill-report.md)
§7. This package executes nothing — it is the reviewed plan.
