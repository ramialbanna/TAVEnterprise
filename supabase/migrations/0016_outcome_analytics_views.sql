-- =============================================================================
-- Migration 0016 — Add outcome analytics views
--
-- v_outcome_summary: region-level KPIs (gross profit, hold days, sell-through)
--   consumed by the operations dashboard and alerting jobs.
--
-- v_segment_profit: YMM + mileage-bucket profit margins for buy-box tuning.
--   The mileage_bucket groups by 10k-mile bands so sparse segments
--   (e.g. 87,432 mi) aggregate into a usable sample size.
--
-- Both views filter or guard against NULL / zero denominators explicitly so
-- ROUND() never receives NaN and AVG over an empty set returns NULL cleanly.
-- =============================================================================

CREATE OR REPLACE VIEW tav.v_outcome_summary AS
SELECT
  region,
  COUNT(*)                                                    AS total_outcomes,
  ROUND(AVG(gross_profit)::numeric, 2)                        AS avg_gross_profit,
  ROUND(AVG(hold_days)::numeric, 2)                           AS avg_hold_days,
  ROUND(
    COUNT(*) FILTER (WHERE sale_price IS NOT NULL)::numeric /
    NULLIF(COUNT(*), 0),
    4
  )                                                           AS sell_through_rate,
  MAX(created_at)                                             AS last_outcome_at
FROM tav.purchase_outcomes
GROUP BY region;

CREATE OR REPLACE VIEW tav.v_segment_profit AS
SELECT
  year,
  make,
  model,
  FLOOR(mileage / 10000) * 10000                              AS mileage_bucket,
  COUNT(*)                                                    AS outcome_count,
  ROUND(AVG(gross_profit)::numeric, 2)                        AS avg_gross_profit,
  ROUND(
    AVG(
      CASE WHEN gross_profit > 0
           THEN gross_profit::numeric / NULLIF(price_paid, 0)
      END
    ) * 100,
    2
  )                                                           AS avg_gross_margin_pct
FROM tav.purchase_outcomes
WHERE gross_profit IS NOT NULL
  AND price_paid   IS NOT NULL
  AND price_paid   > 0
GROUP BY year, make, model, FLOOR(mileage / 10000) * 10000;
