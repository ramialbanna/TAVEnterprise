# Legacy `tav.purchase_outcomes` Replacement — Decision Package

**Punch item:** #20 (Phase 0 gate) · **Date:** 2026-05-22 · **Status:**
**Planning + SQL only — not executed.** No DB writes. No backfill load. No
app / API / UI / ML / scoring / Phase 1 work.

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
4. Record a Supabase PITR timestamp; run the §5 archive transaction.
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
