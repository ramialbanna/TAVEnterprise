-- =============================================================================
-- Migration 0045 — purchase_outcomes: MaxBuy Phase 0 backfill columns
--
-- The MaxBuy Phase 0 historical-outcome backfill (57,228 reconstructed sale
-- rows) carries ten fields that tav.purchase_outcomes does not yet have a
-- column for. This migration adds them so the staging load + merge
-- (20-backfill-load-sql-package.md §3-§4) can land without column errors.
--
-- Source of truth: docs/07-buybox/audits/reports/20-backfill-load-sql-package.md
-- §2 (Additive migration plan). This migration creates exactly the §2 schema.
--
-- Additive only. All ten columns are nullable adds (metadata-only, no table
-- rewrite). The three CHECK constraints validate the new nullable columns. The
-- unique index backs the §4 ON CONFLICT (import_fingerprint) upsert key.
--
-- tav.purchase_outcomes is empty at apply time (the 12,904 legacy rows were
-- archived + deleted per 20-legacy-purchase-outcomes-replacement-plan.md §10),
-- so every statement here is instant and the fingerprint duplicate pre-check
-- (§2) is trivially satisfied.
--
-- Idempotent: ADD COLUMN / CREATE INDEX use IF [NOT] EXISTS; the CHECK
-- constraints use DROP IF EXISTS + ADD (0044 house style).
--
-- This migration does NOT load or merge the backfill — that is a separate,
-- gated step (20-backfill-load-sql-package.md §3 onward).
-- =============================================================================

ALTER TABLE tav.purchase_outcomes
  ADD COLUMN IF NOT EXISTS trim             text,
  ADD COLUMN IF NOT EXISTS sale_date        date,
  ADD COLUMN IF NOT EXISTS cycle_seq        smallint,
  ADD COLUMN IF NOT EXISTS net_gross        integer,
  ADD COLUMN IF NOT EXISTS recon_cost       integer,
  ADD COLUMN IF NOT EXISTS expense_total    integer,
  ADD COLUMN IF NOT EXISTS mmr_source       text,
  ADD COLUMN IF NOT EXISTS mmr_method       text,
  ADD COLUMN IF NOT EXISTS mmr_lookup_date  date,
  ADD COLUMN IF NOT EXISTS mmr_snapshot_id  uuid;

ALTER TABLE tav.purchase_outcomes
  DROP CONSTRAINT IF EXISTS purchase_outcomes_cycle_seq_chk,
  DROP CONSTRAINT IF EXISTS purchase_outcomes_recon_cost_chk,
  DROP CONSTRAINT IF EXISTS purchase_outcomes_expense_total_chk;

ALTER TABLE tav.purchase_outcomes
  ADD CONSTRAINT purchase_outcomes_cycle_seq_chk
    CHECK (cycle_seq IS NULL OR cycle_seq >= 1),
  ADD CONSTRAINT purchase_outcomes_recon_cost_chk
    CHECK (recon_cost IS NULL OR recon_cost >= 0),
  ADD CONSTRAINT purchase_outcomes_expense_total_chk
    CHECK (expense_total IS NULL OR expense_total >= 0);

-- Unique index for the §4 ON CONFLICT (import_fingerprint) upsert key. A unique
-- constraint of this exact name already exists on tav.purchase_outcomes
-- (verified 2026-05-22 — pg_constraint contype 'u'), contrary to the §2
-- assumption that no index existed. This IF NOT EXISTS statement is therefore
-- a no-op on the live DB; it is kept so the migration stays self-contained on
-- a fresh replay. NULL fingerprints remain allowed and are treated as distinct
-- by Postgres.
CREATE UNIQUE INDEX IF NOT EXISTS purchase_outcomes_import_fingerprint_key
  ON tav.purchase_outcomes (import_fingerprint);
