-- =============================================================================
-- Migration 0044 — Add 'truncated' status to tav.source_runs
--
-- handleIngest applies a per-request deadline (~25 s) so the Cloudflare Worker
-- has enough wall-clock budget to write the source_runs completion row before
-- the runtime cuts the request. When the loop hits that deadline part-way
-- through a large batch, the row transitions to status='truncated' with an
-- error_message describing how many items were left unprocessed.
--
-- Before this migration, the CHECK constraint accepted only
-- ('running','completed','failed') — the new 'truncated' value would violate
-- the constraint and silently fall back to 'running' via withRetry, leaving
-- the row stuck. This migration extends the enum.
--
-- Idempotent: re-running the migration is a no-op once the new CHECK is in
-- place (DROP IF EXISTS + ADD).
-- =============================================================================

ALTER TABLE tav.source_runs
  DROP CONSTRAINT IF EXISTS source_runs_status_check;

ALTER TABLE tav.source_runs
  ADD CONSTRAINT source_runs_status_check
    CHECK (status IN ('running','completed','failed','truncated'));
