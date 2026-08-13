-- =============================================================================
-- Migration 0068 — Blocked sellers pre-ingest filter (item 69)
--
-- When a buyer dismisses with reason `dealer`, the seller is auto-added here.
-- Ingest skips LLM/MMR for matching Dallas Facebook sellers.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.blocked_sellers (
  id                      uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source                  text        NOT NULL,
  region                  text        NOT NULL,
  seller_key              text        NOT NULL,
  seller_url              text,
  seller_name             text,
  reason                  text        NOT NULL DEFAULT 'dealer',
  flagged_by_user_id      uuid        REFERENCES tav.users (id),
  normalized_listing_id   uuid        REFERENCES tav.normalized_listings (id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blocked_sellers_v1_scope CHECK (source = 'facebook' AND region = 'dallas_tx'),
  CONSTRAINT blocked_sellers_reason_check CHECK (reason IN ('dealer'))
);

CREATE UNIQUE INDEX IF NOT EXISTS blocked_sellers_scope_key_unique
  ON tav.blocked_sellers (source, region, seller_key);

CREATE INDEX IF NOT EXISTS blocked_sellers_scope_idx
  ON tav.blocked_sellers (source, region);

CREATE TRIGGER blocked_sellers_set_updated_at
  BEFORE UPDATE ON tav.blocked_sellers
  FOR EACH ROW EXECUTE FUNCTION tav.set_updated_at();
