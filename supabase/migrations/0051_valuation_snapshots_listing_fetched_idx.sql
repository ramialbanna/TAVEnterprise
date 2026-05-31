-- Migration 0051 — latest valuation per normalized listing (v2 Opportunities read model)
--
-- Supports picking the newest snapshot per normalized_listing_id in list/detail queries.

CREATE INDEX IF NOT EXISTS vs_normalized_listing_fetched_at_idx
  ON tav.valuation_snapshots (normalized_listing_id, fetched_at DESC);
