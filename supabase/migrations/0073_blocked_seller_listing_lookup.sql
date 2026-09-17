-- =============================================================================
-- Migration 0073 — Fast blocked-seller listing lookup
--
-- GET /app/blocked-sellers was 400 then upstream_unavailable: PostgREST GET
-- `.in(seller_url)` over hundreds of profile URLs blew the URL cap, then
-- chunked sequential scans of tav.normalized_listings (no seller_url index)
-- exceeded the 12s Next proxy timeout.
-- =============================================================================

CREATE INDEX IF NOT EXISTS normalized_listings_facebook_seller_url_idx
  ON tav.normalized_listings (seller_url)
  WHERE source = 'facebook' AND seller_url IS NOT NULL;

CREATE OR REPLACE FUNCTION tav.listings_for_seller_urls(p_urls text[])
RETURNS TABLE (
  id uuid,
  title text,
  listing_url text,
  price integer,
  year smallint,
  make text,
  model text,
  seller_url text,
  seller_name text,
  first_seen_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    nl.id,
    nl.title,
    nl.listing_url,
    nl.price,
    nl.year,
    nl.make,
    nl.model,
    nl.seller_url,
    nl.seller_name,
    nl.first_seen_at
  FROM tav.normalized_listings nl
  WHERE nl.source = 'facebook'
    AND p_urls IS NOT NULL
    AND cardinality(p_urls) > 0
    AND nl.seller_url = ANY (p_urls);
$$;

CREATE OR REPLACE FUNCTION tav.lead_ids_for_listings(p_ids uuid[])
RETURNS TABLE (normalized_listing_id uuid)
LANGUAGE sql
STABLE
AS $$
  SELECT l.normalized_listing_id
  FROM tav.leads l
  WHERE p_ids IS NOT NULL
    AND cardinality(p_ids) > 0
    AND l.normalized_listing_id = ANY (p_ids);
$$;

GRANT EXECUTE ON FUNCTION tav.listings_for_seller_urls(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION tav.lead_ids_for_listings(uuid[]) TO service_role;
