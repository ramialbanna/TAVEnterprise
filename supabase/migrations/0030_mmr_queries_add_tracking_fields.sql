-- =============================================================================
-- Migration 0030 — Add tracking fields to tav.mmr_queries
--
-- Phase G.2: The persistence layer needs three fields that were deferred from
-- the initial 0027 schema:
--
--   request_id  — unique per-lookup idempotency key (Cloudflare requestId).
--                 Prevents duplicate audit rows on Worker retry.
--   retry_count — number of Manheim HTTP attempts made (0 on cache hits).
--   latency_ms  — total wall-clock time from lookup start to completion.
--   outcome     — "hit" (cache), "miss" (live call), or "error".
--
-- All four columns are nullable so existing rows are unaffected. New writes
-- from the intelligence Worker always populate them.
-- =============================================================================

ALTER TABLE tav.mmr_queries
  ADD COLUMN IF NOT EXISTS request_id  text,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS latency_ms  integer,
  ADD COLUMN IF NOT EXISTS outcome     text
    CHECK (outcome IN ('hit','miss','error'));

-- Unique constraint on request_id for idempotent inserts (ON CONFLICT DO NOTHING).
-- Partial — only applies where request_id is non-null so pre-G.2 rows are safe.
CREATE UNIQUE INDEX IF NOT EXISTS mmr_queries_request_id_key
  ON tav.mmr_queries (request_id)
  WHERE request_id IS NOT NULL;
