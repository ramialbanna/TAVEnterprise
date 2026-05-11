-- =============================================================================
-- Migration 0033 — user_activity feed index + presence cleanup function
--
-- Migration 0029 created a partial index for the presence sweep side
-- (active_until IS NOT NULL). This migration covers the opposite side:
-- the permanent activity feed query (active_until IS NULL), used by
-- GET /activity/feed and GET /activity/vin/:vin.
--
-- Also adds tav.purge_expired_activity() so a scheduled Worker can sweep
-- expired presence rows without pg_cron. Returns the count of deleted rows.
-- =============================================================================

-- Feed query index: covers ORDER BY created_at DESC WHERE active_until IS NULL.
CREATE INDEX IF NOT EXISTS user_activity_feed_idx
  ON tav.user_activity (created_at DESC)
  WHERE active_until IS NULL;

-- Cleanup function for expired presence rows.
-- Designed to be called by a periodic Cloudflare Worker (e.g. via Cron Triggers)
-- or on-demand. Safe to call repeatedly; only removes rows where active_until
-- has already elapsed. Does NOT touch permanent rows (active_until IS NULL).
CREATE OR REPLACE FUNCTION tav.purge_expired_activity()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH deleted AS (
    DELETE FROM tav.user_activity
    WHERE active_until IS NOT NULL
      AND active_until < now()
    RETURNING id
  )
  SELECT count(*)::integer FROM deleted;
$$;

GRANT EXECUTE ON FUNCTION tav.purge_expired_activity() TO service_role;
