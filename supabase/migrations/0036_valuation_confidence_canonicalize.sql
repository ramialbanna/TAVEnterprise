-- =============================================================================
-- Migration 0036 — canonicalize valuation_snapshots.confidence
--
-- The confidence column historically stored the lookup method ('vin'/'ymm').
-- This migration separates the two concerns:
--   valuation_method  — how the lookup was performed ('vin' | 'year_make_model')
--   confidence        — quality tier of the result   ('high'|'medium'|'low'|'none')
--
-- Steps must run in this order:
--   1. Add valuation_method with a temporary DEFAULT so NOT NULL is satisfied
--   2. Back-fill valuation_method from the existing confidence values
--   3. Drop the temporary DEFAULT (column remains NOT NULL)
--   4. Drop the old confidence CHECK that accepted 'vin'/'ymm'
--   5. Rewrite confidence to the canonical quality tier
--   6. Add the new confidence CHECK
-- =============================================================================

-- 1. Add the new column with a temporary default.
ALTER TABLE tav.valuation_snapshots
  ADD COLUMN valuation_method text NOT NULL
    DEFAULT 'vin'
    CHECK (valuation_method IN ('vin', 'year_make_model'));

-- 2. Back-fill: 'vin' stays 'vin', everything else maps to 'year_make_model'.
UPDATE tav.valuation_snapshots
SET valuation_method = CASE confidence
  WHEN 'vin' THEN 'vin'
  ELSE 'year_make_model'
END;

-- 3. Drop the temporary DEFAULT; the column remains NOT NULL.
ALTER TABLE tav.valuation_snapshots
  ALTER COLUMN valuation_method DROP DEFAULT;

-- 4. Drop the old CHECK constraint that allowed 'vin' and 'ymm' as confidence values.
ALTER TABLE tav.valuation_snapshots
  DROP CONSTRAINT IF EXISTS valuation_snapshots_confidence_check;

-- 5. Rewrite confidence to quality-tier values.
UPDATE tav.valuation_snapshots
SET confidence = CASE confidence
  WHEN 'vin' THEN 'high'
  WHEN 'ymm' THEN 'medium'
  ELSE 'none'
END;

-- 6. Add the new CHECK for canonical quality tiers.
ALTER TABLE tav.valuation_snapshots
  ADD CONSTRAINT valuation_snapshots_confidence_check
    CHECK (confidence IN ('high', 'medium', 'low', 'none'));
