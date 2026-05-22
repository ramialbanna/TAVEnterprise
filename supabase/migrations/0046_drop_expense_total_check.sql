-- =============================================================================
-- Migration 0046 — purchase_outcomes: drop the expense_total >= 0 CHECK
--
-- Migration 0045 added purchase_outcomes_expense_total_chk
-- (expense_total IS NULL OR expense_total >= 0). The MaxBuy Phase 0 backfill
-- export (buybox_master.csv) shows expense_total is a SIGNED net expense /
-- adjustment field, not a pure cost: 67 of the 57,228 staged rows are negative
-- (min -10,170, max 21,300). The >= 0 check is therefore wrong for this field
-- and aborts the Phase 0 merge.
--
-- This migration drops only that constraint. The two sibling checks added by
-- 0045 stay — they remain correct:
--   purchase_outcomes_cycle_seq_chk   — cycle_seq is a genuine >= 1 sequence
--                                       (0 violations in the staged backfill).
--   purchase_outcomes_recon_cost_chk  — recon_cost is a true non-negative cost
--                                       field. This backfill does not populate
--                                       it (no recon_cost column in the
--                                       export); NULL passes, so the check
--                                       stays valid for future use.
--
-- Relaxing only — drops one constraint, no column or data change.
-- Idempotent: DROP CONSTRAINT IF EXISTS.
-- =============================================================================

ALTER TABLE tav.purchase_outcomes
  DROP CONSTRAINT IF EXISTS purchase_outcomes_expense_total_chk;
