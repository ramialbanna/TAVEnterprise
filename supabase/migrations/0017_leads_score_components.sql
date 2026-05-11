-- =============================================================================
-- Migration 0017 — Add score_components jsonb to tav.leads
--
-- The five scalar score columns (deal_score, buy_box_score, freshness_score,
-- region_score, source_confidence_score) exist but the raw sub-component
-- breakdown is lost after scoring. score_components stores the full input
-- object so the dashboard can show "why this score" without joining to
-- buy_box_score_attributions for every inbox row.
-- =============================================================================

ALTER TABLE tav.leads
  ADD COLUMN IF NOT EXISTS score_components jsonb;
