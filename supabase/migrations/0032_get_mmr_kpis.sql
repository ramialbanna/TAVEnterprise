-- =============================================================================
-- Migration 0032 — Add tav.get_mmr_kpis analytics function
--
-- Computes KPI aggregates from tav.mmr_queries for the intelligence portal.
-- Called via Supabase RPC (Content-Profile: tav) from the intelligence Worker.
--
-- Returns a single jsonb object so the Worker can return it directly without
-- marshalling a multi-column RECORD. All numeric results are rounded to 2dp.
-- p95 uses percentile_cont which requires a full scan of the filtered window —
-- acceptable for ops dashboards where the window is bounded (default 7 days).
-- =============================================================================

CREATE OR REPLACE FUNCTION tav.get_mmr_kpis(
  p_from        timestamptz DEFAULT now() - interval '7 days',
  p_to          timestamptz DEFAULT now(),
  p_email       text        DEFAULT NULL,
  p_lookup_type text        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH filtered AS (
    SELECT
      outcome,
      cache_hit,
      latency_ms,
      lookup_type,
      requested_by_email,
      error_code
    FROM tav.mmr_queries
    WHERE created_at  >= p_from
      AND created_at  <  p_to
      AND (p_email       IS NULL OR requested_by_email = p_email)
      AND (p_lookup_type IS NULL OR lookup_type        = p_lookup_type)
  ),
  totals AS (
    SELECT
      count(*)                                                           AS total_lookups,
      count(*) FILTER (WHERE outcome = 'hit')                           AS successful_lookups,
      count(*) FILTER (WHERE outcome IN ('miss', 'error'))              AS failed_lookups,
      round(
        100.0 * count(*) FILTER (WHERE cache_hit) / NULLIF(count(*), 0),
        2
      )                                                                  AS cache_hit_rate,
      round(avg(latency_ms)::numeric, 2)                                AS avg_latency_ms,
      round(
        (percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::numeric,
        2
      )                                                                  AS p95_latency_ms,
      count(*) FILTER (WHERE outcome = 'error')                         AS recent_error_count
    FROM filtered
  ),
  by_type AS (
    SELECT COALESCE(jsonb_object_agg(lookup_type, cnt), '{}'::jsonb) AS result
    FROM (
      SELECT lookup_type, count(*) AS cnt
      FROM filtered
      GROUP BY lookup_type
    ) t
  ),
  by_outcome AS (
    SELECT COALESCE(jsonb_object_agg(outcome, cnt), '{}'::jsonb) AS result
    FROM (
      SELECT outcome, count(*) AS cnt
      FROM filtered
      GROUP BY outcome
    ) t
  ),
  top_req AS (
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object('email', requested_by_email, 'count', cnt)),
      '[]'::jsonb
    ) AS result
    FROM (
      SELECT requested_by_email, count(*) AS cnt
      FROM filtered
      WHERE requested_by_email IS NOT NULL
      GROUP BY requested_by_email
      ORDER BY cnt DESC
      LIMIT 5
    ) r
  )
  SELECT jsonb_build_object(
    'total_lookups',      t.total_lookups,
    'successful_lookups', t.successful_lookups,
    'failed_lookups',     t.failed_lookups,
    'cache_hit_rate',     t.cache_hit_rate,
    'avg_latency_ms',     t.avg_latency_ms,
    'p95_latency_ms',     t.p95_latency_ms,
    'lookups_by_type',    bt.result,
    'lookups_by_outcome', bo.result,
    'top_requesters',     tr.result,
    'recent_error_count', t.recent_error_count
  )
  FROM totals t, by_type bt, by_outcome bo, top_req tr;
$$;

-- Grant EXECUTE to service_role so the intelligence Worker can call this
-- via Supabase RPC. ALTER DEFAULT PRIVILEGES in 0002 covers tables only —
-- functions require an explicit grant.
GRANT EXECUTE ON FUNCTION tav.get_mmr_kpis(
  timestamptz, timestamptz, text, text
) TO service_role;
