-- =============================================================================
-- Migration 0043 — tav.valuation_snapshots: miss observability
--
-- Today the table only holds successful valuations (mmr_value NOT NULL). When
-- ingest calls the intelligence worker and gets no value back — Cox returned
-- 404, Cox YMMT short-circuited on missing trim, mileage was absent, the
-- worker was unconfigured, etc. — nothing is persisted against the listing.
-- The result is silent misses: dashboards show "no MMR" with no breadcrumb,
-- and we cannot tell trim_missing apart from cox_no_data or cox_unavailable.
--
-- This migration relaxes the schema to admit miss rows alongside hit rows:
--   - mmr_value: drop NOT NULL; allow null on miss rows
--   - mmr_value: replace the strict "> 0" CHECK with a nullable-aware variant
--   - missing_reason: new text column, NULL on hit rows, set on miss rows
--   - row-level CHECK: exactly one of (mmr_value, missing_reason) must be set
--
-- Hit rows keep their existing shape — distribution columns, confidence,
-- valuation_method are unchanged. Only the gate on mmr_value relaxes.
--
-- src/persistence/valuationSnapshots.ts continues to write hit rows the same
-- way. The new src/persistence/valuationSnapshots.ts::writeValuationMissSnapshot
-- writes miss rows.
--
-- Reasons (free text by schema, governed by src/valuation/workerClient.ts
-- MmrMissReason union):
--   not_configured | insufficient_params | mileage_missing | trim_missing |
--   cox_no_data | cox_unavailable | cox_rate_limited | cox_timeout |
--   envelope_invalid
-- =============================================================================

-- 1. Add the new column (additive; default NULL so existing hit rows untouched).
ALTER TABLE tav.valuation_snapshots
  ADD COLUMN IF NOT EXISTS missing_reason text;

-- 2. Drop the strict "> 0" CHECK so miss rows with null mmr_value can land.
ALTER TABLE tav.valuation_snapshots
  DROP CONSTRAINT IF EXISTS valuation_snapshots_mmr_value_check;

-- 3. Relax NOT NULL on mmr_value.
ALTER TABLE tav.valuation_snapshots
  ALTER COLUMN mmr_value DROP NOT NULL;

-- 4. Re-add a nullable-aware CHECK on mmr_value.
ALTER TABLE tav.valuation_snapshots
  ADD CONSTRAINT valuation_snapshots_mmr_value_check
    CHECK (mmr_value IS NULL OR mmr_value > 0);

-- 5. Enforce hit-XOR-miss at the row level. Exactly one of mmr_value or
--    missing_reason is set; never both, never neither.
ALTER TABLE tav.valuation_snapshots
  ADD CONSTRAINT valuation_snapshots_hit_or_miss_check
    CHECK (
      (mmr_value IS NOT NULL AND missing_reason IS NULL)
      OR
      (mmr_value IS NULL AND missing_reason IS NOT NULL)
    );

-- 6. Index miss rows by reason so dashboards can roll up miss distributions
--    without table-scanning. Partial index keeps it cheap on the hit-heavy path.
CREATE INDEX IF NOT EXISTS vs_missing_reason_idx
  ON tav.valuation_snapshots (missing_reason)
  WHERE missing_reason IS NOT NULL;
