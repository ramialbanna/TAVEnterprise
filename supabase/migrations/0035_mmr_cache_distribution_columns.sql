-- =============================================================================
-- Migration 0035 — add distribution columns to mmr_cache
--
-- Stores the full price distribution returned by the valuation API alongside
-- the existing scalar mmr_value. All columns are nullable; backfill from the
-- existing raw_response JSONB is deferred to a subsequent migration.
-- =============================================================================

ALTER TABLE tav.mmr_cache
  ADD COLUMN mmr_wholesale_avg   numeric(10,2),
  ADD COLUMN mmr_wholesale_clean numeric(10,2),
  ADD COLUMN mmr_wholesale_rough numeric(10,2),
  ADD COLUMN mmr_retail_clean    numeric(10,2),
  ADD COLUMN mmr_sample_count    integer;
