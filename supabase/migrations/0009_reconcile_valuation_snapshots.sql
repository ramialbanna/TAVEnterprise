-- =============================================================================
-- Migration 0009 — Reconcile tav.valuation_snapshots schema
--
-- Migration 0001 created valuation_snapshots with a different shape than
-- what src/persistence/valuationSnapshots.ts writes. Migration 0008 used
-- CREATE TABLE IF NOT EXISTS, which silently no-ops on any DB where 0001
-- already ran first. This migration aligns the live table with the code.
--
-- Changes:
--   DROP   method            — NOT NULL, code never writes it (causes CHECK violation)
--   RENAME mileage_bucket_floor → mileage  — code writes `mileage`
--   FIX    confidence CHECK  — was ('high','medium','low','none'), code writes 'vin'/'ymm'
--   SET    normalized_listing_id NOT NULL   — code always provides it
--   DROP   expires_at        — no code path reads or writes it
-- =============================================================================

-- 1. Drop method column (NOT NULL with no default — every insert would fail)
ALTER TABLE tav.valuation_snapshots DROP COLUMN IF EXISTS method;

-- 2. Rename mileage_bucket_floor to mileage (matches what the code writes)
ALTER TABLE tav.valuation_snapshots RENAME COLUMN mileage_bucket_floor TO mileage;

-- 3. Replace the confidence constraint to match the code's values ('vin' | 'ymm')
ALTER TABLE tav.valuation_snapshots DROP CONSTRAINT IF EXISTS valuation_snapshots_confidence_check;
ALTER TABLE tav.valuation_snapshots
  ADD CONSTRAINT valuation_snapshots_confidence_check
  CHECK (confidence IN ('vin', 'ymm'));

-- 4. Tighten normalized_listing_id to NOT NULL (code always provides it)
ALTER TABLE tav.valuation_snapshots
  ALTER COLUMN normalized_listing_id SET NOT NULL;

-- 5. Drop expires_at (unused in any code path)
ALTER TABLE tav.valuation_snapshots DROP COLUMN IF EXISTS expires_at;
