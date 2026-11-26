-- =============================================================================
-- Migration 0082 — Phoenix, Kansas City, and Minneapolis regions.
--
-- Facebook custom tasks arizona, missouri, and minnesota scrape several cities
-- in each state. One region key per task, same as the Texas task landing on
-- dallas_tx. Extends region CHECKs and the two broad buy-box rules.
-- =============================================================================

ALTER TABLE tav.source_runs
  DROP CONSTRAINT IF EXISTS source_runs_region_check;
ALTER TABLE tav.source_runs
  ADD CONSTRAINT source_runs_region_check
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok','phoenix_az','kansas_city_mo','minneapolis_mn'));

ALTER TABLE tav.normalized_listings
  DROP CONSTRAINT IF EXISTS normalized_listings_region_check;
ALTER TABLE tav.normalized_listings
  ADD CONSTRAINT normalized_listings_region_check
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok','phoenix_az','kansas_city_mo','minneapolis_mn'));

ALTER TABLE tav.vehicle_candidates
  DROP CONSTRAINT IF EXISTS vehicle_candidates_region_check;
ALTER TABLE tav.vehicle_candidates
  ADD CONSTRAINT vehicle_candidates_region_check
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok','phoenix_az','kansas_city_mo','minneapolis_mn'));

ALTER TABLE tav.leads
  DROP CONSTRAINT IF EXISTS leads_region_check;
ALTER TABLE tav.leads
  ADD CONSTRAINT leads_region_check
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok','phoenix_az','kansas_city_mo','minneapolis_mn'));

ALTER TABLE tav.market_velocities
  DROP CONSTRAINT IF EXISTS market_velocities_region_check;
ALTER TABLE tav.market_velocities
  ADD CONSTRAINT market_velocities_region_check
    CHECK (region IS NULL OR region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok','phoenix_az','kansas_city_mo','minneapolis_mn'));

UPDATE tav.buy_box_rules
SET regions = regions || ARRAY['phoenix_az','kansas_city_mo','minneapolis_mn']
WHERE rule_id IN ('bbr-all-2018-2023-100k', 'bbr-truck-2017-2023-120k')
  AND regions IS NOT NULL
  AND NOT ('phoenix_az' = ANY(regions));
