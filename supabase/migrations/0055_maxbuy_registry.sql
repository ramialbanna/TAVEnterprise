-- Migration 0055 — MaxBuy ML registry tables (empty until Phase 10)

CREATE TABLE tav.maxbuy_models (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_version       text        NOT NULL UNIQUE,
  artifact_hash       text        NOT NULL,
  trained_at          timestamptz NOT NULL,
  status              text        NOT NULL
    CHECK (status IN ('shadow', 'production', 'retired')),
  metrics             jsonb       NOT NULL,
  approved_by_user_id text,
  approved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tav.maxbuy_pipeline_runs (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at           timestamptz NOT NULL DEFAULT now(),
  finished_at          timestamptz,
  status               text        NOT NULL
    CHECK (status IN ('running', 'succeeded', 'failed', 'skipped')),
  rows_ingested        int,
  benchmark_version    text,
  feature_view_version text,
  model_version        text        REFERENCES tav.maxbuy_models (model_version),
  promotion_decision   text        CHECK (promotion_decision IN ('promoted', 'held', 'n/a')),
  error                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tav.maxbuy_backtests (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_version   text        NOT NULL REFERENCES tav.maxbuy_models (model_version),
  sale_week       date        NOT NULL,
  segment_key     text,
  sample_n        int         NOT NULL,
  sale_price_mae  numeric,
  gross_hit_loss  numeric,
  backtested_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_maxbuy_pipeline_runs_started
  ON tav.maxbuy_pipeline_runs (started_at DESC);
