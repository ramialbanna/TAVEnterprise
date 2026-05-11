-- =============================================================================
-- Migration 0020 — Replace partial fingerprint index with full unique constraint
--
-- Migration 0011 created a partial unique index (WHERE import_fingerprint IS NOT NULL)
-- for dedup. Supabase's JS client upsert ON CONFLICT requires a full unique
-- constraint, not a partial index. Since import_fingerprint is always set by the
-- parser (never NULL in practice), a full unique constraint is equivalent.
--
-- PostgreSQL UNIQUE constraints allow multiple NULLs (NULL != NULL), so the
-- behavior for any NULL fingerprint rows is preserved.
-- =============================================================================

-- Drop the partial unique index from migration 0011
DROP INDEX IF EXISTS tav.purchase_outcomes_import_fingerprint_unique;

-- Add a full unique constraint that Supabase upsert ON CONFLICT can target
ALTER TABLE tav.purchase_outcomes
  ADD CONSTRAINT purchase_outcomes_import_fingerprint_key
  UNIQUE (import_fingerprint);
