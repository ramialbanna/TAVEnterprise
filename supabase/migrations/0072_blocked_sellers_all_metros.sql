-- =============================================================================
-- Migration 0072 — Blocked sellers, all Facebook metros (item 74 action 1)
--
-- Item 69 shipped Dallas-only. The ingest task is 13 metros; Houston / Austin /
-- OK writes were a no-op. Unique on (source, seller_key) so the same dealer
-- posting Dallas and Houston matches. `region` stays as first-seen audit.
-- =============================================================================

ALTER TABLE tav.blocked_sellers
  DROP CONSTRAINT IF EXISTS blocked_sellers_v1_scope;

ALTER TABLE tav.blocked_sellers
  ADD CONSTRAINT blocked_sellers_v1_scope CHECK (source = 'facebook');

DROP INDEX IF EXISTS tav.blocked_sellers_scope_key_unique;

CREATE UNIQUE INDEX IF NOT EXISTS blocked_sellers_source_key_unique
  ON tav.blocked_sellers (source, seller_key);
