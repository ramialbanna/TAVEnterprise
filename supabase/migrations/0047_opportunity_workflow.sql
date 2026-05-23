-- =============================================================================
-- Migration 0047 — v2 opportunity workflow + audit (Phase 6 Slice C)
--
-- Listing-level assignment/claim state and auditable actions for all opportunity
-- types (leads, near-misses, manual submissions). API id = normalized_listings.id.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.opportunity_workflow (
  normalized_listing_id     uuid        NOT NULL PRIMARY KEY
    REFERENCES tav.normalized_listings (id),
  status                    text        NOT NULL DEFAULT 'new'
    CHECK (status IN (
      'new','assigned','claimed','contacted','negotiating',
      'passed','duplicate','stale','sold','purchased','archived'
    )),
  assigned_to_user_id       uuid        REFERENCES tav.users (id),
  assigned_at               timestamptz,
  assigned_by_user_id       uuid        REFERENCES tav.users (id),
  claimed_by_user_id        uuid        REFERENCES tav.users (id),
  claimed_at                timestamptz,
  claim_expires_at          timestamptz,
  last_evaluated_by_user_id uuid        REFERENCES tav.users (id),
  last_evaluated_at         timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS opportunity_workflow_assigned_idx
  ON tav.opportunity_workflow (assigned_to_user_id)
  WHERE assigned_to_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS opportunity_workflow_claimed_idx
  ON tav.opportunity_workflow (claimed_by_user_id)
  WHERE claimed_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS opportunity_workflow_claim_expires_idx
  ON tav.opportunity_workflow (claim_expires_at)
  WHERE claim_expires_at IS NOT NULL;

CREATE TRIGGER opportunity_workflow_set_updated_at
  BEFORE UPDATE ON tav.opportunity_workflow
  FOR EACH ROW EXECUTE FUNCTION tav.set_updated_at();

CREATE TABLE IF NOT EXISTS tav.opportunity_actions (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  normalized_listing_id uuid        NOT NULL REFERENCES tav.normalized_listings (id),
  actor_user_id         uuid        NOT NULL REFERENCES tav.users (id),
  action                text        NOT NULL
    CHECK (action IN (
      'submitted','assigned','unassigned','reassigned','claimed','evaluated'
    )),
  notes                 text,
  metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS opportunity_actions_listing_idx
  ON tav.opportunity_actions (normalized_listing_id, created_at DESC);

CREATE INDEX IF NOT EXISTS opportunity_actions_actor_idx
  ON tav.opportunity_actions (actor_user_id);
