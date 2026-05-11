-- =============================================================================
-- Migration 0031 — Fix request_id uniqueness on tav.mmr_queries
--
-- Migration 0030 created a PARTIAL unique index on request_id
-- (WHERE request_id IS NOT NULL). Supabase JS upsert with onConflict:
-- "request_id" generates `ON CONFLICT (request_id) DO NOTHING`, which
-- requires PostgreSQL to infer a non-partial unique index or constraint.
-- A partial index is only inferable when the ON CONFLICT clause includes
-- the matching WHERE predicate — which Supabase JS does not emit.
--
-- Replace the partial index with a plain unique constraint. PostgreSQL
-- UNIQUE constraints allow multiple NULLs, so pre-G.2 rows (request_id
-- IS NULL) are unaffected.
-- =============================================================================

DROP INDEX IF EXISTS tav.mmr_queries_request_id_key;

ALTER TABLE tav.mmr_queries
  ADD CONSTRAINT mmr_queries_request_id_key UNIQUE (request_id);
