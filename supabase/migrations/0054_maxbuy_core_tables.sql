-- Migration 0054 — MaxBuy core tables (lookups, recommendations, overrides, passes)

CREATE TABLE tav.maxbuy_lookups (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            text        NOT NULL,
  vin                text        NOT NULL CHECK (length(vin) = 17),
  mileage            int         CHECK (mileage >= 0),
  is_estimated_miles boolean     NOT NULL DEFAULT false,
  asking_price       numeric     CHECK (asking_price >= 0),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_maxbuy_lookups_vin
  ON tav.maxbuy_lookups (vin);
CREATE INDEX idx_maxbuy_lookups_created_at
  ON tav.maxbuy_lookups (created_at DESC);

CREATE TABLE tav.maxbuy_recommendations (
  id                                   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lookup_id                            uuid        NOT NULL REFERENCES tav.maxbuy_lookups (id) ON DELETE RESTRICT,
  normalized_listing_id                uuid        REFERENCES tav.normalized_listings (id),
  lead_id                              uuid        REFERENCES tav.leads (id),

  expected_sale_price                  numeric     NOT NULL CHECK (expected_sale_price >= 0),
  expected_net_gross                   numeric     NOT NULL,
  recommended_max_buy                  numeric     NOT NULL CHECK (recommended_max_buy >= 0),
  verdict                              text        NOT NULL
    CHECK (verdict IN ('STRONG_BUY', 'BUY', 'REVIEW', 'PASS')),
  data_strength                        text        NOT NULL
    CHECK (data_strength IN ('low', 'medium', 'high')),
  reason_codes                         text[]      NOT NULL,
  estimated_badges                     text[]      NOT NULL DEFAULT '{}',

  valuation_snapshot_id                uuid        REFERENCES tav.valuation_snapshots (id),
  benchmark_version                    text        NOT NULL,
  feature_view_version                 text        NOT NULL,
  feature_vector                       jsonb       NOT NULL,
  policy_version                       text        NOT NULL,
  scoring_version                      text        NOT NULL,
  model_artifact_hash                  text,
  worker_version                       text        NOT NULL,
  intelligence_worker_contract_version text        NOT NULL,

  mmr_value                            numeric     CHECK (mmr_value >= 0),
  mmr_method                           text        CHECK (mmr_method IN ('vin', 'ymm')),
  mmr_source                           text,
  mmr_cache_age_seconds                int,
  mmr_missing_reason                   text,
  mmr_observed_at                      timestamptz,

  historical_comp_ids                  uuid[]      NOT NULL DEFAULT '{}',
  created_at                           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_maxbuy_rec_lookup
  ON tav.maxbuy_recommendations (lookup_id);
CREATE INDEX idx_maxbuy_rec_verdict
  ON tav.maxbuy_recommendations (verdict);
CREATE INDEX idx_maxbuy_rec_created
  ON tav.maxbuy_recommendations (created_at DESC);
CREATE INDEX idx_maxbuy_rec_normalized_listing
  ON tav.maxbuy_recommendations (normalized_listing_id)
  WHERE normalized_listing_id IS NOT NULL;

CREATE TABLE tav.maxbuy_overrides (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recommendation_id uuid        NOT NULL REFERENCES tav.maxbuy_recommendations (id),
  buyer_user_id     text        NOT NULL,
  override_type     text        NOT NULL CHECK (override_type IN (
    'bought_despite_pass',
    'passed_despite_buy',
    'bid_reduced',
    'title_condition_concern',
    'transport_concern',
    'manager_call',
    'inventory_need',
    'other'
  )),
  override_note     text,
  acted_price       numeric     CHECK (acted_price >= 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_maxbuy_overrides_rec
  ON tav.maxbuy_overrides (recommendation_id);
CREATE INDEX idx_maxbuy_overrides_type
  ON tav.maxbuy_overrides (override_type);

CREATE TABLE tav.maxbuy_evaluated_passes (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vin               text        NOT NULL CHECK (length(vin) = 17),
  recommendation_id uuid        REFERENCES tav.maxbuy_recommendations (id),
  asking_price      numeric     CHECK (asking_price >= 0),
  bid_price         numeric     CHECK (bid_price >= 0),
  mmr_value         numeric     CHECK (mmr_value >= 0),
  buyer_user_id     text        NOT NULL,
  pass_reason       text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_maxbuy_passes_rec
  ON tav.maxbuy_evaluated_passes (recommendation_id)
  WHERE recommendation_id IS NOT NULL;
