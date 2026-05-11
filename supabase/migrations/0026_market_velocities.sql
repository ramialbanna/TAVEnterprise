-- =============================================================================
-- Migration 0026 — Add tav.market_velocities (pivot shape)
--
-- Time-decay-weighted velocity per segment. Output of the deterministic
-- velocity job: rolls up tav.historical_sales rows into 7d/30d/90d counts
-- with an explicit decay multiplier and a components jsonb audit blob.
--
-- Replaces the reverted 0023 shape. Key differences:
--   - segment_key (application-encoded composite, e.g.
--     '2020:toyota:camry:se:dallas_tx') is the unique natural key.
--   - sales_count split into 7d / 30d / 90d windows (not a single count).
--   - Adds avg_gross_profit_30d, avg_turn_time_30d, time_decay_multiplier,
--     and a components jsonb that captures the full input set used to
--     compute velocity_score.
--
-- The unique constraint is a PLAIN unique on segment_key (not a functional
-- index) so Supabase JS upsert can target it. See migration 0021.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.market_velocities (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_key              text          NOT NULL,
  year                     smallint,
  make                     text          NOT NULL,
  model                    text          NOT NULL,
  trim                     text,
  region                   text
    CHECK (region IS NULL OR region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx')),
  sales_count_7d           integer       NOT NULL DEFAULT 0,
  sales_count_30d          integer       NOT NULL DEFAULT 0,
  sales_count_90d          integer       NOT NULL DEFAULT 0,
  avg_gross_profit_30d     numeric(10,2),
  avg_turn_time_30d        numeric(6,2),
  velocity_score           numeric(5,4)  NOT NULL
    CHECK (velocity_score >= 0),
  time_decay_multiplier    numeric(5,4)  NOT NULL DEFAULT 1.0000,
  calculated_at            timestamptz   NOT NULL DEFAULT now(),
  components               jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at               timestamptz   NOT NULL DEFAULT now()
);

-- Plain unique constraint on segment_key (Supabase JS upsert target)
ALTER TABLE tav.market_velocities
  ADD CONSTRAINT market_velocities_segment_key_key UNIQUE (segment_key);

-- Fast segment fan-out (e.g. "all velocity rows for Camry across regions")
CREATE INDEX IF NOT EXISTS market_velocities_make_model_idx
  ON tav.market_velocities (make, model);

-- Staleness queries ("when was this segment last recomputed?")
CREATE INDEX IF NOT EXISTS market_velocities_calculated_at_idx
  ON tav.market_velocities (calculated_at DESC);
