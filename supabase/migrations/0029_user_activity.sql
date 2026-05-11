-- =============================================================================
-- Migration 0029 — Add tav.user_activity
--
-- Presence + activity feed for the MMR portal. Powers UX cues like
-- "Joe is currently viewing this VIN" and the global activity timeline.
--
-- Short-lived rows: active_until drives the presence sweep. NULL active_until
-- means the row is a permanent activity-feed entry (no presence semantics).
-- A periodic job (or read-time filter) prunes rows where active_until < now().
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.user_activity (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             text,
  user_name           text,
  user_email          text,
  vin                 text,
  year                smallint,
  make                text,
  model               text,
  activity_type       text        NOT NULL
    CHECK (activity_type IN (
      'mmr_search','vin_view','sales_upload','kpi_view','batch_view'
    )),
  activity_payload    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  active_until        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- "Who is on this VIN?" lookup (partial — VIN is nullable)
CREATE INDEX IF NOT EXISTS user_activity_vin_idx
  ON tav.user_activity (vin)
  WHERE vin IS NOT NULL;

-- Per-user activity timeline
CREATE INDEX IF NOT EXISTS user_activity_user_id_idx
  ON tav.user_activity (user_id);

-- Global activity feed
CREATE INDEX IF NOT EXISTS user_activity_created_at_idx
  ON tav.user_activity (created_at DESC);

-- Presence-sweep cleanup ("delete rows past their TTL")
CREATE INDEX IF NOT EXISTS user_activity_active_until_idx
  ON tav.user_activity (active_until)
  WHERE active_until IS NOT NULL;
