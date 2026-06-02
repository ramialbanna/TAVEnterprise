-- =============================================================================
-- Migration 0057 — entry_method on normalized_listings (Phase 3 intake)
--
-- Provenance: how the listing entered TAV (manual submit | scraper ingest | import).
-- Locked values: workflow-and-ui-redesign.md §4.2
--
-- Application code stamps new writes in Phase 3.5 (manual + ingest handlers).
-- This migration backfills existing rows so attribution queries work immediately.
-- =============================================================================

ALTER TABLE tav.normalized_listings
  ADD COLUMN IF NOT EXISTS entry_method text
    CHECK (entry_method IN ('manual', 'scraper', 'import'));

-- Finder submissions (may share listing rows with prior scraper ingest).
UPDATE tav.normalized_listings nl
SET entry_method = 'manual'
WHERE entry_method IS NULL
  AND EXISTS (
    SELECT 1
    FROM tav.manual_opportunity_submissions mos
    WHERE mos.normalized_listing_id = nl.id
  );

-- Remaining rows predate explicit provenance — treat as scraper pipeline.
UPDATE tav.normalized_listings
SET entry_method = 'scraper'
WHERE entry_method IS NULL;

CREATE INDEX IF NOT EXISTS normalized_listings_entry_method_idx
  ON tav.normalized_listings (entry_method);
