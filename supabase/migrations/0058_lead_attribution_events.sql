-- =============================================================================
-- Migration 0058 — lead_attribution_events (Phase 3 intake, WF-7)
--
-- Logs duplicate URL re-submits and future attribution events without overloading
-- leads or manual_opportunity_submissions.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.lead_attribution_events (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  normalized_listing_id uuid        NOT NULL REFERENCES tav.normalized_listings (id),
  actor_user_id         uuid        NOT NULL REFERENCES tav.users (id),
  event_type            text        NOT NULL
    CHECK (event_type IN ('duplicate_url_resubmit')),
  metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_attribution_events_listing_idx
  ON tav.lead_attribution_events (normalized_listing_id, created_at DESC);

CREATE INDEX IF NOT EXISTS lead_attribution_events_actor_idx
  ON tav.lead_attribution_events (actor_user_id, created_at DESC);
