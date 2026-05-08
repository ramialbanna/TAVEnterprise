-- =============================================================================
-- Migration 0027 — Add tav.mmr_queries
--
-- Audit log of every Manheim MMR lookup made via the intelligence Worker.
-- One row per request. Joins to user identity (Cloudflare Access) so the
-- portal can answer "who already looked this VIN up today?" and surface
-- duplicate-effort warnings.
--
-- Append-only: rows are never updated. cache_hit is recorded so analytics
-- can compute hit-rate over time. error_code / error_message capture
-- failures (Manheim 5xx, missing creds, inferred-mileage edge cases).
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.mmr_queries (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vin                     text,
  year                    smallint,
  make                    text,
  model                   text,
  trim                    text,
  mileage_used            integer,
  is_inferred_mileage     boolean     NOT NULL DEFAULT false,
  lookup_type             text        NOT NULL
    CHECK (lookup_type IN ('vin','year_make_model')),
  requested_by_user_id    text,
  requested_by_name       text,
  requested_by_email      text,
  source                  text        NOT NULL
    CHECK (source IN ('manheim','cache','manual')),
  cache_hit               boolean     NOT NULL,
  force_refresh           boolean     NOT NULL DEFAULT false,
  mmr_value               numeric(10,2),
  mmr_payload             jsonb,
  error_code              text,
  error_message           text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- VIN lookup ("who else queried this VIN?")
CREATE INDEX IF NOT EXISTS mmr_queries_vin_idx
  ON tav.mmr_queries (vin)
  WHERE vin IS NOT NULL;

-- YMM lookup (partial — only when all three are present, the typical
-- year_make_model lookup_type case)
CREATE INDEX IF NOT EXISTS mmr_queries_ymm_idx
  ON tav.mmr_queries (year, make, model)
  WHERE year IS NOT NULL AND make IS NOT NULL AND model IS NOT NULL;

-- Per-user activity timelines
CREATE INDEX IF NOT EXISTS mmr_queries_requested_by_user_id_idx
  ON tav.mmr_queries (requested_by_user_id);

-- Global activity feed
CREATE INDEX IF NOT EXISTS mmr_queries_created_at_idx
  ON tav.mmr_queries (created_at DESC);
