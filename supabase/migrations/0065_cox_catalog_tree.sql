-- =============================================================================
-- Migration 0065 — Cox catalog tree + match suggestions + style aliases (item 55 Phase C-b)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE tav.cox_catalog_tree (
  year          smallint NOT NULL,
  make          text     NOT NULL,
  model         text     NOT NULL,
  style         text     NOT NULL,
  search_text   text     NOT NULL,
  variant_kind  text     NULL
    CHECK (variant_kind IS NULL OR variant_kind IN ('drivetrain', 'cab_bed', 'powertrain', 'base')),
  synced_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (year, make, model, style)
);

CREATE INDEX cox_catalog_tree_year_make_idx ON tav.cox_catalog_tree (year, make);
CREATE INDEX cox_catalog_tree_search_gin ON tav.cox_catalog_tree USING gin (search_text gin_trgm_ops);

CREATE TABLE tav.cox_catalog_sync_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  status        text NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  years_synced  smallint[] NOT NULL DEFAULT '{}',
  row_count     integer,
  error_message text
);

CREATE TABLE tav.catalog_match_suggestions (
  normalized_listing_id uuid PRIMARY KEY REFERENCES tav.normalized_listings (id) ON DELETE CASCADE,
  suggestions           jsonb NOT NULL,
  best_score            smallint,
  computed_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tav.mmr_style_aliases (
  alias           text NOT NULL,
  canonical_make  text NOT NULL,
  canonical_model text NOT NULL,
  canonical_style text NOT NULL,
  source          text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ingest_learned')),
  PRIMARY KEY (alias, canonical_make, canonical_model)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON tav.cox_catalog_tree TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON tav.cox_catalog_sync_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON tav.catalog_match_suggestions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON tav.mmr_style_aliases TO service_role;
