-- =============================================================================
-- Migration 0078 — Listing contact keys (§80 action 1)
--
-- A repeated phone, website, WhatsApp link, or email is a seller key when
-- Facebook never sent a profile URL. Ingest records one row per listing + key
-- and drops the car once 3 different vehicles share that key in 30 days.
--
-- Service role only. No anon policies. Do not FORCE RLS.
--
-- Rollback:
--   DROP TABLE tav.listing_contact_keys;
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.listing_contact_keys (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source        text        NOT NULL DEFAULT 'facebook',
  listing_url   text        NOT NULL,
  contact_key   text        NOT NULL,
  vehicle_key   text        NOT NULL,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listing_contact_keys_source_check CHECK (source = 'facebook'),
  CONSTRAINT listing_contact_keys_key_check CHECK (
    contact_key ~ '^(phone:[2-9][0-9]{9}|email:.+@.+|url:.+)$'
  ),
  CONSTRAINT listing_contact_keys_vehicle_check CHECK (
    vehicle_key ~ '^(vin:[A-HJ-NPR-Z0-9]{17}|url:.+)$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS listing_contact_keys_listing_key_unique
  ON tav.listing_contact_keys (listing_url, contact_key);

-- Count distinct vehicles for one key inside the 30-day window.
CREATE INDEX IF NOT EXISTS listing_contact_keys_lookup_idx
  ON tav.listing_contact_keys (source, contact_key, last_seen_at);

ALTER TABLE tav.listing_contact_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON tav.listing_contact_keys FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON tav.listing_contact_keys TO service_role;
