-- =============================================================================
-- Migration 0081 — Reuse a paid Y/M/M/S decision, and remember a seller call.
--
-- Ingest was asking Claude again for the same listing every few minutes.
-- latest_paid_llm_ymms_decisions returns one row per listing so the worker
-- can skip that call. seller_classify_cache stores the dealer-photo result
-- by listing URL, including cars that are rejected before a listing row exists.
--
-- Service role only. No anon policies. Do not FORCE RLS.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS tav.latest_paid_llm_ymms_decisions(uuid[]);
--   DROP INDEX IF EXISTS tav.llm_ymms_decisions_listing_created_idx;
--   DROP TABLE IF EXISTS tav.seller_classify_cache;
-- =============================================================================

CREATE INDEX IF NOT EXISTS llm_ymms_decisions_listing_created_idx
  ON tav.llm_ymms_decisions (normalized_listing_id, created_at DESC)
  WHERE outcome IN ('llm_hit', 'llm_needs_review', 'llm_invalid_pick');

CREATE OR REPLACE FUNCTION tav.latest_paid_llm_ymms_decisions(p_ids uuid[])
RETURNS TABLE (
  normalized_listing_id uuid,
  outcome text,
  proposed_make text,
  proposed_model text,
  proposed_style text,
  confidence numeric,
  reasoning text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT DISTINCT ON (d.normalized_listing_id)
    d.normalized_listing_id,
    d.outcome,
    d.proposed_make,
    d.proposed_model,
    d.proposed_style,
    d.confidence,
    d.reasoning,
    d.created_at
  FROM tav.llm_ymms_decisions d
  WHERE d.normalized_listing_id = ANY(p_ids)
    AND d.outcome IN ('llm_hit', 'llm_needs_review', 'llm_invalid_pick')
  ORDER BY d.normalized_listing_id, d.created_at DESC;
$$;

REVOKE ALL ON FUNCTION tav.latest_paid_llm_ymms_decisions(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tav.latest_paid_llm_ymms_decisions(uuid[]) TO service_role;

CREATE TABLE IF NOT EXISTS tav.seller_classify_cache (
  source        text        NOT NULL,
  listing_url   text        NOT NULL,
  seller_type   text        NOT NULL,
  confidence    numeric     NOT NULL,
  signals       text[]      NOT NULL DEFAULT '{}',
  reasoning     text,
  classified_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_classify_cache_pkey PRIMARY KEY (source, listing_url),
  CONSTRAINT seller_classify_cache_source_check CHECK (source IN (
    'facebook', 'craigslist', 'autotrader', 'cars_com', 'offerup'
  )),
  CONSTRAINT seller_classify_cache_type_check CHECK (seller_type IN (
    'dealer', 'private_party', 'curbstoner_suspected', 'unknown'
  )),
  CONSTRAINT seller_classify_cache_confidence_check CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT seller_classify_cache_url_check CHECK (char_length(listing_url) > 0)
);

ALTER TABLE tav.seller_classify_cache ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON tav.seller_classify_cache FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON tav.seller_classify_cache TO service_role;
