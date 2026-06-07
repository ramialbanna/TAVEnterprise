-- Migration 0059 — MaxBuy YMM identity
--
-- Allows VIN-less evaluate and pass logging so MaxBuy can be the primary
-- evaluator for manual/new queue entries where VIN is often absent (OPEN-5).
--
-- Changes:
--   maxbuy_lookups         — vin nullable, drop 17-char CHECK, add ymm columns + identity check
--   maxbuy_evaluated_passes — vin nullable, drop 17-char CHECK, add ymm columns + identity check

-- ── maxbuy_lookups ────────────────────────────────────────────────────────────

ALTER TABLE tav.maxbuy_lookups
  ALTER COLUMN vin DROP NOT NULL;

-- PostgreSQL auto-names inline CHECK constraints as <table>_<column>_check
ALTER TABLE tav.maxbuy_lookups
  DROP CONSTRAINT IF EXISTS maxbuy_lookups_vin_check;

ALTER TABLE tav.maxbuy_lookups
  ADD COLUMN year  smallint,
  ADD COLUMN make  text,
  ADD COLUMN model text,
  ADD COLUMN trim  text;

-- Either vin (17-char) OR year + make + model must be present
ALTER TABLE tav.maxbuy_lookups
  ADD CONSTRAINT chk_maxbuy_lookups_identity CHECK (
    (vin IS NOT NULL AND length(vin) = 17)
    OR (year IS NOT NULL AND make IS NOT NULL AND model IS NOT NULL)
  );

CREATE INDEX idx_maxbuy_lookups_ymm
  ON tav.maxbuy_lookups (year, make, model)
  WHERE vin IS NULL;

-- ── maxbuy_evaluated_passes ───────────────────────────────────────────────────

ALTER TABLE tav.maxbuy_evaluated_passes
  ALTER COLUMN vin DROP NOT NULL;

ALTER TABLE tav.maxbuy_evaluated_passes
  DROP CONSTRAINT IF EXISTS maxbuy_evaluated_passes_vin_check;

ALTER TABLE tav.maxbuy_evaluated_passes
  ADD COLUMN year  smallint,
  ADD COLUMN make  text,
  ADD COLUMN model text;

ALTER TABLE tav.maxbuy_evaluated_passes
  ADD CONSTRAINT chk_maxbuy_passes_identity CHECK (
    (vin IS NOT NULL AND length(vin) = 17)
    OR (year IS NOT NULL AND make IS NOT NULL AND model IS NOT NULL)
  );
