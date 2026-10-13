-- =============================================================================
-- Migration 0077 — GoLogin residential proxy balance (item 74)
--
-- Fly seller enrich polls the GoLogin traffic API and upserts one row here:
-- every 1 minute, backing off to every 15 minutes once the balance has not
-- changed for 15 minutes, and back to 1 minute on the next change. The
-- GoLogin token stays on Fly; anything that needs the balance (a Worker gate,
-- a "proxy low" alert) reads this row instead.
--
-- Readers must treat a missing row or a stale checked_at as "unknown", never
-- as "empty", so a broken poller cannot switch a feature off.
--
-- 0076 is reserved for §79 (branch feat/79-photo-reposts).
--
-- Rollback:
--   DROP TABLE tav.gologin_proxy_status;
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.gologin_proxy_status (
  pool              text        PRIMARY KEY CHECK (pool IN ('residential')),
  remaining_gb      numeric,
  used_gb           numeric,
  limit_gb          numeric,
  -- Last successful read from GoLogin. NULL until the first success.
  checked_at        timestamptz,
  -- Last time remaining_gb moved. Drives the 15-minute back-off.
  changed_at        timestamptz,
  poll_interval_s   integer     NOT NULL,
  last_error        text,
  last_error_at     timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tav.gologin_proxy_status ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON tav.gologin_proxy_status FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON tav.gologin_proxy_status TO service_role;
