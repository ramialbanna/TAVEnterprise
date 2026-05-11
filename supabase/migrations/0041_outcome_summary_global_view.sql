-- =============================================================================
-- Migration 0041 — Add tav.v_outcome_summary_global
--
-- v_outcome_summary (0016) is a per-region rollup. GET /app/kpis needs a
-- *global* rollup, and averaging the per-region averages would be wrong
-- (unweighted mean of means). This view computes the aggregates directly over
-- all of tav.purchase_outcomes — no GROUP BY — so it always returns exactly
-- one row (COUNT(*) = 0 with NULL averages on an empty table).
--
-- Column formulas mirror v_outcome_summary exactly (sans `region`) so the two
-- views never disagree on semantics; in particular sell_through_rate keeps the
-- same `sale_price IS NOT NULL` numerator.
-- =============================================================================

CREATE OR REPLACE VIEW tav.v_outcome_summary_global AS
SELECT
  COUNT(*)                                                    AS total_outcomes,
  ROUND(AVG(gross_profit)::numeric, 2)                        AS avg_gross_profit,
  ROUND(AVG(hold_days)::numeric, 2)                           AS avg_hold_days,
  ROUND(
    COUNT(*) FILTER (WHERE sale_price IS NOT NULL)::numeric /
    NULLIF(COUNT(*), 0),
    4
  )                                                           AS sell_through_rate,
  MAX(created_at)                                             AS last_outcome_at
FROM tav.purchase_outcomes;
