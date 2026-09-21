-- =============================================================================
-- Migration 0075 — Lock down tav from PostgREST anon/authenticated
--
-- The Worker, Fly enrich, and scripts use service_role. That role bypasses
-- RLS unless FORCE ROW LEVEL SECURITY is on. Do not FORCE.
--
-- anon/authenticated currently have SELECT on every tav table (migration 0002)
-- and tav is an exposed API schema. Enable RLS with no policies (deny) and
-- revoke those grants. Views/MVs do not take RLS — revoke SELECT instead.
--
-- Rollback:
--   ALTER TABLE tav.<table> DISABLE ROW LEVEL SECURITY;
--   GRANT SELECT ON ALL TABLES IN SCHEMA tav TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA tav GRANT SELECT ON TABLES TO anon, authenticated;
-- =============================================================================

-- 1. RLS on every ordinary table. No FORCE. No policies.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'tav'
      AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE tav.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;

-- 2. Take away the 0002 read grants. Covers tables, views, and materialized views.
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA tav
  FROM anon, authenticated;

REVOKE ALL
  ON ALL SEQUENCES IN SCHEMA tav
  FROM anon, authenticated;

-- 3. Functions default to EXECUTE for PUBLIC. Pull that back; service_role keeps them.
REVOKE ALL
  ON ALL FUNCTIONS IN SCHEMA tav
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON ALL FUNCTIONS IN SCHEMA tav
  TO service_role;

-- 4. Future objects created by postgres (migrations / SQL editor) must not
--    re-open SELECT or EXECUTE to the Data API roles.
ALTER DEFAULT PRIVILEGES IN SCHEMA tav
  REVOKE SELECT ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA tav
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA tav
  GRANT EXECUTE ON FUNCTIONS TO service_role;
