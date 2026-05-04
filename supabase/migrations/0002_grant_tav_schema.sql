-- =============================================================================
-- Migration 0002 — Grant tav schema access to PostgREST roles
--
-- PREREQUISITE (cannot be done via SQL):
--   Supabase Dashboard → Settings → API → "Exposed schemas" → add "tav"
--   Without this, PostgREST returns PGRST125 before these grants are reached.
--
-- service_role  : Worker-only; needs full DML + sequence usage
-- authenticated : future dashboard/buyer app; read-only for now
-- anon          : PostgREST routing requires USAGE even for routes that never
--                 use this role
-- =============================================================================

GRANT USAGE ON SCHEMA tav TO service_role, authenticated, anon;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA tav
  TO service_role;

GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA tav
  TO service_role;

GRANT SELECT
  ON ALL TABLES IN SCHEMA tav
  TO authenticated, anon;

-- Ensure future tables created in tav inherit the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA tav
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA tav
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA tav
  GRANT SELECT ON TABLES TO authenticated, anon;
