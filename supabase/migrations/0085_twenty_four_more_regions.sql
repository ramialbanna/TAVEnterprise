-- =============================================================================
-- Migration 0085 — 24 more regions for the TAV Facebook scraper's state tasks.
--
-- California, Pennsylvania, New York, Ohio, Michigan, Washington, New England,
-- North Carolina, Virginia, Arkansas, South Carolina, Louisiana, Wisconsin,
-- Oregon, Idaho, Nevada, Kansas, Wyoming, Montana, North Dakota, New Mexico,
-- South Dakota, West Virginia, and the Mid-Atlantic. One region key per task,
-- named for the largest metro (New England = boston_ma, Mid-Atlantic =
-- baltimore_md). Extends the region CHECKs and the two broad buy-box rules,
-- same as 0083.
--
-- Rollback: re-run the CHECK statements from 0083 (rows already stored with a
-- new region must be moved or deleted first), and remove the 24 keys from
-- bbr-all-2018-2023-100k and bbr-truck-2017-2023-120k.
-- =============================================================================

ALTER TABLE tav.source_runs
  DROP CONSTRAINT IF EXISTS source_runs_region_check;
ALTER TABLE tav.source_runs
  ADD CONSTRAINT source_runs_region_check
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok','phoenix_az','kansas_city_mo','minneapolis_mn','lincoln_ne','denver_co','salt_lake_city_ut','chicago_il','louisville_ky','nashville_tn','birmingham_al','jackson_ms','atlanta_ga','miami_fl','indianapolis_in','des_moines_ia','los_angeles_ca','philadelphia_pa','new_york_ny','columbus_oh','detroit_mi','seattle_wa','boston_ma','charlotte_nc','richmond_va','little_rock_ar','columbia_sc','new_orleans_la','milwaukee_wi','portland_or','boise_id','las_vegas_nv','wichita_ks','cheyenne_wy','billings_mt','fargo_nd','albuquerque_nm','sioux_falls_sd','charleston_wv','baltimore_md')) NOT VALID;

ALTER TABLE tav.normalized_listings
  DROP CONSTRAINT IF EXISTS normalized_listings_region_check;
ALTER TABLE tav.normalized_listings
  ADD CONSTRAINT normalized_listings_region_check
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok','phoenix_az','kansas_city_mo','minneapolis_mn','lincoln_ne','denver_co','salt_lake_city_ut','chicago_il','louisville_ky','nashville_tn','birmingham_al','jackson_ms','atlanta_ga','miami_fl','indianapolis_in','des_moines_ia','los_angeles_ca','philadelphia_pa','new_york_ny','columbus_oh','detroit_mi','seattle_wa','boston_ma','charlotte_nc','richmond_va','little_rock_ar','columbia_sc','new_orleans_la','milwaukee_wi','portland_or','boise_id','las_vegas_nv','wichita_ks','cheyenne_wy','billings_mt','fargo_nd','albuquerque_nm','sioux_falls_sd','charleston_wv','baltimore_md')) NOT VALID;

ALTER TABLE tav.vehicle_candidates
  DROP CONSTRAINT IF EXISTS vehicle_candidates_region_check;
ALTER TABLE tav.vehicle_candidates
  ADD CONSTRAINT vehicle_candidates_region_check
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok','phoenix_az','kansas_city_mo','minneapolis_mn','lincoln_ne','denver_co','salt_lake_city_ut','chicago_il','louisville_ky','nashville_tn','birmingham_al','jackson_ms','atlanta_ga','miami_fl','indianapolis_in','des_moines_ia','los_angeles_ca','philadelphia_pa','new_york_ny','columbus_oh','detroit_mi','seattle_wa','boston_ma','charlotte_nc','richmond_va','little_rock_ar','columbia_sc','new_orleans_la','milwaukee_wi','portland_or','boise_id','las_vegas_nv','wichita_ks','cheyenne_wy','billings_mt','fargo_nd','albuquerque_nm','sioux_falls_sd','charleston_wv','baltimore_md')) NOT VALID;

ALTER TABLE tav.leads
  DROP CONSTRAINT IF EXISTS leads_region_check;
ALTER TABLE tav.leads
  ADD CONSTRAINT leads_region_check
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok','phoenix_az','kansas_city_mo','minneapolis_mn','lincoln_ne','denver_co','salt_lake_city_ut','chicago_il','louisville_ky','nashville_tn','birmingham_al','jackson_ms','atlanta_ga','miami_fl','indianapolis_in','des_moines_ia','los_angeles_ca','philadelphia_pa','new_york_ny','columbus_oh','detroit_mi','seattle_wa','boston_ma','charlotte_nc','richmond_va','little_rock_ar','columbia_sc','new_orleans_la','milwaukee_wi','portland_or','boise_id','las_vegas_nv','wichita_ks','cheyenne_wy','billings_mt','fargo_nd','albuquerque_nm','sioux_falls_sd','charleston_wv','baltimore_md')) NOT VALID;

ALTER TABLE tav.market_velocities
  DROP CONSTRAINT IF EXISTS market_velocities_region_check;
ALTER TABLE tav.market_velocities
  ADD CONSTRAINT market_velocities_region_check
    CHECK (region IS NULL OR region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok','phoenix_az','kansas_city_mo','minneapolis_mn','lincoln_ne','denver_co','salt_lake_city_ut','chicago_il','louisville_ky','nashville_tn','birmingham_al','jackson_ms','atlanta_ga','miami_fl','indianapolis_in','des_moines_ia','los_angeles_ca','philadelphia_pa','new_york_ny','columbus_oh','detroit_mi','seattle_wa','boston_ma','charlotte_nc','richmond_va','little_rock_ar','columbia_sc','new_orleans_la','milwaukee_wi','portland_or','boise_id','las_vegas_nv','wichita_ks','cheyenne_wy','billings_mt','fargo_nd','albuquerque_nm','sioux_falls_sd','charleston_wv','baltimore_md')) NOT VALID;

-- NOT VALID above keeps the ALTERs short (no full-table scan under an exclusive
-- lock). VALIDATE scans while ingest keeps writing, but only when it runs in its
-- own transaction: in the SQL editor, run the five VALIDATE lines as a second query.
ALTER TABLE tav.source_runs VALIDATE CONSTRAINT source_runs_region_check;
ALTER TABLE tav.normalized_listings VALIDATE CONSTRAINT normalized_listings_region_check;
ALTER TABLE tav.vehicle_candidates VALIDATE CONSTRAINT vehicle_candidates_region_check;
ALTER TABLE tav.leads VALIDATE CONSTRAINT leads_region_check;
ALTER TABLE tav.market_velocities VALIDATE CONSTRAINT market_velocities_region_check;

UPDATE tav.buy_box_rules
SET regions = regions || ARRAY['los_angeles_ca','philadelphia_pa','new_york_ny','columbus_oh','detroit_mi','seattle_wa','boston_ma','charlotte_nc','richmond_va','little_rock_ar','columbia_sc','new_orleans_la','milwaukee_wi','portland_or','boise_id','las_vegas_nv','wichita_ks','cheyenne_wy','billings_mt','fargo_nd','albuquerque_nm','sioux_falls_sd','charleston_wv','baltimore_md']
WHERE rule_id IN ('bbr-all-2018-2023-100k', 'bbr-truck-2017-2023-120k')
  AND regions IS NOT NULL
  AND NOT ('los_angeles_ca' = ANY(regions));
