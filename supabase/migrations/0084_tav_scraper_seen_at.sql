-- =============================================================================
-- Migration 0084 — Mark listings the TAV-owned Facebook scraper has sent.
--
-- The Opportunities sheet marks these rows so buyers can tell them apart.
-- normalized_listings.source_run_id is overwritten on every scrape, so it
-- flips when the vendor scraper sees the same car later. This column is
-- set once, the first time a TAV scraper run touches the listing, and is
-- never cleared.
--
-- A TAV scraper run is a source_runs row whose run_id starts "tavscraper-".
-- The scraper (tav-lead-scraper) builds run_id as
-- "tavscraper-<region>-<time>-<rand>". Keep that prefix if it changes.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS normalized_listings_tav_scraper_seen ON tav.normalized_listings;
--   DROP FUNCTION IF EXISTS tav.set_tav_scraper_seen_at();
--   ALTER TABLE tav.normalized_listings DROP COLUMN IF EXISTS tav_scraper_seen_at;
-- =============================================================================

ALTER TABLE tav.normalized_listings
  ADD COLUMN IF NOT EXISTS tav_scraper_seen_at timestamptz;

COMMENT ON COLUMN tav.normalized_listings.tav_scraper_seen_at IS
  'First time a TAV-owned scraper run (source_runs.run_id like ''tavscraper-%'') sent this listing. Never cleared.';

CREATE OR REPLACE FUNCTION tav.set_tav_scraper_seen_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = tav, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.tav_scraper_seen_at IS NOT NULL THEN
    NEW.tav_scraper_seen_at := OLD.tav_scraper_seen_at;
    RETURN NEW;
  END IF;

  IF NEW.tav_scraper_seen_at IS NULL
     AND NEW.source_run_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM tav.source_runs sr
       WHERE sr.id = NEW.source_run_id
         AND sr.run_id LIKE 'tavscraper-%'
     ) THEN
    NEW.tav_scraper_seen_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalized_listings_tav_scraper_seen ON tav.normalized_listings;
CREATE TRIGGER normalized_listings_tav_scraper_seen
  BEFORE INSERT OR UPDATE OF source_run_id ON tav.normalized_listings
  FOR EACH ROW EXECUTE FUNCTION tav.set_tav_scraper_seen_at();

-- Backfill: listings already sent by a TAV scraper run. raw_listings keeps a
-- row per scrape, so it still shows the TAV run after the vendor re-scraped
-- the car. normalized listing_url has no trailing slash.
UPDATE tav.normalized_listings nl
SET tav_scraper_seen_at = first_run.seen_at
FROM (
  SELECT rtrim(rl.raw_item->>'url', '/') AS url, min(sr.created_at) AS seen_at
  FROM tav.source_runs sr
  JOIN tav.raw_listings rl ON rl.source_run_id = sr.id
  WHERE sr.run_id LIKE 'tavscraper-%'
  GROUP BY 1
) first_run
WHERE nl.source = 'facebook'
  AND nl.listing_url = first_run.url
  AND nl.tav_scraper_seen_at IS NULL;
