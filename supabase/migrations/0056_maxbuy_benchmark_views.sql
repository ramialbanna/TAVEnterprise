-- Migration 0056 — MaxBuy benchmark materialized views (180d decay, Phase 1 λ)
--
-- Refresh after purchase_outcomes loads:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY tav.mv_maxbuy_pricing_benchmarks;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY tav.mv_maxbuy_transport_benchmarks;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY tav.mv_maxbuy_expense_benchmarks;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY tav.mv_maxbuy_net_benchmarks;

CREATE OR REPLACE FUNCTION tav.maxbuy_mileage_band(mileage int)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN mileage IS NULL  THEN 'unknown'
    WHEN mileage < 30000  THEN '0-30k'
    WHEN mileage < 60000  THEN '30-60k'
    WHEN mileage < 90000  THEN '60-90k'
    WHEN mileage < 120000 THEN '90-120k'
    WHEN mileage < 150000 THEN '120-150k'
    ELSE '150k+'
  END
$$;

CREATE OR REPLACE FUNCTION tav.maxbuy_decay_weight(
  sale_date date,
  half_life_days numeric DEFAULT 180
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN sale_date IS NULL THEN 0::numeric
    WHEN (current_date - sale_date) < 0 THEN 0::numeric
    ELSE power(0.5, (current_date - sale_date)::numeric / half_life_days)
  END
$$;

CREATE OR REPLACE FUNCTION tav.maxbuy_benchmark_version_label(half_life_days int DEFAULT 180)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT 'bm-' || to_char(current_date, 'IYYY') || 'w'
    || lpad(to_char(current_date, 'IW'), 2, '0') || '-' || half_life_days || 'd'
$$;

-- ── Pricing: sale_pct_mmr + weighted sale price by segment resolution ───────

CREATE MATERIALIZED VIEW tav.mv_maxbuy_pricing_benchmarks AS
WITH weighted AS (
  SELECT
    year,
    lower(make) AS make,
    lower(model) AS model,
    lower(coalesce(nullif(trim, ''), 'base')) AS trim,
    coalesce(region, 'unknown') AS region,
    tav.maxbuy_mileage_band(mileage) AS mileage_band,
    sale_price::numeric AS sale_price,
    mmr_value_at_purchase::numeric AS mmr_value,
    CASE
      WHEN mmr_value_at_purchase IS NOT NULL AND mmr_value_at_purchase > 0
        THEN sale_price::numeric / mmr_value_at_purchase::numeric
    END AS sale_pct_mmr,
    tav.maxbuy_decay_weight(sale_date, 180) AS w
  FROM tav.purchase_outcomes
  WHERE sale_date IS NOT NULL
    AND sale_price IS NOT NULL
    AND year IS NOT NULL
    AND make IS NOT NULL
    AND model IS NOT NULL
),
exact AS (
  SELECT
    'exact'::text AS resolution,
    year,
    make,
    model,
    trim,
    region,
    mileage_band,
    sum(w) AS effective_n,
    count(*) AS raw_n,
    sum(w * sale_price) / nullif(sum(w), 0) AS weighted_sale_price,
    sum(w * sale_pct_mmr) FILTER (WHERE sale_pct_mmr IS NOT NULL)
      / nullif(sum(w) FILTER (WHERE sale_pct_mmr IS NOT NULL), 0) AS weighted_sale_pct_mmr
  FROM weighted
  GROUP BY year, make, model, trim, region, mileage_band
),
ymm AS (
  SELECT
    'ymm'::text AS resolution,
    year,
    make,
    model,
    NULL::text AS trim,
    region,
    NULL::text AS mileage_band,
    sum(w) AS effective_n,
    count(*) AS raw_n,
    sum(w * sale_price) / nullif(sum(w), 0) AS weighted_sale_price,
    sum(w * sale_pct_mmr) FILTER (WHERE sale_pct_mmr IS NOT NULL)
      / nullif(sum(w) FILTER (WHERE sale_pct_mmr IS NOT NULL), 0) AS weighted_sale_pct_mmr
  FROM weighted
  GROUP BY year, make, model, region
),
mm AS (
  SELECT
    'mm'::text AS resolution,
    NULL::smallint AS year,
    make,
    model,
    NULL::text AS trim,
    NULL::text AS region,
    NULL::text AS mileage_band,
    sum(w) AS effective_n,
    count(*) AS raw_n,
    sum(w * sale_price) / nullif(sum(w), 0) AS weighted_sale_price,
    sum(w * sale_pct_mmr) FILTER (WHERE sale_pct_mmr IS NOT NULL)
      / nullif(sum(w) FILTER (WHERE sale_pct_mmr IS NOT NULL), 0) AS weighted_sale_pct_mmr
  FROM weighted
  GROUP BY make, model
),
global AS (
  SELECT
    'global'::text AS resolution,
    NULL::smallint AS year,
    NULL::text AS make,
    NULL::text AS model,
    NULL::text AS trim,
    NULL::text AS region,
    NULL::text AS mileage_band,
    sum(w) AS effective_n,
    count(*) AS raw_n,
    sum(w * sale_price) / nullif(sum(w), 0) AS weighted_sale_price,
    sum(w * sale_pct_mmr) FILTER (WHERE sale_pct_mmr IS NOT NULL)
      / nullif(sum(w) FILTER (WHERE sale_pct_mmr IS NOT NULL), 0) AS weighted_sale_pct_mmr
  FROM weighted
)
SELECT
  resolution,
  year,
  make,
  model,
  trim,
  region,
  mileage_band,
  effective_n,
  raw_n,
  round(weighted_sale_price, 2) AS weighted_sale_price,
  round(weighted_sale_pct_mmr, 6) AS weighted_sale_pct_mmr,
  tav.maxbuy_benchmark_version_label(180) AS benchmark_version
FROM (
  SELECT * FROM exact
  UNION ALL SELECT * FROM ymm
  UNION ALL SELECT * FROM mm
  UNION ALL SELECT * FROM global
) combined;

CREATE UNIQUE INDEX mv_maxbuy_pricing_benchmarks_key
  ON tav.mv_maxbuy_pricing_benchmarks (
    resolution,
    coalesce(year::text, ''),
    coalesce(make, ''),
    coalesce(model, ''),
    coalesce(trim, ''),
    coalesce(region, ''),
    coalesce(mileage_band, '')
  );

CREATE VIEW tav.v_maxbuy_pricing_benchmarks AS
SELECT * FROM tav.mv_maxbuy_pricing_benchmarks;

-- ── Transport: city → region → global ladder ────────────────────────────────

CREATE MATERIALIZED VIEW tav.mv_maxbuy_transport_benchmarks AS
WITH weighted AS (
  SELECT
    coalesce(cot_city, 'unknown') AS cot_city,
    coalesce(cot_state, 'unknown') AS cot_state,
    coalesce(region, 'unknown') AS region,
    coalesce(transport_cost, 0)::numeric AS transport_cost,
    tav.maxbuy_decay_weight(sale_date, 180) AS w
  FROM tav.purchase_outcomes
  WHERE sale_date IS NOT NULL
),
city AS (
  SELECT
    'city'::text AS resolution,
    cot_city,
    cot_state,
    NULL::text AS region,
    sum(w) AS effective_n,
    count(*) AS raw_n,
    sum(w * transport_cost) / nullif(sum(w), 0) AS weighted_transport_cost
  FROM weighted
  WHERE cot_city <> 'unknown'
  GROUP BY cot_city, cot_state
),
region_level AS (
  SELECT
    'region'::text AS resolution,
    NULL::text AS cot_city,
    NULL::text AS cot_state,
    region,
    sum(w) AS effective_n,
    count(*) AS raw_n,
    sum(w * transport_cost) / nullif(sum(w), 0) AS weighted_transport_cost
  FROM weighted
  GROUP BY region
),
global AS (
  SELECT
    'global'::text AS resolution,
    NULL::text AS cot_city,
    NULL::text AS cot_state,
    NULL::text AS region,
    sum(w) AS effective_n,
    count(*) AS raw_n,
    sum(w * transport_cost) / nullif(sum(w), 0) AS weighted_transport_cost
  FROM weighted
)
SELECT
  resolution,
  cot_city,
  cot_state,
  region,
  effective_n,
  raw_n,
  round(weighted_transport_cost, 2) AS weighted_transport_cost,
  tav.maxbuy_benchmark_version_label(180) AS benchmark_version
FROM (
  SELECT * FROM city
  UNION ALL SELECT * FROM region_level
  UNION ALL SELECT * FROM global
) combined;

CREATE UNIQUE INDEX mv_maxbuy_transport_benchmarks_key
  ON tav.mv_maxbuy_transport_benchmarks (
    resolution,
    coalesce(cot_city, ''),
    coalesce(cot_state, ''),
    coalesce(region, '')
  );

CREATE VIEW tav.v_maxbuy_transport_benchmarks AS
SELECT * FROM tav.mv_maxbuy_transport_benchmarks;

-- ── Expenses: segment + global (misc_overhead + auction_fee + expense_total) ──

CREATE MATERIALIZED VIEW tav.mv_maxbuy_expense_benchmarks AS
WITH weighted AS (
  SELECT
    year,
    lower(make) AS make,
    lower(model) AS model,
    lower(coalesce(nullif(trim, ''), 'base')) AS trim,
    coalesce(region, 'unknown') AS region,
    tav.maxbuy_mileage_band(mileage) AS mileage_band,
    (
      coalesce(misc_overhead, 0)
      + coalesce(auction_fee, 0)
      + coalesce(expense_total, 0)
    )::numeric AS expense_total,
    tav.maxbuy_decay_weight(sale_date, 180) AS w
  FROM tav.purchase_outcomes
  WHERE sale_date IS NOT NULL
    AND year IS NOT NULL
    AND make IS NOT NULL
    AND model IS NOT NULL
),
exact AS (
  SELECT
    'exact'::text AS resolution,
    year,
    make,
    model,
    trim,
    region,
    mileage_band,
    sum(w) AS effective_n,
    count(*) AS raw_n,
    sum(w * expense_total) / nullif(sum(w), 0) AS weighted_expense_total
  FROM weighted
  GROUP BY year, make, model, trim, region, mileage_band
),
ymm AS (
  SELECT
    'ymm'::text AS resolution,
    year,
    make,
    model,
    NULL::text AS trim,
    region,
    NULL::text AS mileage_band,
    sum(w) AS effective_n,
    count(*) AS raw_n,
    sum(w * expense_total) / nullif(sum(w), 0) AS weighted_expense_total
  FROM weighted
  GROUP BY year, make, model, region
),
global AS (
  SELECT
    'global'::text AS resolution,
    NULL::smallint AS year,
    NULL::text AS make,
    NULL::text AS model,
    NULL::text AS trim,
    NULL::text AS region,
    NULL::text AS mileage_band,
    sum(w) AS effective_n,
    count(*) AS raw_n,
    sum(w * expense_total) / nullif(sum(w), 0) AS weighted_expense_total
  FROM weighted
)
SELECT
  resolution,
  year,
  make,
  model,
  trim,
  region,
  mileage_band,
  effective_n,
  raw_n,
  round(weighted_expense_total, 2) AS weighted_expense_total,
  tav.maxbuy_benchmark_version_label(180) AS benchmark_version
FROM (
  SELECT * FROM exact
  UNION ALL SELECT * FROM ymm
  UNION ALL SELECT * FROM global
) combined;

CREATE UNIQUE INDEX mv_maxbuy_expense_benchmarks_key
  ON tav.mv_maxbuy_expense_benchmarks (
    resolution,
    coalesce(year::text, ''),
    coalesce(make, ''),
    coalesce(model, ''),
    coalesce(trim, ''),
    coalesce(region, ''),
    coalesce(mileage_band, '')
  );

CREATE VIEW tav.v_maxbuy_expense_benchmarks AS
SELECT * FROM tav.mv_maxbuy_expense_benchmarks;

-- ── Net gross benchmarks ──────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW tav.mv_maxbuy_net_benchmarks AS
WITH weighted AS (
  SELECT
    year,
    lower(make) AS make,
    lower(model) AS model,
    lower(coalesce(nullif(trim, ''), 'base')) AS trim,
    coalesce(region, 'unknown') AS region,
    tav.maxbuy_mileage_band(mileage) AS mileage_band,
    coalesce(net_gross, gross_profit, 0)::numeric AS net_gross,
    tav.maxbuy_decay_weight(sale_date, 180) AS w
  FROM tav.purchase_outcomes
  WHERE sale_date IS NOT NULL
    AND year IS NOT NULL
    AND make IS NOT NULL
    AND model IS NOT NULL
),
exact AS (
  SELECT
    'exact'::text AS resolution,
    year,
    make,
    model,
    trim,
    region,
    mileage_band,
    sum(w) AS effective_n,
    count(*) AS raw_n,
    sum(w * net_gross) / nullif(sum(w), 0) AS weighted_net_gross
  FROM weighted
  GROUP BY year, make, model, trim, region, mileage_band
),
ymm AS (
  SELECT
    'ymm'::text AS resolution,
    year,
    make,
    model,
    NULL::text AS trim,
    region,
    NULL::text AS mileage_band,
    sum(w) AS effective_n,
    count(*) AS raw_n,
    sum(w * net_gross) / nullif(sum(w), 0) AS weighted_net_gross
  FROM weighted
  GROUP BY year, make, model, region
),
global AS (
  SELECT
    'global'::text AS resolution,
    NULL::smallint AS year,
    NULL::text AS make,
    NULL::text AS model,
    NULL::text AS trim,
    NULL::text AS region,
    NULL::text AS mileage_band,
    sum(w) AS effective_n,
    count(*) AS raw_n,
    sum(w * net_gross) / nullif(sum(w), 0) AS weighted_net_gross
  FROM weighted
)
SELECT
  resolution,
  year,
  make,
  model,
  trim,
  region,
  mileage_band,
  effective_n,
  raw_n,
  round(weighted_net_gross, 2) AS weighted_net_gross,
  tav.maxbuy_benchmark_version_label(180) AS benchmark_version
FROM (
  SELECT * FROM exact
  UNION ALL SELECT * FROM ymm
  UNION ALL SELECT * FROM global
) combined;

CREATE UNIQUE INDEX mv_maxbuy_net_benchmarks_key
  ON tav.mv_maxbuy_net_benchmarks (
    resolution,
    coalesce(year::text, ''),
    coalesce(make, ''),
    coalesce(model, ''),
    coalesce(trim, ''),
    coalesce(region, ''),
    coalesce(mileage_band, '')
  );

CREATE VIEW tav.v_maxbuy_net_benchmarks AS
SELECT * FROM tav.mv_maxbuy_net_benchmarks;

-- Market index deferred until Manheim Index feed is wired (IMPLEMENTATION-PLAN §4.5).
