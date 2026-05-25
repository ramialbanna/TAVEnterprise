-- =============================================================================
-- Migration 0049 — Add lubbock_tx region (Phase 8: tav-tx-west soak)
--
-- Apify task tav-tx-west (vk7OijnAOOo8V1ekc) scrapes Lubbock, TX. Extends
-- region CHECK constraints and buy-box coverage so west-TX ingest can persist.
-- See docs/01-architecture/adr/0003-lubbock-tx-region.md
-- =============================================================================

-- ── Region CHECK constraints (idempotent drop + re-add) ─────────────────────

ALTER TABLE tav.source_runs
  DROP CONSTRAINT IF EXISTS source_runs_region_check;
ALTER TABLE tav.source_runs
  ADD CONSTRAINT source_runs_region_check
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx'));

ALTER TABLE tav.normalized_listings
  DROP CONSTRAINT IF EXISTS normalized_listings_region_check;
ALTER TABLE tav.normalized_listings
  ADD CONSTRAINT normalized_listings_region_check
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx'));

ALTER TABLE tav.vehicle_candidates
  DROP CONSTRAINT IF EXISTS vehicle_candidates_region_check;
ALTER TABLE tav.vehicle_candidates
  ADD CONSTRAINT vehicle_candidates_region_check
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx'));

ALTER TABLE tav.leads
  DROP CONSTRAINT IF EXISTS leads_region_check;
ALTER TABLE tav.leads
  ADD CONSTRAINT leads_region_check
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx'));

ALTER TABLE tav.market_velocities
  DROP CONSTRAINT IF EXISTS market_velocities_region_check;
ALTER TABLE tav.market_velocities
  ADD CONSTRAINT market_velocities_region_check
    CHECK (region IS NULL OR region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx'));

-- ── Buy-box: include west TX in broad + truck rules ───────────────────────────

UPDATE tav.buy_box_rules
SET regions = array_append(regions, 'lubbock_tx')
WHERE rule_id IN ('bbr-all-2018-2023-100k', 'bbr-truck-2017-2023-120k')
  AND regions IS NOT NULL
  AND NOT ('lubbock_tx' = ANY(regions));
