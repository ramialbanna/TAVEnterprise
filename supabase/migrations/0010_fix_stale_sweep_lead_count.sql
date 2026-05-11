-- =============================================================================
-- Migration 0010 — Fix stale sweep lead count tracking
--
-- run_stale_sweep() step 4 (leads → stale) was missing GET DIAGNOSTICS,
-- so the returned count excluded stale-transitioned leads. The log event
-- stale_sweep.complete { updated: N } was therefore always undercounted.
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
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;

  RETURN v_total;
END;
$$ LANGUAGE plpgsql;
