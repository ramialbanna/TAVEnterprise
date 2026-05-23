-- =============================================================================
-- Migration 0045 — tav.users for v2 identity (Phase 6)
--
-- Stores TAV staff profiles resolved from Auth.js (forwarded by the Next.js
-- /api/app/* proxy). Auto-provisioned on first authenticated request.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.users (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email           text        NOT NULL UNIQUE,
  display_name    text        NOT NULL,
  role            text        NOT NULL DEFAULT 'closer'
    CHECK (role IN ('admin', 'closer', 'viewer')),
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deactivated_at  timestamptz
);

CREATE INDEX IF NOT EXISTS users_is_active_idx
  ON tav.users (is_active)
  WHERE is_active = true;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON tav.users
  FOR EACH ROW EXECUTE FUNCTION tav.set_updated_at();
