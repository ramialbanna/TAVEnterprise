-- =============================================================================
-- Migration 0023 — Add tav.market_velocities table
--
-- Stores the output of the time-decay velocity scoring computation per
-- Make/Model/Trim segment. A velocity record represents "how fast this segment
-- sells in this region" as a normalized multiplier used downstream by the
-- buy-box scorer.
--
-- Design notes:
--   • Natural key is (make, model, trim, region). trim is NOT NULL DEFAULT ''
--     so the unique constraint is unambiguous — the same pattern used by
--     market_demand_index.segment_key (migration 0021).
--   • velocity_score is a multiplier: 1.0000 = baseline, 1.2500 = 25% faster,
--     0.8000 = 20% slower. Stored as numeric(5,4) (range 0–9.9999).
--   • computed_at records when the score was last refreshed; valid_until
--     provides an optional TTL so stale scores can be detected at read time.
--   • This is a computed/derived table. Rows are upserted by the scoring job,
--     never updated by application logic. No updated_at trigger is needed.
--   • region is constrained to the closed set of REGION_KEYS (domain.ts).
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.market_velocities (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Natural key components
  make              text        NOT NULL,
  model             text        NOT NULL,
  trim              text        NOT NULL DEFAULT '',  -- '' = make/model-only segment
  region            text        NOT NULL
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx')),

  -- Velocity output
  velocity_score    numeric(5,4) NOT NULL
    CHECK (velocity_score >= 0),                     -- multiplier: 1.0000 = baseline

  -- Supporting statistics
  sample_count      integer     NOT NULL DEFAULT 0,
  avg_days_to_sell  numeric(6,2),                    -- raw average days in inventory
  baseline_days     numeric(6,2),                    -- regional baseline used in decay formula

  -- Freshness / TTL
  computed_at       timestamptz NOT NULL DEFAULT now(),
  valid_until       timestamptz,                     -- null = no TTL

  created_at        timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Unique constraint — one velocity record per segment + region
-- =============================================================================

-- ON CONFLICT (make, model, trim, region) DO UPDATE lets the scoring job
-- upsert without having to check existence first.
ALTER TABLE tav.market_velocities
  ADD CONSTRAINT market_velocities_make_model_trim_region_key
  UNIQUE (make, model, trim, region);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Primary lookup path: "what is the velocity for this make/model in this region?"
CREATE INDEX IF NOT EXISTS market_velocities_region_make_model_idx
  ON tav.market_velocities (region, make, model);
