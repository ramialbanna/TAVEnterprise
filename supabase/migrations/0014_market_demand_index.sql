-- =============================================================================
-- Migration 0014 — Add tav.market_demand_index table
--
-- Weekly demand snapshots feed the hybrid buy-box scoring model: a rule-based
-- score is blended with a demand signal (sell-through rate, hold days,
-- purchase velocity) to avoid chasing slow-moving segments even when they
-- look attractive on MMR alone.
--
-- Rows are computed by an offline job (initially manual SQL, later a scheduled
-- function) and written as point-in-time snapshots keyed by (region,
-- segment_key, week_label). segment_key is nullable: a null value means the
-- row is a region-wide aggregate; a non-null value is a YMM or trim segment.
--
-- The unique index uses COALESCE(segment_key,'') for the same NULL-collapsing
-- reason as migration 0013.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.market_demand_index (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  region            text    NOT NULL,
  segment_key       text,                          -- null = region-wide aggregate
  purchase_count    integer NOT NULL DEFAULT 0,
  avg_hold_days     numeric(8,2),
  sell_through_rate numeric(5,4)
    CHECK (sell_through_rate BETWEEN 0 AND 1),     -- 0.0000–1.0000
  demand_score      integer NOT NULL DEFAULT 50
    CHECK (demand_score BETWEEN 0 AND 100),
  week_label        text    NOT NULL,              -- e.g. '2026-W01'
  computed_at       timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Supports "latest demand score for a region" queries
CREATE INDEX IF NOT EXISTS market_demand_index_region_idx
  ON tav.market_demand_index (region);

-- Prevents duplicate snapshots for the same region / segment / week
CREATE UNIQUE INDEX IF NOT EXISTS market_demand_index_region_segment_week_unique
  ON tav.market_demand_index (region, COALESCE(segment_key,''), week_label);
