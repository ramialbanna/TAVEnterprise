-- =============================================================================
-- Migration 0083 — Twelve more Facebook state tasks.
--
-- Nebraska, Colorado, Utah, Illinois, Kentucky, Tennessee, Alabama,
-- Mississippi, Georgia, Florida, Indiana, and Iowa. One region key per task,
-- same as the Texas task landing on dallas_tx. Extends region CHECKs and the
-- two broad buy-box rules.
-- =============================================================================

ALTER TABLE tav.source_runs
  DROP CONSTRAINT IF EXISTS source_runs_region_check;
ALTER TABLE tav.source_runs
  ADD CONSTRAINT source_runs_region_check
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok','phoenix_az','kansas_city_mo','minneapolis_mn','lincoln_ne','denver_co','salt_lake_city_ut','chicago_il','louisville_ky','nashville_tn','birmingham_al','jackson_ms','atlanta_ga','miami_fl','indianapolis_in','des_moines_ia'));

ALTER TABLE tav.normalized_listings
  DROP CONSTRAINT IF EXISTS normalized_listings_region_check;
ALTER TABLE tav.normalized_listings
  ADD CONSTRAINT normalized_listings_region_check
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok','phoenix_az','kansas_city_mo','minneapolis_mn','lincoln_ne','denver_co','salt_lake_city_ut','chicago_il','louisville_ky','nashville_tn','birmingham_al','jackson_ms','atlanta_ga','miami_fl','indianapolis_in','des_moines_ia'));

ALTER TABLE tav.vehicle_candidates
  DROP CONSTRAINT IF EXISTS vehicle_candidates_region_check;
ALTER TABLE tav.vehicle_candidates
  ADD CONSTRAINT vehicle_candidates_region_check
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok','phoenix_az','kansas_city_mo','minneapolis_mn','lincoln_ne','denver_co','salt_lake_city_ut','chicago_il','louisville_ky','nashville_tn','birmingham_al','jackson_ms','atlanta_ga','miami_fl','indianapolis_in','des_moines_ia'));

ALTER TABLE tav.leads
  DROP CONSTRAINT IF EXISTS leads_region_check;
ALTER TABLE tav.leads
  ADD CONSTRAINT leads_region_check
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok','phoenix_az','kansas_city_mo','minneapolis_mn','lincoln_ne','denver_co','salt_lake_city_ut','chicago_il','louisville_ky','nashville_tn','birmingham_al','jackson_ms','atlanta_ga','miami_fl','indianapolis_in','des_moines_ia'));

ALTER TABLE tav.market_velocities
  DROP CONSTRAINT IF EXISTS market_velocities_region_check;
ALTER TABLE tav.market_velocities
  ADD CONSTRAINT market_velocities_region_check
    CHECK (region IS NULL OR region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok','phoenix_az','kansas_city_mo','minneapolis_mn','lincoln_ne','denver_co','salt_lake_city_ut','chicago_il','louisville_ky','nashville_tn','birmingham_al','jackson_ms','atlanta_ga','miami_fl','indianapolis_in','des_moines_ia'));

UPDATE tav.buy_box_rules
SET regions = regions || ARRAY['lincoln_ne','denver_co','salt_lake_city_ut','chicago_il','louisville_ky','nashville_tn','birmingham_al','jackson_ms','atlanta_ga','miami_fl','indianapolis_in','des_moines_ia']
WHERE rule_id IN ('bbr-all-2018-2023-100k', 'bbr-truck-2017-2023-120k')
  AND regions IS NOT NULL
  AND NOT ('lincoln_ne' = ANY(regions));
