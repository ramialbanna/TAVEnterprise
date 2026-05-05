-- =============================================================================
-- Migration 0008 — valuation_snapshots table
--
-- Persists each MMR lookup result linked to a normalized listing.
-- confidence: 'vin' = VIN-matched (high); 'ymm' = YMM+mileage bucket (medium)
-- mmr_value is integer dollars. raw_response preserves the full API payload
-- for audit and future re-parsing without re-fetching.
--
-- One row per ingest event — not deduplicated. The latest snapshot per
-- normalized_listing_id is the authoritative valuation.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.valuation_snapshots (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_listing_id uuid         NOT NULL REFERENCES tav.normalized_listings(id) ON DELETE CASCADE,
  vehicle_candidate_id  uuid         REFERENCES tav.vehicle_candidates(id) ON DELETE SET NULL,
  vin                   text,
  year                  smallint,
  make                  text,
  model                 text,
  mileage               integer,
  mmr_value             integer      NOT NULL CHECK (mmr_value > 0),
  confidence            text         NOT NULL CHECK (confidence IN ('vin', 'ymm')),
  fetched_at            timestamptz  NOT NULL DEFAULT now(),
  raw_response          jsonb,
  created_at            timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vs_normalized_listing_id_idx ON tav.valuation_snapshots (normalized_listing_id);
CREATE INDEX IF NOT EXISTS vs_fetched_at_idx           ON tav.valuation_snapshots (fetched_at DESC);
