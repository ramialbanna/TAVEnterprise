-- =============================================================================
-- Migration 0062 — Bad lead workflow status (items 45/47/51)
--
-- Adds `bad_lead` so closers can flag/dismiss poor leads with a reason and
-- remove them from default Opportunities queue views for everyone.
-- =============================================================================

ALTER TABLE tav.opportunity_workflow
  DROP CONSTRAINT IF EXISTS opportunity_workflow_status_check;

ALTER TABLE tav.opportunity_workflow
  ADD CONSTRAINT opportunity_workflow_status_check
    CHECK (status IN (
      'new','assigned','claimed','reviewed','contacted','negotiating',
      'passed','duplicate','stale','sold','purchased','archived','bad_lead'
    ));

ALTER TABLE tav.leads
  DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE tav.leads
  ADD CONSTRAINT leads_status_check
    CHECK (status IN (
      'new','assigned','claimed','reviewed','contacted','negotiating',
      'passed','duplicate','stale','sold','purchased','archived','bad_lead'
    ));
