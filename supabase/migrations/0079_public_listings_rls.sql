-- =============================================================================
-- Migration 0079 — Lock public.listings from the Data API
--
-- Leftover table in the exposed public schema. anon and authenticated had
-- full grants and RLS was off, which is the daily security-linter email.
-- The app reads tav.* through service_role, which bypasses RLS.
-- Enable RLS with no policies and revoke the Data API grants. Do not FORCE.
--
-- Rollback:
--   ALTER TABLE public.listings DISABLE ROW LEVEL SECURITY;
--   GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--     ON TABLE public.listings TO anon, authenticated;
-- =============================================================================

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.listings
  FROM anon, authenticated;
