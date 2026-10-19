-- =============================================================================
-- Migration 0080 — Buyer contact keys and copied-description templates (§80)
--
-- A buyer can mark a lead as a dealer before Facebook sends a profile URL.
-- The phone, website, or email on that ad blocks the next car at ingest.
-- A long copied description is a contact key too, and still needs 3 cars.
--
-- Service role only. No anon policies. Do not FORCE RLS.
--
-- Rollback:
--   DROP TABLE tav.blocked_contact_keys;
--   ALTER TABLE tav.listing_contact_keys DROP CONSTRAINT listing_contact_keys_key_check;
--   ALTER TABLE tav.listing_contact_keys ADD CONSTRAINT listing_contact_keys_key_check
--     CHECK (contact_key ~ '^(phone:[2-9][0-9]{9}|email:.+@.+|url:.+)$');
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.blocked_contact_keys (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source              text        NOT NULL DEFAULT 'facebook',
  contact_key         text        NOT NULL,
  listing_url         text,
  flagged_by_user_id  uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blocked_contact_keys_source_check CHECK (source = 'facebook'),
  CONSTRAINT blocked_contact_keys_key_check CHECK (
    contact_key ~ '^(phone:[2-9][0-9]{9}|email:.+@.+|url:.+)$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS blocked_contact_keys_source_key_unique
  ON tav.blocked_contact_keys (source, contact_key);

ALTER TABLE tav.blocked_contact_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON tav.blocked_contact_keys FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON tav.blocked_contact_keys TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'listing_contact_keys_key_check'
      AND conrelid = 'tav.listing_contact_keys'::regclass
  ) THEN
    ALTER TABLE tav.listing_contact_keys DROP CONSTRAINT listing_contact_keys_key_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'listing_contact_keys_key_check'
      AND conrelid = 'tav.listing_contact_keys'::regclass
  ) THEN
    ALTER TABLE tav.listing_contact_keys
      ADD CONSTRAINT listing_contact_keys_key_check
      CHECK (contact_key ~ '^(phone:[2-9][0-9]{9}|email:.+@.+|url:.+|copy:[a-f0-9]{32})$');
  END IF;
END $$;
