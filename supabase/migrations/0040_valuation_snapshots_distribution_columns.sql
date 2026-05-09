-- =============================================================================
-- Migration 0040 — valuation_snapshots: MMR distribution + retail + sample size
--
-- src/persistence/valuationSnapshots.ts writes the full price distribution
-- (wholesale.above/average/below, retail.clean) and sampleSize alongside the
-- scalar mmr_value, but no prior migration added those columns to the
-- valuation_snapshots table — only to mmr_cache (0035). Inserts have been
-- failing with PostgREST 42703 "column does not exist" wrapped under
-- RetryExhaustedError after 3 attempts.
--
-- All columns are nullable: VIN-path lookups may return distribution rows
-- only when extendedCoverage=false; legacy YMM rows pre-distribution-parsing
-- have NULLs. Backfill from raw_response is deferred (data is preserved in
-- the JSONB column).
-- =============================================================================

ALTER TABLE tav.valuation_snapshots
  ADD COLUMN IF NOT EXISTS mmr_wholesale_avg   numeric(10,2),
  ADD COLUMN IF NOT EXISTS mmr_wholesale_clean numeric(10,2),
  ADD COLUMN IF NOT EXISTS mmr_wholesale_rough numeric(10,2),
  ADD COLUMN IF NOT EXISTS mmr_retail_clean    numeric(10,2),
  ADD COLUMN IF NOT EXISTS mmr_sample_count    integer;
