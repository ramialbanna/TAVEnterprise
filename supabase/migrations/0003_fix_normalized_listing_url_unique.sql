-- =============================================================================
-- Migration 0003 — Replace partial unique index on normalized_listings
--
-- ON CONFLICT (source, listing_url) requires a non-partial unique constraint.
-- The partial index (WHERE freshness_status != 'removed') cannot be used as a
-- conflict inference target by PostgreSQL, causing every upsert to fail.
--
-- Removing the WHERE clause means a re-scraped URL after removal updates the
-- existing row (resurrects it) — which is the correct behavior for v1.
-- =============================================================================

DROP INDEX IF EXISTS tav.normalized_listings_source_listing_url_idx;

CREATE UNIQUE INDEX normalized_listings_source_listing_url_idx
  ON tav.normalized_listings (source, listing_url);
