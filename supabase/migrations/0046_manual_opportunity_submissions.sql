-- =============================================================================
-- Migration 0046 — Manual opportunity submissions (v2 Phase 6, Slice B)
--
-- Records finder-submitted listing URLs with optional closer routing.
-- Rows join to normalized_listings; the Opportunities read model surfaces them
-- as type=manual_submission even before lead/MMR exists.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.manual_opportunity_submissions (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  normalized_listing_id uuid        NOT NULL REFERENCES tav.normalized_listings (id),
  submitted_by_user_id  uuid        NOT NULL REFERENCES tav.users (id),
  assigned_to_user_id   uuid        REFERENCES tav.users (id),
  seller_notes          text,
  submitter_notes       text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manual_opportunity_submissions_listing_idx
  ON tav.manual_opportunity_submissions (normalized_listing_id);

CREATE INDEX IF NOT EXISTS manual_opportunity_submissions_created_idx
  ON tav.manual_opportunity_submissions (created_at DESC);

CREATE INDEX IF NOT EXISTS manual_opportunity_submissions_submitter_idx
  ON tav.manual_opportunity_submissions (submitted_by_user_id);
