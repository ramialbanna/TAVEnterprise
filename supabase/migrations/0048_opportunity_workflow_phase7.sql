-- =============================================================================
-- Migration 0048 — v2 opportunity workflow Phase 7 (status + notes)
--
-- Adds `reviewed` workflow status and extends audit action types for status
-- changes and standalone notes.
-- =============================================================================

ALTER TABLE tav.opportunity_workflow
  DROP CONSTRAINT IF EXISTS opportunity_workflow_status_check;

ALTER TABLE tav.opportunity_workflow
  ADD CONSTRAINT opportunity_workflow_status_check
    CHECK (status IN (
      'new','assigned','claimed','reviewed','contacted','negotiating',
      'passed','duplicate','stale','sold','purchased','archived'
    ));

ALTER TABLE tav.opportunity_actions
  DROP CONSTRAINT IF EXISTS opportunity_actions_action_check;

ALTER TABLE tav.opportunity_actions
  ADD CONSTRAINT opportunity_actions_action_check
    CHECK (action IN (
      'submitted','assigned','unassigned','reassigned','claimed','evaluated',
      'status_changed','note_added'
    ));
