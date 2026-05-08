-- =============================================================================
-- Migration 0034 — link mmr_queries to vehicle_candidates and normalized_listings
--
-- Adds nullable FK columns so intelligence-layer queries can be traced back
-- to the pipeline objects that triggered them. Partial indexes cover only the
-- non-NULL subset, keeping index size proportional to actual usage.
-- =============================================================================

ALTER TABLE tav.mmr_queries
  ADD COLUMN vehicle_candidate_id  uuid REFERENCES tav.vehicle_candidates (id) ON DELETE SET NULL,
  ADD COLUMN normalized_listing_id uuid REFERENCES tav.normalized_listings  (id) ON DELETE SET NULL;

CREATE INDEX ON tav.mmr_queries (vehicle_candidate_id)
  WHERE vehicle_candidate_id IS NOT NULL;

CREATE INDEX ON tav.mmr_queries (normalized_listing_id)
  WHERE normalized_listing_id IS NOT NULL;

-- Leads already have vehicle_candidate_id; add a partial index for the
-- common lookup path (non-NULL candidates only).
CREATE INDEX ON tav.leads (vehicle_candidate_id)
  WHERE vehicle_candidate_id IS NOT NULL;
