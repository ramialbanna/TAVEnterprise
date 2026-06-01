-- Migration 0052 — Reconcile tav.purchase_outcomes with production
--
-- Production received these columns during the Phase 0 historical outcome
-- backfill (2026-05-22). This migration brings committed schema/migrations in
-- line with prod so fresh environments and CI match the 57,228-row dataset.
--
-- Idempotent: safe to apply on prod (columns + constraints already present).

ALTER TABLE tav.purchase_outcomes
  ADD COLUMN IF NOT EXISTS trim              text,
  ADD COLUMN IF NOT EXISTS sale_date         date,
  ADD COLUMN IF NOT EXISTS cycle_seq         smallint,
  ADD COLUMN IF NOT EXISTS net_gross         integer,
  ADD COLUMN IF NOT EXISTS recon_cost        integer,
  ADD COLUMN IF NOT EXISTS expense_total     integer,
  ADD COLUMN IF NOT EXISTS mmr_source        text,
  ADD COLUMN IF NOT EXISTS mmr_method        text,
  ADD COLUMN IF NOT EXISTS mmr_lookup_date   date,
  ADD COLUMN IF NOT EXISTS mmr_snapshot_id   uuid;

-- expense_total is intentionally unchecked: iDMS net expense can be signed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_outcomes_cycle_seq_chk'
  ) THEN
    ALTER TABLE tav.purchase_outcomes
      ADD CONSTRAINT purchase_outcomes_cycle_seq_chk
      CHECK (cycle_seq IS NULL OR cycle_seq >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_outcomes_recon_cost_chk'
  ) THEN
    ALTER TABLE tav.purchase_outcomes
      ADD CONSTRAINT purchase_outcomes_recon_cost_chk
      CHECK (recon_cost IS NULL OR recon_cost >= 0);
  END IF;
END $$;
