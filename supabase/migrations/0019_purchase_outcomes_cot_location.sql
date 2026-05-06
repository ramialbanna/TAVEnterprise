-- =============================================================================
-- Migration 0019 — Add cot_city / cot_state to tav.purchase_outcomes
--
-- Preserves the raw city and state from the source spreadsheet ("COT City" /
-- "COT State"). The region column stores a bucketed key (e.g. 'dallas_tx')
-- used by the scoring layer; cot_city + cot_state are the underlying source
-- data needed for future region expansion and city-level analytics.
-- =============================================================================

ALTER TABLE tav.purchase_outcomes
  ADD COLUMN IF NOT EXISTS cot_city  text,
  ADD COLUMN IF NOT EXISTS cot_state text;
