# Phase 0 Backfill — `tav.purchase_outcomes` Load SQL Package

**Punch item:** #20 (Phase 0 gate) · **Date:** 2026-05-22 · **Status:**
**SQL reconciled to the real `buybox_master.csv` export — not executed.**
Migration `0045` is applied. §3 / §4 / §6 below are reconciled to the actual
48-column export; the original §1.1 field table was written against the blank
operator template and is superseded by §3 / §4. No production load has run. No
app / UI / ML / scoring / Phase 1 work.

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

Reconciled 2026-05-22 to the real export `buybox_master.csv` (48 columns). The
staging table mirrors that file's header order and set **exactly**, so `\copy`
loads positionally with no column list. All-text — absorbs CSV quirks
(`2024.0`, blank cells); casts happen on merge. Transient: underscore-prefixed,
dropped after load.

```sql
DROP TABLE IF EXISTS tav._stg_phase0_backfill;
CREATE TABLE tav._stg_phase0_backfill (
  source_system text, source_row_id text, source_file text, vin text,
  cycle_seq text, display_id text, year text, make text, model text, trim text,
  body_style text, purchase_date text, sale_date text, days_on_lot text,
  price_paid text, sale_price text, gross_profit text, net_gross text,
  mileage_at_purchase text, mmr_value_at_purchase text, mmr_source text,
  price_vs_mmr text, purchase_channel text, selling_channel text,
  condition_grade_raw text, buyer_id text, closer_id text, consignor_dealer text,
  title_collection_status text, auction_fee text, expense_total text,
  arbitration_flag text, sale_price_manheim text, has_dcl text,
  has_gameday_cr text, has_manheim text, has_mmr text, dealer_sold_to text,
  sale_channel text, cr_expected text, condition_status text, data_quality text,
  notes text, cot_city text, cot_state text, region text, week_label text,
  misc_overhead text
);

-- Load (psql) — table mirrors the CSV 1:1, so positional \copy is correct:
-- \copy tav._stg_phase0_backfill FROM 'buybox_master.csv' WITH (FORMAT csv, HEADER true)
```

The 48 columns above are the verbatim `buybox_master.csv` header, in order. If
a future re-export changes the header, re-verify and regenerate this DDL — the
positional `\copy` depends on an exact 1:1 match.

## 4. Idempotent upsert — keyed on `import_fingerprint`

Reconciled 2026-05-22 to the real `buybox_master.csv` schema. `cycle_seq` is
taken from the CSV when present, else derived as the acquisition-date rank
within a VIN (preserves re-entry cycles). The fingerprint
`md5(vin · cycle_seq · source_file)` makes re-runs and forward loads converge
on the same row — `source_file` is this export's column for what the original
template called `source_file_name`.

The merge populates only existing `tav.purchase_outcomes` columns plus the ten
added by migration `0045`. Columns the export cannot supply are left NULL — see
§4.1. The CSV's extra QA fields stay staging-only — see §4.2. No new DB column
is added.

```sql
BEGIN;

WITH cleaned AS (
  SELECT
    upper(regexp_replace(coalesce(vin,''), '[^A-Za-z0-9]', '', 'g')) AS vin_clean,
    *
  FROM tav._stg_phase0_backfill
  -- This export has no exclude_reason_code column: every staged row is
  -- included except invalid VINs, filtered in `keyed` below.
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
  mileage, odometer_at_purchase, hold_days,
  mmr_value_at_purchase, mmr_source,
  region,
  condition_grade_raw,
  buyer_id, closer_id,
  auction_fee, misc_overhead, expense_total,
  week_label, cot_city, cot_state,
  notes
)
SELECT
  vin_clean,
  cycle_seq_final,
  md5(vin_clean || '|' || cycle_seq_final || '|' || coalesce(source_file,'')),
  md5('phase0-backfill-2026-05-22')::uuid,
  nullif(year,'')::numeric::int::smallint,
  nullif(make,''), nullif(model,''), nullif(trim,''),
  nullif(purchase_date,'')::date, nullif(sale_date,'')::date,
  nullif(price_paid,'')::numeric::int,
  nullif(sale_price,'')::numeric::int,
  nullif(gross_profit,'')::numeric::int,
  nullif(net_gross,'')::numeric::int,
  nullif(mileage_at_purchase,'')::numeric::int,            -- mileage (authoritative)
  nullif(mileage_at_purchase,'')::numeric::int,            -- odometer_at_purchase = mileage
  nullif(days_on_lot,'')::numeric::int,                    -- hold_days
  nullif(mmr_value_at_purchase,'')::numeric::int,
  nullif(mmr_source,''),
  nullif(region,''),
  nullif(condition_grade_raw,''),
  nullif(buyer_id,''), nullif(closer_id,''),
  nullif(auction_fee,'')::numeric::int,
  nullif(misc_overhead,'')::numeric::int,
  nullif(expense_total,'')::numeric::int,
  nullif(week_label,''), nullif(cot_city,''), nullif(cot_state,''),
  nullif(notes,'')
FROM keyed
ON CONFLICT (import_fingerprint) DO UPDATE SET
  vin                   = EXCLUDED.vin,
  cycle_seq             = EXCLUDED.cycle_seq,
  import_batch_id       = EXCLUDED.import_batch_id,
  year                  = EXCLUDED.year,
  make                  = EXCLUDED.make,
  model                 = EXCLUDED.model,
  trim                  = EXCLUDED.trim,
  purchase_date         = EXCLUDED.purchase_date,
  sale_date             = EXCLUDED.sale_date,
  price_paid            = EXCLUDED.price_paid,
  sale_price            = EXCLUDED.sale_price,
  gross_profit          = EXCLUDED.gross_profit,
  net_gross             = EXCLUDED.net_gross,
  mileage               = EXCLUDED.mileage,
  odometer_at_purchase  = EXCLUDED.odometer_at_purchase,
  hold_days             = EXCLUDED.hold_days,
  mmr_value_at_purchase = EXCLUDED.mmr_value_at_purchase,
  mmr_source            = EXCLUDED.mmr_source,
  region                = EXCLUDED.region,
  condition_grade_raw   = EXCLUDED.condition_grade_raw,
  buyer_id              = EXCLUDED.buyer_id,
  closer_id             = EXCLUDED.closer_id,
  auction_fee           = EXCLUDED.auction_fee,
  misc_overhead         = EXCLUDED.misc_overhead,
  expense_total         = EXCLUDED.expense_total,
  week_label            = EXCLUDED.week_label,
  cot_city              = EXCLUDED.cot_city,
  cot_state             = EXCLUDED.cot_state,
  notes                 = EXCLUDED.notes;
  -- NOT in the SET list, by design: id, created_at, import_fingerprint,
  -- lead_id, vehicle_candidate_id. Pre-existing linkage is never overwritten.
  -- Also never written: the §4.1 NULL columns the export cannot supply.

COMMIT;
```

Rows skipped (invalid VIN — cleaned length `<> 17`) are the only documented
exclusion in this export; quantify them with §6.5 before the merge. No silent
drops.

### 4.1 Target columns left NULL (export cannot supply them)

| Target column | Why NULL |
|---|---|
| `purchase_price` | duplicate-pair of `price_paid`; `price_paid` is canonical |
| `gross_profit_est` | export carries actual `gross_profit`, not an estimate |
| `buyer` | export has `buyer_id` only, no buyer name |
| `source` | no clean analog — `source_system` is provenance, not the acquisition `source` enum. Left NULL — owner-confirmed for this Phase 0 load (2026-05-22) |
| `listed_price` | not in export |
| `condition_grade_normalized` | not in export; no approved raw→normalized mapping exists. NULL satisfies its `CHECK` constraint |
| `transport_cost` | not in export |
| `recon_cost` | not in export |
| `mmr_method` / `mmr_lookup_date` / `mmr_snapshot_id` | not in export |
| `purchase_channel` | export value is opaque codes (`H/X/P/C/0`), not the `auction\|private\|dealer` enum — no legend. Loaded NULL; mapping deferred (§4.3) |
| `selling_channel` | export value is free-text dealer / buyer names, not the `retail\|wholesale\|auction` enum. Loaded NULL; mapping deferred (§4.3) |
| `lead_id` / `vehicle_candidate_id` | never written by this load (four-concept rule) |

### 4.2 CSV columns intentionally staging-only (no target column)

`source_system`, `source_row_id`, `source_file`, `display_id`, `body_style`,
`price_vs_mmr`, `consignor_dealer`, `title_collection_status`,
`arbitration_flag`, `sale_price_manheim`, `has_dcl`, `has_gameday_cr`,
`has_manheim`, `has_mmr`, `dealer_sold_to`, `cr_expected`, `condition_status`,
`data_quality`, `purchase_channel`, `selling_channel`, `sale_channel`. These
are provenance / QA / hard-gate-flag / unmapped-channel fields.
`tav.purchase_outcomes` has no column for most of them and — per the Phase 0
scope — none is added. `source_row_id` and `source_file` are still *used* by
the load (cycle-ordering tiebreak and the fingerprint, respectively).
`purchase_channel`, `selling_channel`, and `sale_channel` relate to target
columns, but their CSV values do not conform to the target enums — their
mapping is deferred (§4.3) and the enum-bound target columns load NULL (§4.1).

### 4.3 Deferred channel mapping

Two owner decisions remain before the enum-bound channel fields can be
populated. Until then `purchase_channel` and `selling_channel` load NULL (§4.1)
and the raw CSV values stay staging-only (§4.2).

- **`purchase_channel` code legend.** The export codes `purchase_channel` as
  `H` (30,845) · `X` (13,896) · `P` (12,446) · `0` (18) · `C` (3) · blank (20),
  all under `source_system = 'idms'`. No legend is derivable from the data. The
  owner must supply the `H / X / P / C / 0` → `auction | private | dealer`
  mapping; a later merge can then backfill `purchase_channel`.
- **`sale_channel` → `selling_channel` mapping.** The export's `sale_channel` is
  a clean 2-value field — `Manheim` (54,928, 96%) and `Direct` (2,300, 4%) —
  but neither literally matches the `retail | wholesale | auction` enum. One
  owner-confirmed 2-value mapping (e.g. `Manheim` → `auction`; `Direct` →
  `wholesale` or `retail`) would populate `selling_channel` for 100% of rows.
  The free-text `selling_channel` CSV column (188 distinct dealer / buyer
  names) is never forced into the enum.

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

Reconciled 2026-05-22 to the real `buybox_master.csv`: the
`exclude_reason_code` filter is dropped (the export has no such column — every
staged row is included), §6.3 is now PASS by construction (the enum-bound
targets `purchase_channel` / `selling_channel` are loaded NULL — see §4.3), and
the §6.4 fingerprint uses `source_file`. All `SELECT`-only. Run after `\copy`
into staging, before §4.

### 6.1 The required assertions

```sql
WITH s AS (
  SELECT * FROM tav._stg_phase0_backfill
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
)
SELECT count(*) AS duplicate_vin_cycle_pairs           -- expect 0
FROM (SELECT vin_clean, cycle_seq_final FROM s GROUP BY 1,2 HAVING count(*) > 1) d;
```

### 6.3 Enum pre-check — PASS by construction

The §4 merge does **not** populate the enum-bound target columns
`purchase_channel` or `selling_channel`. The export's values do not conform to
their `CHECK` constraints — `purchase_channel` is opaque codes, `selling_channel`
is free-text dealer / buyer names (see §4.3) — so both are loaded NULL, and NULL
satisfies `purchase_outcomes_purchase_channel_check` and
`purchase_outcomes_selling_channel_check`. `condition_grade_normalized` is
likewise loaded NULL. No enum value reaches the merge, so this check **passes
by construction** — there is no query to run. The raw staging values are
profiled in §4.3 for the owner's deferred mapping decision.

### 6.4 Merge dry-run — insert vs update, and existing-row overlap

```sql
-- How the merge would split. The fp CTE mirrors §4 exactly: invalid VINs are
-- filtered before the cycle_seq window, and the fingerprint uses source_file.
WITH fp AS (
  SELECT md5(
    upper(regexp_replace(coalesce(vin,''),'[^A-Za-z0-9]','','g')) || '|' ||
    COALESCE(nullif(cycle_seq,'')::smallint,
      row_number() OVER (
        PARTITION BY upper(regexp_replace(coalesce(vin,''),'[^A-Za-z0-9]','','g'))
        ORDER BY nullif(purchase_date,'')::date, source_row_id)) || '|' ||
    coalesce(source_file,'')) AS import_fingerprint
  FROM tav._stg_phase0_backfill
  WHERE length(upper(regexp_replace(coalesce(vin,''),'[^A-Za-z0-9]','','g'))) = 17
)
SELECT count(*)                                          AS staged_rows,
       count(*) FILTER (WHERE po.import_fingerprint IS NOT NULL) AS would_update,
       count(*) FILTER (WHERE po.import_fingerprint IS NULL)     AS would_insert
FROM fp LEFT JOIN tav.purchase_outcomes po USING (import_fingerprint);

-- Existing-rows overlap (see §7). Post-archive tav.purchase_outcomes is empty,
-- so existing_rows_total is expected to be 0 — kept as a live re-check.
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

This export has no `exclude_reason_code` column, so the only documented
exclusion is an invalid VIN (cleaned length `<> 17`). Those rows are skipped by
the §4 `length(vin_clean) = 17` gate.

```sql
SELECT 'invalid_vin' AS exclude_reason, count(*) AS rows
FROM tav._stg_phase0_backfill
WHERE length(upper(regexp_replace(coalesce(vin,''),'[^A-Za-z0-9]','','g'))) <> 17;
-- Expect 0, or a small documented count. Any row here is intentionally
-- skipped by the merge — not a silent drop.
```

## 7. STOP — explicit gate before the production merge

**Do not run §4 until all of the following are cleared with the owner:**

1. **Existing-rows decision — RESOLVED 2026-05-22.** The 12,904 legacy partial
   rows were archived and deleted (see
   [`20-legacy-purchase-outcomes-replacement-plan.md`](20-legacy-purchase-outcomes-replacement-plan.md)
   §10 / §11); `tav.purchase_outcomes` is now empty. The §6.4 overlap query
   stays as a live re-check and is expected to return `existing_rows_total = 0`.
2. **Migration `0045` — APPLIED + VERIFIED 2026-05-22.** The ten additive
   columns and three CHECK constraints exist; the `import_fingerprint` unique
   index was already present (a UNIQUE constraint of that name) and is
   confirmed.
3. §6.1 shows `pass_57228_cycles` and `pass_53598_vins` true and the fill
   percentages on target.
4. §6.2 returns `0`.
5. §6.3 PASS by construction — `purchase_channel` / `selling_channel` load NULL
   (§4.3), so no enum value can fail the merge.
6. §6.5 exclusion counts reviewed and accepted.
7. §5 pre-load snapshot taken (or a Supabase PITR timestamp recorded).

Only then: run §4 inside its `BEGIN; … COMMIT;`. After load, run the Audit
6/7/9/10 verification queries in [`20-historical-outcome-backfill-report.md`](20-historical-outcome-backfill-report.md)
§7. This package executes nothing — it is the reviewed plan.
