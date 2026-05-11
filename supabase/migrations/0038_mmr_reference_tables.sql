-- =============================================================================
-- Migration 0038 — MMR reference / alias tables + vehicle_enrichments CHECK ext
--
-- Reference tables hold canonical Manheim make/model strings.
-- Alias tables map common non-canonical inputs to their canonical form.
-- vehicle_enrichments gains two new CHECK values for normalization events.
--
-- Bulk reference population is deferred to the sync path (G.5.3 Step 3).
-- Only minimal make rows and unambiguous make aliases are seeded here.
-- =============================================================================

-- ── Reference tables ──────────────────────────────────────────────────────────

CREATE TABLE tav.mmr_reference_makes (
  make          text PRIMARY KEY,
  display_name  text NOT NULL
);

CREATE TABLE tav.mmr_reference_models (
  make   text NOT NULL REFERENCES tav.mmr_reference_makes (make),
  model  text NOT NULL,
  PRIMARY KEY (make, model)
);

-- ── Alias tables ──────────────────────────────────────────────────────────────

CREATE TABLE tav.mmr_make_aliases (
  alias          text PRIMARY KEY,
  canonical_make text NOT NULL REFERENCES tav.mmr_reference_makes (make)
);

CREATE TABLE tav.mmr_model_aliases (
  alias           text NOT NULL,
  canonical_make  text NOT NULL REFERENCES tav.mmr_reference_makes (make),
  canonical_model text NOT NULL,
  PRIMARY KEY (alias, canonical_make),
  FOREIGN KEY (canonical_make, canonical_model)
    REFERENCES tav.mmr_reference_models (make, model)
);

-- ── Extend vehicle_enrichments CHECK constraints ──────────────────────────────
-- Postgres does not support in-place CHECK modification — must drop + recreate.

ALTER TABLE tav.vehicle_enrichments
  DROP CONSTRAINT vehicle_enrichments_enrichment_source_check,
  ADD CONSTRAINT vehicle_enrichments_enrichment_source_check
    CHECK (enrichment_source IN (
      'manheim_vin_decode',
      'manheim_auction_history',
      'manheim_condition_report',
      'mmr_normalization',
      'manual'
    ));

ALTER TABLE tav.vehicle_enrichments
  DROP CONSTRAINT vehicle_enrichments_enrichment_type_check,
  ADD CONSTRAINT vehicle_enrichments_enrichment_type_check
    CHECK (enrichment_type IN (
      'vin_decode',
      'auction_history',
      'condition_report',
      'title_status',
      'normalization',
      'manual_note'
    ));

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT ON tav.mmr_reference_makes  TO service_role;
GRANT SELECT ON tav.mmr_reference_models TO service_role;
GRANT SELECT ON tav.mmr_make_aliases     TO service_role;
GRANT SELECT ON tav.mmr_model_aliases    TO service_role;

-- ── Minimal make seed (~20 canonical makes used in Texas dealer market) ────────

INSERT INTO tav.mmr_reference_makes (make, display_name) VALUES
  ('Acura',         'Acura'),
  ('BMW',           'BMW'),
  ('Chevrolet',     'Chevrolet'),
  ('Chrysler',      'Chrysler'),
  ('Dodge',         'Dodge'),
  ('Ford',          'Ford'),
  ('GMC',           'GMC'),
  ('Honda',         'Honda'),
  ('Hyundai',       'Hyundai'),
  ('Jeep',          'Jeep'),
  ('Kia',           'Kia'),
  ('Lexus',         'Lexus'),
  ('Mazda',         'Mazda'),
  ('Mercedes-Benz', 'Mercedes-Benz'),
  ('Nissan',        'Nissan'),
  ('Ram',           'Ram'),
  ('Subaru',        'Subaru'),
  ('Toyota',        'Toyota'),
  ('Volkswagen',    'Volkswagen'),
  ('Volvo',         'Volvo')
ON CONFLICT DO NOTHING;

-- ── Unambiguous make aliases only ─────────────────────────────────────────────
-- Rule: alias must resolve to exactly one canonical make with no year/trim
-- qualifier required. Ambiguous strings (e.g. "silverado") are NOT aliased.

INSERT INTO tav.mmr_make_aliases (alias, canonical_make) VALUES
  ('chevy',  'Chevrolet'),
  ('chev',   'Chevrolet'),
  ('vw',     'Volkswagen'),
  ('benz',   'Mercedes-Benz'),
  ('merc',   'Mercedes-Benz'),
  ('mb',     'Mercedes-Benz')
ON CONFLICT DO NOTHING;
