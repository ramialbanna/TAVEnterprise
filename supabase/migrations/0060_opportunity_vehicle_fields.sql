-- =============================================================================
-- Migration 0060 — Opportunity detail Phase 4: persist vehicle + seller notes edits
--
-- Adds editable vehicle-identity columns and a seller_notes column to
-- normalized_listings, and extends the opportunity_actions.action enum with a
-- `fields_updated` value so vehicle/note edits are auditable.
-- =============================================================================

ALTER TABLE tav.normalized_listings
  ADD COLUMN IF NOT EXISTS body_type text,
  ADD COLUMN IF NOT EXISTS engine text,
  ADD COLUMN IF NOT EXISTS transmission text,
  ADD COLUMN IF NOT EXISTS exterior_color text,
  ADD COLUMN IF NOT EXISTS seller_notes text;

ALTER TABLE tav.opportunity_actions
  DROP CONSTRAINT IF EXISTS opportunity_actions_action_check;

ALTER TABLE tav.opportunity_actions
  ADD CONSTRAINT opportunity_actions_action_check
    CHECK (action IN (
      'submitted','assigned','unassigned','reassigned','claimed','evaluated',
      'status_changed','note_added','fields_updated'
    ));
