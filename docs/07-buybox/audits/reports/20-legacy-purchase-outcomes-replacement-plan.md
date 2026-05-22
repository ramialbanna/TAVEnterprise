# Legacy `tav.purchase_outcomes` Replacement — Decision Package

**Punch item:** #20 (Phase 0 gate) · **Date:** 2026-05-22 · **Status:**
**Archive attempt failed on an FK constraint — §5 and §9 are superseded by
§10.** Read-only profile complete (§1A); Option A is still the chosen path.
No legacy rows archived or deleted — the failed transaction rolled back. No
backfill load. The FK-aware archive path is gated — see §10. No app / API /
UI / ML / scoring / Phase 1 work.

**Sources:** [`maxbuy.md`](maxbuy.md) ·
[`20-historical-outcome-backfill-report.md`](20-historical-outcome-backfill-report.md) ·
[`20-backfill-load-sql-package.md`](20-backfill-load-sql-package.md).

**The blocker this resolves:** `tav.purchase_outcomes` already holds ~12,904
legacy partial rows (Audit 06). The Phase 0 backfill (57,228 rows) upserts on
`import_fingerprint`; legacy rows carry a different fingerprint shape, so an
unguarded load **adds 57,228 alongside the 12,904**, duplicating VINs. This
package decides what happens to the legacy set first.

---

## 0. Guardrails

- **Read-only first.** §1 is `SELECT`-only. No write runs until the owner
  approves after reviewing the profile.
- **Four-concept boundary preserved.** This package archives/deletes rows in
  the outcome layer (`tav.purchase_outcomes`) only. It does not touch
  `raw_listings`, `normalized_listings`, `vehicle_candidates`, or `leads`.
  Deleting a `purchase_outcomes` row does not delete its `lead` — the FK runs
  `purchase_outcomes → leads`, not the reverse.
- **No data loss.** Option A archives a full-row copy before any delete; every
  archived row keeps its `id`, `import_fingerprint`, `lead_id`, and
  `vehicle_candidate_id`, so the action is fully reversible (§6).
- **No licensed data in this doc.** SQL templates only — no VINs, no MMR
  values, no payloads.
- **Scoped batch id** (from the SQL package): the Phase 0 batch UUID is
  `md5('phase0-backfill-2026-05-22')::uuid`. "Legacy" = every row whose
  `import_batch_id` is *not* that UUID.

## 1. Read-only profile of current `tav.purchase_outcomes`

Run all of these first. `SELECT`-only — safe. Hand the results to the owner.

```sql
-- 1.1 Total rows
SELECT count(*) AS total_rows FROM tav.purchase_outcomes;

-- 1.2 Rows by import_batch_id
SELECT import_batch_id, count(*) AS rows
FROM tav.purchase_outcomes
GROUP BY import_batch_id
ORDER BY rows DESC;

-- 1.3 Rows by source
SELECT coalesce(nullif(source,''),'(null)') AS source, count(*) AS rows
FROM tav.purchase_outcomes
GROUP BY 1
ORDER BY rows DESC;

-- 1.4 Null rates for the load-critical fields
SELECT
  count(*)                                                                AS total_rows,
  round(100.0*count(*) FILTER (WHERE purchase_date         IS NULL)/count(*),1) AS purchase_date_null_pct,
  round(100.0*count(*) FILTER (WHERE mileage              IS NULL)/count(*),1) AS mileage_null_pct,
  round(100.0*count(*) FILTER (WHERE odometer_at_purchase IS NULL)/count(*),1) AS odometer_null_pct,
  round(100.0*count(*) FILTER (WHERE mmr_value_at_purchase IS NULL)/count(*),1) AS mmr_null_pct,
  round(100.0*count(*) FILTER (WHERE lead_id              IS NULL)/count(*),1) AS lead_id_null_pct,
  round(100.0*count(*) FILTER (WHERE vehicle_candidate_id IS NULL)/count(*),1) AS candidate_id_null_pct
FROM tav.purchase_outcomes;

-- 1.5 Linkage counts — THE decision gate (see §3)
SELECT
  count(*) FILTER (WHERE lead_id IS NOT NULL)              AS rows_with_lead_id,
  count(*) FILTER (WHERE vehicle_candidate_id IS NOT NULL) AS rows_with_candidate_id,
  count(*) FILTER (WHERE import_fingerprint IS NOT NULL)   AS rows_with_import_fingerprint
FROM tav.purchase_outcomes;

-- 1.6 Duplicate import_fingerprint check (must be empty before §2 of the
--     SQL package can add a UNIQUE index)
SELECT import_fingerprint, count(*) AS rows
FROM tav.purchase_outcomes
WHERE import_fingerprint IS NOT NULL
GROUP BY 1 HAVING count(*) > 1
ORDER BY rows DESC;

-- 1.7 Duplicate business-key clusters (do legacy rows already double up?)
SELECT vin, year, make, model, price_paid, sale_price, gross_profit, hold_days,
       count(*) AS rows
FROM tav.purchase_outcomes
GROUP BY 1,2,3,4,5,6,7,8
HAVING count(*) > 1
ORDER BY rows DESC
LIMIT 100;

-- 1.8 Legacy-partial-row count (Audit 06 signature: no purchase date)
SELECT
  count(*)                                                          AS legacy_candidate_rows,
  count(*) FILTER (WHERE purchase_date IS NULL)                      AS no_purchase_date,
  count(*) FILTER (WHERE purchase_date IS NULL
                     AND mileage IS NULL
                     AND lead_id IS NULL
                     AND vehicle_candidate_id IS NULL)               AS full_partial_signature
FROM tav.purchase_outcomes
WHERE import_batch_id IS DISTINCT FROM md5('phase0-backfill-2026-05-22')::uuid;
```

**Interpretation key.** Audit 06 found all ~12,904 current rows have NULL
`purchase_date`, NULL `mileage`, and NULL pipeline linkage — i.e. they are the
"legacy partial" set in full. Query 1.5 is the decision gate: if
`rows_with_lead_id` or `rows_with_candidate_id` is non-trivial, the linkage is
real work product and Option A must be reconsidered (see §3).

## 1A. Actual profile results (2026-05-22)

The §1 read-only profile was run against `tav.purchase_outcomes`. Results:

| Profile metric | Result |
|---|---|
| Total rows | **12,904** |
| `source` | NULL on all 12,904 |
| `purchase_date` NULL | 100% (12,904) |
| `mileage` NULL | 100% (12,904) |
| `odometer_at_purchase` NULL | 100% (12,904) |
| `mmr_value_at_purchase` NULL | 100% (12,904) |
| `lead_id` NULL | 100% (12,904) |
| `vehicle_candidate_id` NULL | 100% (12,904) |
| rows with non-null `lead_id` | **0** |
| rows with non-null `vehicle_candidate_id` | **0** |
| rows with non-null `import_fingerprint` | 12,904 |
| duplicate `import_fingerprint` (Q1.6) | **0 — none returned** |
| `legacy_candidate_rows` | 12,904 |
| `no_purchase_date` | 12,904 |
| `full_partial_signature` | 12,904 |

**Business-key duplicates (Q1.7):** duplicate clusters on
`vin / year / make / model / price_paid / sale_price / gross_profit /
hold_days` **were observed** in the legacy set. The raw rows are deliberately
not reproduced here — VIN-level data stays out of the repo. Their presence
reinforces that the legacy rows must not coexist with the Phase 0 load: kept
alongside, they would compound into further duplication.

**Reading:**
- **All 12,904 rows are legacy partial rows.** The full partial signature
  (no purchase date, no mileage, no pipeline linkage) matches the entire
  table — there is no good subset to preserve.
- **Zero pipeline linkage** (`lead_id` 0, `vehicle_candidate_id` 0) — the §3
  linkage gate is satisfied; archiving the set loses nothing of operational
  value.
- **0 duplicate `import_fingerprint`** — the SQL package's unique-index
  pre-check ([`20-backfill-load-sql-package.md`](20-backfill-load-sql-package.md)
  §2) is already satisfied.
- The legacy set is exactly the partial data Audit 06 flagged; the 57,228-row
  Phase 0 backfill is its complete replacement.

## 2. Decision options

### Option A — Archive, then delete the legacy set, then load Phase 0
Move every pre-Phase-0 row into an archive table, delete it from the live
table, then run the Phase 0 load into a clean table.

- **Pros:** clean canonical table; no VIN duplication; the Phase 0 backfill is
  a strict, complete superset of the partial legacy data; archive keeps the
  legacy rows fully recoverable; simplest downstream audits.
- **Cons:** if any legacy row has real `lead_id` / `vehicle_candidate_id`
  linkage, that linkage leaves the live table (it survives in the archive).
- **Risks:** low. Archive-before-delete in one transaction; reversible via §6.
  Residual risk only if linkage is meaningful and unrecoverable elsewhere.

### Option B — Keep legacy rows, load Phase 0 alongside
Leave the 12,904 rows; load 57,228 on top.

- **Pros:** no delete; nothing to reverse.
- **Cons:** ~70,132 rows with the same VINs appearing twice (legacy partial +
  Phase 0 complete); every audit and every MaxBuy feature query must carry a
  `WHERE import_batch_id = …` filter forever; the table stops being a clean
  source of truth.
- **Risks:** high. Silent double-counting in any query that forgets the
  filter; corrupts segment counts, residuals, and decay backtests.

### Option C — VIN-level reconciliation
Match each legacy row to its Phase 0 counterpart on VIN (+ cycle) and
update-in-place; insert the rest.

- **Pros:** preserves any legacy linkage in place.
- **Cons:** the legacy rows have no `purchase_date` and no `cycle_seq`, so they
  cannot be matched to a specific Phase 0 *cycle* for re-entry VINs; the match
  is ambiguous exactly where it matters; large bespoke merge logic.
- **Risks:** medium-high. Ambiguous matches mis-assign cost stacks across
  cycles; far more code and review surface than A.

## 3. Recommended path

**Profile result (2026-05-22): `rows_with_lead_id` = 0 and
`rows_with_candidate_id` = 0 (§1A). Option A is confirmed — unconditionally
approved.** Archive and delete the full 12,904-row legacy partial set before
loading the 57,228-row Phase 0 backfill.

**Recommend Option A**, conditional on the §1.5 profile:

- If `rows_with_lead_id = 0` and `rows_with_candidate_id = 0` (the Audit 06
  expectation) → **Option A, unconditionally.** The legacy set is partial data
  with no linkage; the Phase 0 backfill supersedes it entirely.
- If either count is small and non-zero → **Option A still**, because the
  archive table retains the linkage and §6 can restore those specific rows; the
  owner notes them for a later targeted re-link.
- If either count is large / operationally meaningful → **escalate to Option
  C** for the linked subset only; archive the rest under Option A.

Option B is not recommended under any profile result — it permanently
compromises the table as a source of truth.

## 4. Archive table DDL

The archive is a plain full-row copy table (created by §5's `CREATE TABLE AS`).
No DDL needs to run separately — it is shown here for review:

```sql
-- Created by §5. Shape = a full snapshot of tav.purchase_outcomes as of
-- 2026-05-22, restricted to the legacy (pre-Phase-0) row set.
-- tav.purchase_outcomes_legacy_pre_phase0_20260522
--   ( <every column of tav.purchase_outcomes at archive time>,
--     id, import_fingerprint, lead_id, vehicle_candidate_id preserved verbatim )
```

Naming: `tav.purchase_outcomes_legacy_pre_phase0_20260522` — schema-qualified,
dated, self-describing. It is a backup artifact, not a pipeline concept; keep
it until the Phase 0 load is confirmed good, then drop it (§8).

## 5. Transactional archive + delete (run only after §7 approval)

> **SUPERSEDED 2026-05-22 — DO NOT RUN.** The §5.3 `DELETE` was attempted and
> failed with `ERROR 23503 import_rows_outcome_id_fkey`: rows in
> `tav.import_rows` reference these `purchase_outcomes` rows via a `NO ACTION`
> foreign key. The transaction rolled back — nothing was archived or deleted.
> Use the FK-aware path in **§10** instead. §5 is kept only as the record of
> the original (broken) plan.

One transaction. The verification `DO` blocks `RAISE EXCEPTION` on any
mismatch, which aborts the transaction before `COMMIT` — so a bad count means
nothing is deleted.

```sql
BEGIN;

-- 5.1 Archive the legacy (pre-Phase-0) row set — full-row copy.
CREATE TABLE tav.purchase_outcomes_legacy_pre_phase0_20260522 AS
SELECT *
FROM tav.purchase_outcomes
WHERE import_batch_id IS DISTINCT FROM md5('phase0-backfill-2026-05-22')::uuid;

-- 5.2 Verify archive count == selected legacy count. Abort if not.
DO $$
DECLARE archived bigint; expected bigint;
BEGIN
  SELECT count(*) INTO archived
    FROM tav.purchase_outcomes_legacy_pre_phase0_20260522;
  SELECT count(*) INTO expected
    FROM tav.purchase_outcomes
    WHERE import_batch_id IS DISTINCT FROM md5('phase0-backfill-2026-05-22')::uuid;
  IF archived <> expected THEN
    RAISE EXCEPTION 'archive count % <> selected legacy count % — aborting', archived, expected;
  END IF;
  RAISE NOTICE 'archived % legacy rows', archived;
END $$;

-- 5.3 Delete exactly the archived rows (by id — guarantees delete == archive).
DELETE FROM tav.purchase_outcomes
WHERE id IN (SELECT id FROM tav.purchase_outcomes_legacy_pre_phase0_20260522);

-- 5.4 Verify no legacy rows remain. Abort if any survive.
DO $$
DECLARE leftover bigint;
BEGIN
  SELECT count(*) INTO leftover
    FROM tav.purchase_outcomes
    WHERE import_batch_id IS DISTINCT FROM md5('phase0-backfill-2026-05-22')::uuid;
  IF leftover <> 0 THEN
    RAISE EXCEPTION 'legacy rows still present after delete: % — aborting', leftover;
  END IF;
END $$;

COMMIT;
```

After this, `tav.purchase_outcomes` is empty of legacy rows and ready for the
Phase 0 load (the SQL package, §2 onward).

## 6. Rollback — restore the archived legacy set

The archive table holds every column the live table had at archive time
(pre-migration-0045). The restore uses an **explicit column list** so it works
even if migration 0045 has since added columns (the new columns default NULL).
`ON CONFLICT (id) DO NOTHING` preserves original `id` and `import_fingerprint`
and never clobbers a Phase 0 row.

```sql
BEGIN;

INSERT INTO tav.purchase_outcomes (
  id, lead_id, vehicle_candidate_id, purchase_price, mmr_value_at_purchase,
  gross_profit_est, odometer_at_purchase, purchase_date, buyer, notes, vin,
  year, make, model, mileage, source, region, listed_price, price_paid,
  sale_price, gross_profit, hold_days, transport_cost, auction_fee,
  misc_overhead, condition_grade_raw, condition_grade_normalized,
  purchase_channel, selling_channel, week_label, buyer_id, closer_id,
  cot_city, cot_state, import_batch_id, import_fingerprint, created_at
)
SELECT
  id, lead_id, vehicle_candidate_id, purchase_price, mmr_value_at_purchase,
  gross_profit_est, odometer_at_purchase, purchase_date, buyer, notes, vin,
  year, make, model, mileage, source, region, listed_price, price_paid,
  sale_price, gross_profit, hold_days, transport_cost, auction_fee,
  misc_overhead, condition_grade_raw, condition_grade_normalized,
  purchase_channel, selling_channel, week_label, buyer_id, closer_id,
  cot_city, cot_state, import_batch_id, import_fingerprint, created_at
FROM tav.purchase_outcomes_legacy_pre_phase0_20260522
ON CONFLICT (id) DO NOTHING;

-- Verify the restored count equals the archived count. Abort if not.
DO $$
DECLARE archived bigint; restored bigint;
BEGIN
  SELECT count(*) INTO archived
    FROM tav.purchase_outcomes_legacy_pre_phase0_20260522;
  SELECT count(*) INTO restored
    FROM tav.purchase_outcomes t
    WHERE EXISTS (SELECT 1 FROM tav.purchase_outcomes_legacy_pre_phase0_20260522 a
                  WHERE a.id = t.id);
  IF restored <> archived THEN
    RAISE EXCEPTION 'restored % <> archived % — aborting', restored, archived;
  END IF;
END $$;

COMMIT;
```

If migration 0045 has not yet run, `INSERT … SELECT *` would also work; the
explicit list above is the safe form for either order.

## 7. Safety gates

No write runs until **every** gate is cleared:

1. **Stop before any write.** §1 is read-only; §5/§6 do not run until approved.
2. **Owner approval after the read-only profile.** §1 results reviewed and the
   chosen option signed off.
3. **Linkage confirmation.** §1.5 confirms `lead_id` and `vehicle_candidate_id`
   are not meaningfully populated — or the linked subset is explicitly carved
   out per §3 before any archive/delete.
4. **Archive-count verification.** §5.2 and §5.4 `DO` blocks must pass; a
   mismatch aborts the transaction with zero deletion.
5. **Pre-load snapshot.** §5's archive table is itself the backup; additionally
   record a Supabase PITR timestamp before running §5.
6. **No unrelated tables.** This package touches only `tav.purchase_outcomes`
   and the new archive table. Confirm no other `tav.*` object, no
   `raw_listings` / `normalized_listings` / `vehicle_candidates` / `leads`, and
   no `web/` assets are in scope.
7. **`import_fingerprint` dup pre-check** (§1.6) returns empty before the SQL
   package's unique index is created.

## 8. Exact next-step sequence (after approval)

1. Run the §1 read-only profile.
2. Review the profile with the owner; confirm §3 / §7.3.
3. Approve Option A (or choose B/C).
4. Record a Supabase PITR timestamp; run the **§10** FK-aware archive
   transaction (§5 is superseded — see §10).
5. Apply migration `0045` (additive schema) from
   [`20-backfill-load-sql-package.md`](20-backfill-load-sql-package.md) §2.
6. Create the staging table and `\copy` the backfill into it
   ([`20-backfill-load-sql-package.md`](20-backfill-load-sql-package.md) §3).
7. Run the dry-run validation — confirm 57,228 staged rows and the §6.1
   assertions ([`20-backfill-load-sql-package.md`](20-backfill-load-sql-package.md) §6).
8. Run the merge into `tav.purchase_outcomes`
   ([`20-backfill-load-sql-package.md`](20-backfill-load-sql-package.md) §4).
9. Re-run audits **#6, #7, #9, #10** against the loaded table
   ([`20-historical-outcome-backfill-report.md`](20-historical-outcome-backfill-report.md) §7).
10. Once the load is confirmed good, drop
    `tav.purchase_outcomes_legacy_pre_phase0_20260522`.

This document executes nothing. It is the reviewed decision package; §5/§6 run
only after §7 is cleared.

## 9. Execution gate — immediate next operator sequence

> **SUPERSEDED 2026-05-22 — DO NOT RUN.** Step 2 of this gate runs the §5
> archive transaction, which fails on the `import_rows_outcome_id_fkey`
> foreign key. The FK-aware replacement gate is **§10.6**. §9 is kept only as
> the record of the original (broken) gate.

Option A is approved by the §1A profile. The immediate, gated sequence —
**stop at step 5**. This section authorizes steps 1–4 only, and only after the
owner's explicit "run the archive" instruction. It does **not** authorize the
Phase 0 load.

1. **Backup.** Take or confirm a Supabase PITR timestamp / backup is available
   immediately before any write. Record the timestamp.
2. **Archive transaction.** Run the §5 transactional archive + delete exactly
   as written — it creates `tav.purchase_outcomes_legacy_pre_phase0_20260522`,
   verifies counts in `DO` blocks, deletes by archived `id`, and `COMMIT`s only
   if both verifications pass.
3. **Verify archive row count = 12,904:**
   ```sql
   SELECT count(*) AS archived_rows
   FROM tav.purchase_outcomes_legacy_pre_phase0_20260522;   -- expect 12,904
   ```
4. **Verify `tav.purchase_outcomes` row count = 0 after the legacy delete:**
   ```sql
   SELECT count(*) AS remaining_rows FROM tav.purchase_outcomes;   -- expect 0
   ```
   Pre-Phase-0 the whole table is the legacy set, so the post-delete count is 0.
5. **STOP and report.** Do not run migration 0045, do not create the staging
   table, do not load or merge the Phase 0 backfill. Hand the step 3 and step 4
   counts back for review; the load resumes only on a fresh go-ahead.

Once steps 3 and 4 verify, the load continues from §8 step 5 (migration 0045)
— but only under a new, explicit instruction.

---

## 10. FK-aware archive amendment (supersedes §5 and §9)

**Added 2026-05-22** after the §5 archive transaction failed in Supabase
Studio. This section is the corrected archive path. §5 and §9 are kept above
only as the record of the original (broken) plan — **do not run them.**
Option A (archive, then delete the legacy set, then load Phase 0) is
unchanged; only the archive *mechanics* change to clear a foreign key first.

This section executes nothing. §10.3 / §10.4 run only after §10.5 is cleared
and the owner gives an explicit "run the FK-aware archive" instruction.

### 10.1 The failed archive attempt and the FK blocker

The §5 transaction was run in Supabase Studio. §5.1 (archive `CREATE TABLE
AS`) and §5.2 (count `DO` block) succeeded, but §5.3 — the
`DELETE FROM tav.purchase_outcomes` — failed:

```
ERROR: 23503 update or delete on table "purchase_outcomes" violates
foreign key constraint "import_rows_outcome_id_fkey" on table "import_rows"
```

The whole transaction rolled back: `BEGIN … COMMIT` with the failure inside
means **nothing was archived, nulled, or deleted.** The database is in the
same state as the §1A profile (12,904 legacy rows, 0 Phase 0 rows).

**Root cause.** `tav.import_rows.outcome_id` is a nullable `uuid` FK to
`tav.purchase_outcomes.id` (constraint `import_rows_outcome_id_fkey`). Its
delete rule is `NO ACTION` (`pg_constraint.confdeltype = 'a'`) — not
`CASCADE`, not `SET NULL`. Postgres therefore refuses to delete any
`purchase_outcomes` row that an `import_rows` row still points at. The
legacy rows are referenced, so §5.3 is structurally impossible until those
references are cleared first.

`import_rows_outcome_id_fkey` is the **only** foreign key in the `tav` schema
that targets `purchase_outcomes` (verified read-only, 2026-05-22), so
`tav.import_rows` is the sole blocker — no other table needs handling.

### 10.2 Read-only dependency profile (run first — `SELECT`-only)

Run all of these before any write. They size the blast radius and confirm the
two structural assumptions the §10.3 path depends on. Hand the results to the
owner.

```sql
-- 10.2a Count import_rows referencing the legacy purchase_outcomes set.
SELECT count(*) AS import_rows_referencing_legacy
FROM tav.import_rows ir
WHERE ir.outcome_id IN (
  SELECT id FROM tav.purchase_outcomes
  WHERE import_batch_id IS DISTINCT FROM md5('phase0-backfill-2026-05-22')::uuid
);

-- 10.2b Count distinct referenced outcome_id values.
SELECT count(DISTINCT ir.outcome_id) AS distinct_referenced_outcome_ids
FROM tav.import_rows ir
WHERE ir.outcome_id IN (
  SELECT id FROM tav.purchase_outcomes
  WHERE import_batch_id IS DISTINCT FROM md5('phase0-backfill-2026-05-22')::uuid
);

-- 10.2c Referencing import_rows broken out by status.
SELECT ir.status, count(*) AS rows
FROM tav.import_rows ir
WHERE ir.outcome_id IN (
  SELECT id FROM tav.purchase_outcomes
  WHERE import_batch_id IS DISTINCT FROM md5('phase0-backfill-2026-05-22')::uuid
)
GROUP BY ir.status
ORDER BY rows DESC;

-- 10.2d Referencing import_rows broken out by import_batch_id.
SELECT ir.import_batch_id, count(*) AS rows
FROM tav.import_rows ir
WHERE ir.outcome_id IN (
  SELECT id FROM tav.purchase_outcomes
  WHERE import_batch_id IS DISTINCT FROM md5('phase0-backfill-2026-05-22')::uuid
)
GROUP BY ir.import_batch_id
ORDER BY rows DESC;

-- 10.2e Confirm import_rows.outcome_id is nullable (expect is_nullable = YES).
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'tav'
  AND table_name = 'import_rows'
  AND column_name = 'outcome_id';

-- 10.2f Confirm the FK delete rule is NO ACTION / not cascade.
--   confdeltype: 'a' = NO ACTION, 'r' = RESTRICT, 'c' = CASCADE,
--                'n' = SET NULL, 'd' = SET DEFAULT.
SELECT con.conname,
       con.confdeltype AS delete_rule_code,
       CASE con.confdeltype
         WHEN 'a' THEN 'NO ACTION'  WHEN 'r' THEN 'RESTRICT'
         WHEN 'c' THEN 'CASCADE'    WHEN 'n' THEN 'SET NULL'
         WHEN 'd' THEN 'SET DEFAULT'
       END AS delete_rule
FROM pg_constraint con
JOIN pg_class cl     ON cl.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = cl.relnamespace
WHERE con.contype = 'f'
  AND ns.nspname = 'tav'
  AND cl.relname = 'import_rows'
  AND con.conname = 'import_rows_outcome_id_fkey';
```

**Pre-confirmed read-only, 2026-05-22:** 10.2e returned `is_nullable = YES`
and 10.2f returned `delete_rule = NO ACTION` — both structural assumptions of
§10.3 hold. 10.2a–d still need to be run so the owner sees the actual impact
counts before approving.

### 10.3 Revised FK-aware archive transaction

One transaction. It archives the legacy outcomes, archives the
`import_rows → outcome_id` link mapping into a separate table, nulls only the
blocking `outcome_id` values, then deletes the legacy outcomes. Every `DO`
block `RAISE EXCEPTION`s on a mismatch, aborting before `COMMIT` — a bad count
deletes nothing.

```sql
BEGIN;

-- 10.3.1 Archive the legacy (pre-Phase-0) purchase_outcomes row set.
CREATE TABLE tav.purchase_outcomes_legacy_pre_phase0_20260522 AS
SELECT *
FROM tav.purchase_outcomes
WHERE import_batch_id IS DISTINCT FROM md5('phase0-backfill-2026-05-22')::uuid;

-- 10.3.2 Archive the import_rows -> outcome_id link mapping for every
--   import_row that points at an archived legacy purchase_outcomes row.
--   This table is the sole source for restoring the links in rollback (§10.4).
CREATE TABLE tav.import_rows_outcome_links_pre_phase0_20260522 AS
SELECT ir.id             AS import_row_id,
       ir.outcome_id     AS outcome_id,
       ir.import_batch_id,
       ir.status,
       ir.created_at,
       now()             AS archived_at
FROM tav.import_rows ir
WHERE ir.outcome_id IN (
  SELECT id FROM tav.purchase_outcomes_legacy_pre_phase0_20260522
);

-- 10.3.3 Verify the purchase_outcomes archive count == selected legacy count.
DO $$
DECLARE archived bigint; expected bigint;
BEGIN
  SELECT count(*) INTO archived
    FROM tav.purchase_outcomes_legacy_pre_phase0_20260522;
  SELECT count(*) INTO expected
    FROM tav.purchase_outcomes
    WHERE import_batch_id IS DISTINCT FROM md5('phase0-backfill-2026-05-22')::uuid;
  IF archived <> expected THEN
    RAISE EXCEPTION 'purchase_outcomes archive % <> selected legacy % — aborting', archived, expected;
  END IF;
  RAISE NOTICE 'archived % legacy purchase_outcomes rows', archived;
END $$;

-- 10.3.4 Verify the link archive captured every referencing import_row.
DO $$
DECLARE archived_links bigint; live_links bigint;
BEGIN
  SELECT count(*) INTO archived_links
    FROM tav.import_rows_outcome_links_pre_phase0_20260522;
  SELECT count(*) INTO live_links
    FROM tav.import_rows ir
    WHERE ir.outcome_id IN (
      SELECT id FROM tav.purchase_outcomes_legacy_pre_phase0_20260522);
  IF archived_links <> live_links THEN
    RAISE EXCEPTION 'link archive % <> live referencing import_rows % — aborting', archived_links, live_links;
  END IF;
  RAISE NOTICE 'archived % import_rows outcome links', archived_links;
END $$;

-- 10.3.5 Null out outcome_id ONLY for import_rows that reference an archived
--   legacy purchase_outcomes row. outcome_id is nullable (10.2e). raw_row,
--   status, import_batch_id, and the import_rows row itself are untouched.
UPDATE tav.import_rows
SET outcome_id = NULL
WHERE outcome_id IN (
  SELECT id FROM tav.purchase_outcomes_legacy_pre_phase0_20260522
);

-- 10.3.6 Delete exactly the archived legacy purchase_outcomes rows (by id).
DELETE FROM tav.purchase_outcomes
WHERE id IN (SELECT id FROM tav.purchase_outcomes_legacy_pre_phase0_20260522);

-- 10.3.7 Verify no legacy purchase_outcomes rows remain.
DO $$
DECLARE leftover bigint;
BEGIN
  SELECT count(*) INTO leftover
    FROM tav.purchase_outcomes
    WHERE import_batch_id IS DISTINCT FROM md5('phase0-backfill-2026-05-22')::uuid;
  IF leftover <> 0 THEN
    RAISE EXCEPTION 'legacy purchase_outcomes rows still present after delete: % — aborting', leftover;
  END IF;
END $$;

-- 10.3.8 Verify no import_rows still reference an archived legacy outcome.
DO $$
DECLARE dangling bigint;
BEGIN
  SELECT count(*) INTO dangling
    FROM tav.import_rows ir
    WHERE ir.outcome_id IN (
      SELECT id FROM tav.purchase_outcomes_legacy_pre_phase0_20260522);
  IF dangling <> 0 THEN
    RAISE EXCEPTION 'import_rows still reference archived legacy outcomes: % — aborting', dangling;
  END IF;
END $$;

COMMIT;
```

**Post-commit verification** (run after `COMMIT`, `SELECT`-only). Record the
`tav.import_rows` total *before* the transaction so step (b) has a baseline:

```sql
-- (run BEFORE the §10.3 transaction — record the number)
SELECT count(*) AS import_rows_total_pre FROM tav.import_rows;

-- (run AFTER COMMIT)
-- a) purchase_outcomes empty of legacy rows. Pre-Phase-0 the whole table is
--    legacy, so this is the whole table — expect 0.
SELECT count(*) AS remaining_purchase_outcomes FROM tav.purchase_outcomes;
-- b) import_rows total unchanged. §10.3.5 is an UPDATE, never a DELETE, so the
--    count is preserved by construction; this is the explicit confirmation.
SELECT count(*) AS import_rows_total_post FROM tav.import_rows;   -- expect == _pre
-- c) no import_rows reference a now-deleted legacy outcome.
SELECT count(*) AS import_rows_referencing_legacy
FROM tav.import_rows ir
WHERE ir.outcome_id IN (
  SELECT outcome_id FROM tav.import_rows_outcome_links_pre_phase0_20260522);  -- expect 0
-- d) archive tables hold the expected snapshots.
SELECT count(*) AS archived_outcomes
  FROM tav.purchase_outcomes_legacy_pre_phase0_20260522;          -- expect 12,904
SELECT count(*) AS archived_links
  FROM tav.import_rows_outcome_links_pre_phase0_20260522;         -- expect == 10.2a
```

### 10.4 Rollback — restore both tables

Restores the legacy `purchase_outcomes` rows, then re-links `import_rows`.
Order matters: the outcome rows must exist before `import_rows.outcome_id` can
point at them again (the FK is checked at statement end). Both steps run in one
transaction.

```sql
BEGIN;

-- 10.4.1 Restore the legacy purchase_outcomes rows from the archive.
--   Explicit column list so it works whether or not migration 0045 has since
--   added columns (new columns default NULL). ON CONFLICT (id) DO NOTHING
--   never clobbers a Phase 0 row.
INSERT INTO tav.purchase_outcomes (
  id, lead_id, vehicle_candidate_id, purchase_price, mmr_value_at_purchase,
  gross_profit_est, odometer_at_purchase, purchase_date, buyer, notes, vin,
  year, make, model, mileage, source, region, listed_price, price_paid,
  sale_price, gross_profit, hold_days, transport_cost, auction_fee,
  misc_overhead, condition_grade_raw, condition_grade_normalized,
  purchase_channel, selling_channel, week_label, buyer_id, closer_id,
  cot_city, cot_state, import_batch_id, import_fingerprint, created_at
)
SELECT
  id, lead_id, vehicle_candidate_id, purchase_price, mmr_value_at_purchase,
  gross_profit_est, odometer_at_purchase, purchase_date, buyer, notes, vin,
  year, make, model, mileage, source, region, listed_price, price_paid,
  sale_price, gross_profit, hold_days, transport_cost, auction_fee,
  misc_overhead, condition_grade_raw, condition_grade_normalized,
  purchase_channel, selling_channel, week_label, buyer_id, closer_id,
  cot_city, cot_state, import_batch_id, import_fingerprint, created_at
FROM tav.purchase_outcomes_legacy_pre_phase0_20260522
ON CONFLICT (id) DO NOTHING;

-- 10.4.2 Restore import_rows.outcome_id from the link archive. Each import_row
--   gets back exactly the outcome_id it had at archive time. The IS NULL guard
--   means a row that meanwhile gained a new outcome_id is never clobbered.
UPDATE tav.import_rows ir
SET outcome_id = lnk.outcome_id
FROM tav.import_rows_outcome_links_pre_phase0_20260522 lnk
WHERE ir.id = lnk.import_row_id
  AND ir.outcome_id IS NULL;

-- 10.4.3 Verify both restores.
DO $$
DECLARE archived bigint; restored bigint; links bigint; relinked bigint;
BEGIN
  SELECT count(*) INTO archived
    FROM tav.purchase_outcomes_legacy_pre_phase0_20260522;
  SELECT count(*) INTO restored
    FROM tav.purchase_outcomes t
    WHERE EXISTS (SELECT 1 FROM tav.purchase_outcomes_legacy_pre_phase0_20260522 a
                  WHERE a.id = t.id);
  IF restored <> archived THEN
    RAISE EXCEPTION 'restored purchase_outcomes % <> archived % — aborting', restored, archived;
  END IF;
  SELECT count(*) INTO links
    FROM tav.import_rows_outcome_links_pre_phase0_20260522;
  SELECT count(*) INTO relinked
    FROM tav.import_rows ir
    JOIN tav.import_rows_outcome_links_pre_phase0_20260522 lnk
      ON lnk.import_row_id = ir.id
    WHERE ir.outcome_id = lnk.outcome_id;
  IF relinked <> links THEN
    RAISE EXCEPTION 'restored import_rows links % <> archived links % — aborting', relinked, links;
  END IF;
END $$;

COMMIT;
```

Supabase PITR (recorded per §10.5 gate 1) remains the outer backstop if the
archive tables themselves are lost.

### 10.5 Safety gates

§10.3 / §10.4 do not run until **every** gate is cleared. These are in
addition to the §7 gates, all of which still apply (PITR snapshot, DO-block
count verification, abort-on-mismatch, no unrelated tables).

1. **Fresh owner approval — this now touches `tav.import_rows`.** The original
   §7.2 sign-off covered the outcome layer only. §10.3 modifies a pipeline
   staging table (`import_rows`), so the owner must re-approve with that
   expanded scope explicitly understood.
2. **No `raw_row` deletion.** The `import_rows.raw_row` jsonb audit payload is
   never read or written. The import audit trail is preserved intact.
3. **No `import_rows` row deletion.** §10.3.5 is an `UPDATE`, never a `DELETE`.
   The `import_rows` row count is preserved by construction and confirmed by
   the post-commit check (b).
4. **Only the nullable `outcome_id` column is cleared.** Confirmed nullable
   (10.2e). No other `import_rows` column is touched; `status`,
   `import_batch_id`, `reason_code`, `row_index`, `created_at` are untouched.
5. **The link mapping preserves the old association.**
   `tav.import_rows_outcome_links_pre_phase0_20260522` stores
   `(import_row_id, outcome_id)` for every cleared link, so §10.4.2 can restore
   each `import_rows` row to exactly the outcome it referenced.
6. **Four-concept boundary intact.** `import_rows` is the bulk-import staging
   surface for the outcome layer — it is not Raw / Normalized / Vehicle
   Candidate / Lead. Nulling `outcome_id` removes only a pointer to a row that
   is itself being deleted. No `raw_listings`, `normalized_listings`,
   `vehicle_candidates`, or `leads` row is touched.

### 10.6 Execution gate — FK-aware operator sequence (replaces §9)

Option A is approved; §10 is the corrected mechanics. This gate authorizes
**steps 1–5 only**, and only after the owner's explicit "run the FK-aware
archive" instruction. It does **not** authorize the Phase 0 load.

1. **Backup.** Take or confirm a Supabase PITR timestamp immediately before
   any write. Record it.
2. **Dependency profile.** Run the §10.2 read-only queries; hand 10.2a–d
   counts to the owner. Confirm 10.2e = `YES` and 10.2f = `NO ACTION`.
3. **Record the baseline.** Run `SELECT count(*) FROM tav.import_rows;` and
   record the number for post-commit check (b).
4. **FK-aware archive transaction.** Run the §10.3 transaction verbatim — it
   archives outcomes, archives the link mapping, nulls the blocking
   `outcome_id` values, deletes the legacy outcomes, and `COMMIT`s only if
   every `DO` block passes.
5. **Post-commit verification + STOP.** Run the §10.3 post-commit block.
   Expect: `remaining_purchase_outcomes = 0`, `import_rows_total_post` ==
   baseline, `import_rows_referencing_legacy = 0`, `archived_outcomes =
   12,904`, `archived_links` == 10.2a. Hand the counts back for review. Do not
   run migration 0045, do not create the staging table, do not load or merge
   the Phase 0 backfill — the load resumes only on a fresh, explicit
   instruction (§8 step 5 onward).
