-- =============================================================================
-- Migration 0071 — proven-bookable Cox combinations (item 72 action 2)
--
-- Stronger than cox_catalog_tree: a tree row means Cox lists the style, a row
-- here means Cox actually returned money. Ingest constrains last-resort and
-- listing-text picks to this set before calling Manheim, so listing garbage
-- (`x5 / Performance`, `🩷 gmc`) never reaches the vendor.
--
-- Grows on every successful valuation_snapshots write. Seeded from existing
-- hits so the gate is useful on the first deploy.
-- =============================================================================

CREATE TABLE tav.cox_proven_bookable (
  year           smallint    NOT NULL,
  make           text        NOT NULL,
  model          text        NOT NULL,
  style          text        NOT NULL,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (year, make, model, style)
);

CREATE INDEX cox_proven_bookable_year_make_idx
  ON tav.cox_proven_bookable (year, make);

GRANT SELECT, INSERT, UPDATE, DELETE ON tav.cox_proven_bookable TO service_role;

INSERT INTO tav.cox_proven_bookable (year, make, model, style, first_seen_at)
SELECT
  year,
  lookup_make,
  lookup_model,
  lookup_trim,
  min(fetched_at)
FROM tav.valuation_snapshots
WHERE mmr_value IS NOT NULL
  AND year IS NOT NULL
  AND lookup_make IS NOT NULL AND btrim(lookup_make) <> ''
  AND lookup_model IS NOT NULL AND btrim(lookup_model) <> ''
  AND lookup_trim IS NOT NULL AND btrim(lookup_trim) <> ''
GROUP BY year, lookup_make, lookup_model, lookup_trim
ON CONFLICT (year, make, model, style) DO NOTHING;
