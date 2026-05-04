-- =============================================================================
-- Migration 0005 — Stale sweep stored procedure
--
-- Called daily by the Cloudflare Worker cron (06:00 UTC) via db.rpc().
-- Returns the total number of rows updated across all status transitions.
--
-- Transition rules:
--   new|active   → aging          (last_seen_at 3–7 days ago)
--   *            → stale_suspected (last_seen_at 7–14 days ago)
--   *            → stale_confirmed (last_seen_at 14+ days ago)
--   leads        → stale status   (if underlying listing is stale_confirmed)
-- =============================================================================

CREATE OR REPLACE FUNCTION tav.run_stale_sweep()
RETURNS integer AS $$
DECLARE
  v_total integer := 0;
  v_count integer;
BEGIN
  -- 1. Mark aging (3–7 days unseen)
  UPDATE tav.normalized_listings
  SET freshness_status = 'aging',
      stale_score      = GREATEST(COALESCE(stale_score, 0), 25),
      updated_at       = now()
  WHERE freshness_status IN ('new', 'active')
    AND last_seen_at < now() - interval '3 days'
    AND last_seen_at >= now() - interval '7 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;

  -- 2. Mark stale_suspected (7–14 days unseen)
  UPDATE tav.normalized_listings
  SET freshness_status = 'stale_suspected',
      stale_score      = GREATEST(COALESCE(stale_score, 0), 50),
      updated_at       = now()
  WHERE freshness_status IN ('new', 'active', 'aging')
    AND last_seen_at < now() - interval '7 days'
    AND last_seen_at >= now() - interval '14 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;

  -- 3. Mark stale_confirmed (14+ days unseen)
  UPDATE tav.normalized_listings
  SET freshness_status = 'stale_confirmed',
      stale_score      = GREATEST(COALESCE(stale_score, 0), 75),
      updated_at       = now()
  WHERE freshness_status IN ('new', 'active', 'aging', 'stale_suspected')
    AND last_seen_at < now() - interval '14 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;

  -- 4. Stale out leads whose listing is now stale_confirmed
  UPDATE tav.leads l
  SET status     = 'stale',
      updated_at = now()
  FROM tav.normalized_listings nl
  WHERE l.normalized_listing_id = nl.id
    AND nl.freshness_status = 'stale_confirmed'
    AND l.status IN ('new', 'assigned');

  RETURN v_total;
END;
$$ LANGUAGE plpgsql;
