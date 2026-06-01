-- =============================================================================
-- TAV Enterprise Acquisition Intelligence Platform — Supabase Schema
-- Migration: 0001_initial_schema
--
-- All objects live in the tav schema.
-- Tables map to the four-concept pipeline (CLAUDE.md §2):
--   raw_listings → normalized_listings → vehicle_candidates → leads
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS tav;

-- =============================================================================
-- Trigger function (shared by normalized_listings, vehicle_candidates,
-- leads, buy_box_rules)
-- =============================================================================

CREATE OR REPLACE FUNCTION tav.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- Tables (dependency order)
-- =============================================================================

-- ── source_runs ───────────────────────────────────────────────────────────────

CREATE TABLE tav.source_runs (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source        text        NOT NULL
    CHECK (source IN ('facebook','craigslist','autotrader','cars_com','offerup')),
  run_id        text        NOT NULL,
  region        text        NOT NULL
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok')),
  scraped_at    timestamptz NOT NULL,
  item_count    integer,
  processed     integer,
  rejected      integer,
  created_leads integer,
  status        text        NOT NULL
    CHECK (status IN ('running','completed','failed','truncated')),
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source, run_id)
);

-- ── raw_listings ──────────────────────────────────────────────────────────────

CREATE TABLE tav.raw_listings (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source          text        NOT NULL
    CHECK (source IN ('facebook','craigslist','autotrader','cars_com','offerup')),
  source_run_id   uuid        REFERENCES tav.source_runs (id),
  raw_item        jsonb       NOT NULL,
  payload_version text        NOT NULL DEFAULT 'v1',
  received_at     timestamptz NOT NULL
);

-- ── normalized_listings ───────────────────────────────────────────────────────

CREATE TABLE tav.normalized_listings (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source              text        NOT NULL
    CHECK (source IN ('facebook','craigslist','autotrader','cars_com','offerup')),
  source_run_id       uuid        REFERENCES tav.source_runs (id),
  source_listing_id   text,
  listing_url         text        NOT NULL,
  title               text        NOT NULL,
  vin                 text,
  year                smallint    CHECK (year BETWEEN 1900 AND 2100),
  make                text,
  model               text,
  trim                text,
  price               integer     CHECK (price >= 0),
  last_price          integer     CHECK (last_price >= 0),
  price_changed_at    timestamptz,
  mileage             integer     CHECK (mileage >= 0),
  city                text,
  state               char(2),
  region              text        NOT NULL
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok')),
  seller_name         text,
  seller_url          text,
  images              text[],
  posted_at           timestamptz,
  scraped_at          timestamptz NOT NULL,
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  scrape_count        integer     NOT NULL DEFAULT 1,
  freshness_status    text        NOT NULL DEFAULT 'new'
    CHECK (freshness_status IN (
      'new','active','aging','stale_suspected','stale_confirmed','removed'
    )),
  stale_score         smallint    CHECK (stale_score BETWEEN 0 AND 100),
  price_changed       boolean     NOT NULL DEFAULT false,
  mileage_changed     boolean     NOT NULL DEFAULT false,
  description_changed boolean     NOT NULL DEFAULT false,
  image_changed       boolean     NOT NULL DEFAULT false,
  raw_listing_id      uuid        REFERENCES tav.raw_listings (id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── vehicle_candidates ────────────────────────────────────────────────────────

CREATE TABLE tav.vehicle_candidates (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identity_key  text        NOT NULL UNIQUE,
  year          smallint,
  make          text,
  model         text,
  trim          text,
  region        text
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok')),
  listing_count integer     NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── duplicate_groups ──────────────────────────────────────────────────────────

CREATE TABLE tav.duplicate_groups (
  id                    uuid             NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_candidate_id  uuid             NOT NULL REFERENCES tav.vehicle_candidates (id),
  normalized_listing_id uuid             NOT NULL REFERENCES tav.normalized_listings (id),
  dedupe_type           text             NOT NULL
    CHECK (dedupe_type IN ('exact','fuzzy')),
  confidence            double precision NOT NULL
    CHECK (confidence BETWEEN 0 AND 1),
  is_canonical          boolean          NOT NULL DEFAULT false,
  created_at            timestamptz      NOT NULL DEFAULT now(),

  UNIQUE (vehicle_candidate_id, normalized_listing_id),
  CHECK (
    (is_canonical = true AND confidence >= 0.7)
    OR is_canonical = false
  )
);

-- ── valuation_snapshots ───────────────────────────────────────────────────────

CREATE TABLE tav.valuation_snapshots (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  normalized_listing_id uuid        REFERENCES tav.normalized_listings (id),
  vehicle_candidate_id  uuid        REFERENCES tav.vehicle_candidates (id),
  vin                   text,
  year                  smallint,
  make                  text,
  model                 text,
  trim                  text,
  mileage               integer,
  region                text,
  mmr_value             integer     CHECK (mmr_value IS NULL OR mmr_value > 0),
  mmr_wholesale_avg     numeric(10,2),
  mmr_wholesale_clean   numeric(10,2),
  mmr_wholesale_rough   numeric(10,2),
  mmr_retail_clean      numeric(10,2),
  mmr_sample_count      integer,
  confidence            text        NOT NULL
    CHECK (confidence IN ('high','medium','low','none')),
  valuation_method      text        NOT NULL
    CHECK (valuation_method IN ('vin','year_make_model')),
  raw_response          jsonb,
  fetched_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz,
  lookup_make           text,
  lookup_model          text,
  lookup_trim           text,
  normalization_confidence text
    CHECK (normalization_confidence IN ('exact', 'alias', 'partial', 'none')),
  -- Miss observability (migration 0043): NULL on hit rows, set on miss rows.
  missing_reason        text,

  CHECK (normalized_listing_id IS NOT NULL OR vehicle_candidate_id IS NOT NULL),
  -- Exactly one of mmr_value / missing_reason is set (hit XOR miss).
  CHECK (
    (mmr_value IS NOT NULL AND missing_reason IS NULL)
    OR
    (mmr_value IS NULL AND missing_reason IS NOT NULL)
  )
);

-- ── buy_box_rules ─────────────────────────────────────────────────────────────

CREATE TABLE tav.buy_box_rules (
  id                      uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id                 text         NOT NULL UNIQUE,
  version                 integer      NOT NULL DEFAULT 1,
  make                    text,
  model                   text,
  year_min                smallint,
  year_max                smallint,
  max_mileage             integer,
  min_mileage             integer,
  target_price_pct_of_mmr numeric(5,2),
  regions                 text[],
  sources                 text[],
  priority_score          smallint,
  notes                   text,
  is_active               boolean      NOT NULL DEFAULT true,
  created_at              timestamptz  NOT NULL DEFAULT now(),
  updated_at              timestamptz  NOT NULL DEFAULT now()
);

-- ── leads ─────────────────────────────────────────────────────────────────────

CREATE TABLE tav.leads (
  id                      uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  normalized_listing_id   uuid        NOT NULL UNIQUE
    REFERENCES tav.normalized_listings (id),
  vehicle_candidate_id    uuid
    REFERENCES tav.vehicle_candidates (id),
  source                  text        NOT NULL
    CHECK (source IN ('facebook','craigslist','autotrader','cars_com','offerup')),
  region                  text
    CHECK (region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok')),
  year                    smallint,
  make                    text,
  model                   text,
  trim                    text,
  price                   integer,
  mileage                 integer,
  vin                     text,
  listing_url             text,
  title                   text,
  status                  text        NOT NULL DEFAULT 'new'
    CHECK (status IN (
      'new','assigned','claimed','contacted','negotiating',
      'passed','duplicate','stale','sold','purchased','archived'
    )),
  grade                   text        NOT NULL
    CHECK (grade IN ('excellent','good','fair','pass')),
  deal_score              smallint    CHECK (deal_score BETWEEN 0 AND 100),
  buy_box_score           smallint    CHECK (buy_box_score BETWEEN 0 AND 100),
  freshness_score         smallint    CHECK (freshness_score BETWEEN 0 AND 100),
  region_score            smallint    CHECK (region_score BETWEEN 0 AND 100),
  source_confidence_score smallint    CHECK (source_confidence_score BETWEEN 0 AND 100),
  final_score             smallint    CHECK (final_score BETWEEN 0 AND 100),
  reason_codes            text[],
  matched_buy_box_rule_id uuid
    REFERENCES tav.buy_box_rules (id),
  matched_rule_version    integer,
  valuation_confidence    text
    CHECK (valuation_confidence IN ('high','medium','low','none')),
  mmr_value               integer,
  assigned_to             text,
  assigned_at             timestamptz,
  lock_expires_at         timestamptz,
  last_action_at          timestamptz,
  score_components        jsonb,
  scoring_week_label      text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ── lead_actions ──────────────────────────────────────────────────────────────

CREATE TABLE tav.lead_actions (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id    uuid        NOT NULL REFERENCES tav.leads (id),
  actor      text        NOT NULL,
  action     text        NOT NULL,
  notes      text,
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── purchase_outcomes ─────────────────────────────────────────────────────────
-- lead_id is nullable (historical imports may have no matching lead).
-- Uniqueness on lead_id is enforced via partial index, not a column constraint.

CREATE TABLE tav.purchase_outcomes (
  id                          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id                     uuid        REFERENCES tav.leads (id),            -- nullable; see index below
  vehicle_candidate_id        uuid        REFERENCES tav.vehicle_candidates (id),
  purchase_price              integer,
  mmr_value_at_purchase       integer,
  mmr_source                  text,
  mmr_method                  text,
  mmr_lookup_date             date,
  mmr_snapshot_id             uuid,
  gross_profit_est            integer,
  odometer_at_purchase        integer,
  purchase_date               date,
  sale_date                   date,
  buyer                       text,
  notes                       text,
  -- denormalized vehicle fields (captured at purchase time)
  vin                         text,
  year                        smallint    CHECK (year BETWEEN 1900 AND 2100),
  make                        text,
  model                       text,
  trim                        text,
  mileage                     integer     CHECK (mileage >= 0),
  source                      text,
  region                      text,
  listed_price                integer     CHECK (listed_price >= 0),
  -- financial detail
  price_paid                  integer,
  sale_price                  integer,
  gross_profit                integer,
  net_gross                   integer,
  hold_days                   integer,
  transport_cost              integer,
  auction_fee                 integer,
  misc_overhead               integer,
  recon_cost                  integer,
  expense_total               integer,
  -- condition
  condition_grade_raw         text,
  condition_grade_normalized  text
    CHECK (condition_grade_normalized IN ('excellent','good','fair','poor','unknown')),
  -- channel classification
  purchase_channel            text
    CHECK (purchase_channel IN ('auction','private','dealer')),
  selling_channel             text
    CHECK (selling_channel IN ('retail','wholesale','auction')),
  -- import provenance
  week_label                  text,
  buyer_id                    text,
  closer_id                   text,
  cot_city                    text,
  cot_state                   text,
  import_batch_id             uuid,
  import_fingerprint          text,
  cycle_seq                   smallint,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- ── dead_letters ──────────────────────────────────────────────────────────────

CREATE TABLE tav.dead_letters (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source        text,
  region        text,
  fingerprint   text        UNIQUE,
  reason_code   text        NOT NULL,
  payload       jsonb,
  error_message text,
  retry_count   integer     NOT NULL DEFAULT 0,
  resolved      boolean     NOT NULL DEFAULT false,
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── schema_drift_events ───────────────────────────────────────────────────────

CREATE TABLE tav.schema_drift_events (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source        text        NOT NULL,
  source_run_id text,
  event_type    text
    CHECK (event_type IN ('unexpected_field','missing_required','wrong_type')),
  field_path    text,
  sample_value  jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── filtered_out ──────────────────────────────────────────────────────────────

CREATE TABLE tav.filtered_out (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source            text        NOT NULL,
  source_run_id     text,
  source_listing_id text,
  listing_url       text,
  reason_code       text        NOT NULL,
  details           jsonb,
  raw_listing_id    uuid        REFERENCES tav.raw_listings (id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- normalized_listings
CREATE UNIQUE INDEX ON tav.normalized_listings (source, listing_url)
  WHERE freshness_status != 'removed';
CREATE UNIQUE INDEX ON tav.normalized_listings (source, source_listing_id)
  WHERE source_listing_id IS NOT NULL;
CREATE INDEX ON tav.normalized_listings (source);
CREATE INDEX ON tav.normalized_listings (source_run_id);
CREATE INDEX ON tav.normalized_listings (region);
CREATE INDEX ON tav.normalized_listings (freshness_status);
CREATE INDEX ON tav.normalized_listings (stale_score);
CREATE INDEX ON tav.normalized_listings (last_seen_at);
CREATE INDEX ON tav.normalized_listings (year, make, model);
CREATE INDEX ON tav.normalized_listings (year, make, model, mileage, region);

-- vehicle_candidates
CREATE INDEX ON tav.vehicle_candidates (region);

-- duplicate_groups
CREATE INDEX ON tav.duplicate_groups (vehicle_candidate_id);
CREATE UNIQUE INDEX ON tav.duplicate_groups (vehicle_candidate_id)
  WHERE is_canonical = true;

-- valuation_snapshots
CREATE INDEX ON tav.valuation_snapshots (vehicle_candidate_id);
CREATE INDEX ON tav.valuation_snapshots (vehicle_candidate_id, fetched_at DESC);
CREATE INDEX vs_normalized_listing_fetched_at_idx
  ON tav.valuation_snapshots (normalized_listing_id, fetched_at DESC);
-- Roll up miss distributions without scanning the hit-heavy table (0043).
CREATE INDEX vs_missing_reason_idx ON tav.valuation_snapshots (missing_reason)
  WHERE missing_reason IS NOT NULL;

-- leads
CREATE INDEX ON tav.leads (status);
CREATE INDEX ON tav.leads (grade);
CREATE INDEX ON tav.leads (final_score DESC);
CREATE INDEX ON tav.leads (status, region);
CREATE INDEX ON tav.leads (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX ON tav.leads (created_at DESC);
CREATE INDEX ON tav.leads (status, final_score DESC)
  WHERE status IN ('new', 'assigned');

-- ── import_batches ────────────────────────────────────────────────────────────

CREATE TABLE tav.import_batches (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  week_label       text,
  row_count        integer     NOT NULL DEFAULT 0,
  imported_count   integer     NOT NULL DEFAULT 0,
  duplicate_count  integer     NOT NULL DEFAULT 0,
  rejected_count   integer     NOT NULL DEFAULT 0,
  status           text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','importing','complete','failed')),
  notes            text
);

-- ── import_rows ───────────────────────────────────────────────────────────────

CREATE TABLE tav.import_rows (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id  uuid        NOT NULL REFERENCES tav.import_batches (id),
  row_index        integer     NOT NULL,
  status           text        NOT NULL
    CHECK (status IN ('imported','duplicate','rejected')),
  reason_code      text,
  raw_row          jsonb       NOT NULL,
  outcome_id       uuid        REFERENCES tav.purchase_outcomes (id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ── market_expenses ───────────────────────────────────────────────────────────

CREATE TABLE tav.market_expenses (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  region         text    NOT NULL,
  city           text    NOT NULL DEFAULT '',
  expense_type   text    NOT NULL
    CHECK (expense_type IN ('transport','auction_fee','misc_overhead')),
  amount_cents   integer NOT NULL,
  effective_date date    NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ── market_demand_index ───────────────────────────────────────────────────────

CREATE TABLE tav.market_demand_index (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  region            text    NOT NULL,
  segment_key       text    NOT NULL DEFAULT '',
  purchase_count    integer NOT NULL DEFAULT 0,
  avg_hold_days     numeric(8,2),
  sell_through_rate numeric(5,4)
    CHECK (sell_through_rate BETWEEN 0 AND 1),
  demand_score      integer NOT NULL DEFAULT 50
    CHECK (demand_score BETWEEN 0 AND 100),
  week_label        text    NOT NULL,
  computed_at       timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── buy_box_score_attributions ────────────────────────────────────────────────

CREATE TABLE tav.buy_box_score_attributions (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid    NOT NULL REFERENCES tav.leads (id),
  rule_id         text,
  rule_version    integer,
  rule_score      integer,
  segment_score   integer,
  demand_score    integer,
  hybrid_score            integer NOT NULL,
  components              jsonb   NOT NULL DEFAULT '{}',
  demand_week_label       text,
  segment_snapshot_week   text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- ── sales_upload_batches ──────────────────────────────────────────────────────
-- Per-CSV-upload batch record for the sales/historical upload flow.
-- Created BEFORE historical_sales because historical_sales.upload_batch_id
-- is a foreign key into this table.

CREATE TABLE tav.sales_upload_batches (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by_user_id   text,
  uploaded_by_name      text,
  uploaded_by_email     text,
  file_name             text        NOT NULL,
  row_count             integer     NOT NULL,
  accepted_count        integer     NOT NULL DEFAULT 0,
  rejected_count        integer     NOT NULL DEFAULT 0,
  status                text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','validating','complete','failed')),
  validation_errors     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ── historical_sales ──────────────────────────────────────────────────────────
-- Per-vehicle historical purchase/sale record. Source for KPI rollups and
-- market-velocity calc. row_hash is the application-computed dedup key.

CREATE TABLE tav.historical_sales (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vin                 text,
  year                smallint    NOT NULL,
  make                text        NOT NULL,
  model               text        NOT NULL,
  trim                text,
  buyer               text,
  buyer_user_id       text,
  acquisition_date    date,
  sale_date           date        NOT NULL,
  acquisition_cost    numeric(12,2),
  sale_price          numeric(12,2) NOT NULL,
  transport_cost      numeric(10,2),
  recon_cost          numeric(10,2),
  auction_fees        numeric(10,2),
  gross_profit        numeric(12,2)
    GENERATED ALWAYS AS (
      sale_price
      - COALESCE(acquisition_cost, 0)
      - COALESCE(transport_cost, 0)
      - COALESCE(recon_cost, 0)
      - COALESCE(auction_fees, 0)
    ) STORED,
  source_file_name    text,
  upload_batch_id     uuid        REFERENCES tav.sales_upload_batches (id),
  row_hash            text        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── market_velocities ─────────────────────────────────────────────────────────
-- Time-decay-weighted velocity per segment. Output of the deterministic
-- velocity job that rolls up historical_sales.

CREATE TABLE tav.market_velocities (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_key              text          NOT NULL,
  year                     smallint,
  make                     text          NOT NULL,
  model                    text          NOT NULL,
  trim                     text,
  region                   text
    CHECK (region IS NULL OR region IN ('dallas_tx','houston_tx','austin_tx','san_antonio_tx','lubbock_tx','oklahoma_city_ok')),
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

-- ── mmr_queries ───────────────────────────────────────────────────────────────
-- Audit log of every Manheim MMR lookup. Append-only.

CREATE TABLE tav.mmr_queries (
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
  vehicle_candidate_id    uuid        REFERENCES tav.vehicle_candidates (id) ON DELETE SET NULL,
  normalized_listing_id   uuid        REFERENCES tav.normalized_listings  (id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- ── mmr_cache ─────────────────────────────────────────────────────────────────
-- Postgres-side queryable mirror of the KV MMR cache. KV serves the hot path;
-- this table serves analytics + cold-start recovery.

CREATE TABLE tav.mmr_cache (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key             text        NOT NULL,
  vin                   text,
  year                  smallint,
  make                  text,
  model                 text,
  trim                  text,
  mileage_used          integer,
  is_inferred_mileage   boolean     NOT NULL DEFAULT false,
  mmr_value             numeric(10,2),
  mmr_wholesale_avg     numeric(10,2),
  mmr_wholesale_clean   numeric(10,2),
  mmr_wholesale_rough   numeric(10,2),
  mmr_retail_clean      numeric(10,2),
  mmr_sample_count      integer,
  mmr_payload           jsonb       NOT NULL,
  fetched_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL,
  source                text        NOT NULL
    CHECK (source IN ('manheim','manual')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── mmr_reference_makes / mmr_reference_models ───────────────────────────────
-- Canonical Manheim make and model strings. Populated via sync path; minimal
-- make seed is applied in migration 0038.

CREATE TABLE tav.mmr_reference_makes (
  make          text PRIMARY KEY,
  display_name  text NOT NULL
);

CREATE TABLE tav.mmr_reference_models (
  make   text NOT NULL REFERENCES tav.mmr_reference_makes (make),
  model  text NOT NULL,
  PRIMARY KEY (make, model)
);

-- ── mmr_make_aliases / mmr_model_aliases ──────────────────────────────────────
-- Maps non-canonical input strings to canonical Manheim make/model strings.
-- Only unambiguous aliases are stored; ambiguous strings remain unresolved.

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

-- ── vehicle_enrichments ───────────────────────────────────────────────────────
-- Structured data fetched from external sources for a vehicle candidate.
-- Each row is one enrichment event; the same source may produce multiple rows.

CREATE TABLE tav.vehicle_enrichments (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_candidate_id uuid        NOT NULL REFERENCES tav.vehicle_candidates (id) ON DELETE CASCADE,
  enrichment_source    text        NOT NULL
    CHECK (enrichment_source IN (
      'manheim_vin_decode',
      'manheim_auction_history',
      'manheim_condition_report',
      'mmr_normalization',
      'manual'
    )),
  enrichment_type      text        NOT NULL
    CHECK (enrichment_type IN (
      'vin_decode',
      'auction_history',
      'condition_report',
      'title_status',
      'normalization',
      'manual_note'
    )),
  payload              jsonb       NOT NULL DEFAULT '{}',
  fetched_at           timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ── user_activity ─────────────────────────────────────────────────────────────
-- Presence + activity feed. active_until drives expiry for short-lived rows.

CREATE TABLE tav.user_activity (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             text,
  user_name           text,
  user_email          text,
  vin                 text,
  year                smallint,
  make                text,
  model               text,
  activity_type       text        NOT NULL
    CHECK (activity_type IN (
      'mmr_search','vin_view','sales_upload','kpi_view','batch_view'
    )),
  activity_payload    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  active_until        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── users ─────────────────────────────────────────────────────────────────────
-- TAV staff profiles for v2 workflow identity (Auth.js → proxy → Worker).

CREATE TABLE tav.users (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email           text        NOT NULL UNIQUE,
  display_name    text        NOT NULL,
  role            text        NOT NULL DEFAULT 'closer'
    CHECK (role IN ('admin', 'closer', 'viewer')),
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deactivated_at  timestamptz
);

CREATE INDEX users_is_active_idx ON tav.users (is_active) WHERE is_active = true;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON tav.users
  FOR EACH ROW EXECUTE FUNCTION tav.set_updated_at();

-- ── manual_opportunity_submissions ─────────────────────────────────────────────
-- Finder-submitted listing URLs for the v2 Opportunities queue.

CREATE TABLE tav.manual_opportunity_submissions (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  normalized_listing_id uuid        NOT NULL REFERENCES tav.normalized_listings (id),
  submitted_by_user_id  uuid        NOT NULL REFERENCES tav.users (id),
  assigned_to_user_id   uuid        REFERENCES tav.users (id),
  seller_notes          text,
  submitter_notes       text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX manual_opportunity_submissions_listing_idx
  ON tav.manual_opportunity_submissions (normalized_listing_id);
CREATE INDEX manual_opportunity_submissions_created_idx
  ON tav.manual_opportunity_submissions (created_at DESC);
CREATE INDEX manual_opportunity_submissions_submitter_idx
  ON tav.manual_opportunity_submissions (submitted_by_user_id);

-- ── opportunity_workflow ──────────────────────────────────────────────────────
-- Listing-level assignment/claim state for v2 Opportunities (Phase 6 Slice C).

CREATE TABLE tav.opportunity_workflow (
  normalized_listing_id     uuid        NOT NULL PRIMARY KEY
    REFERENCES tav.normalized_listings (id),
  status                    text        NOT NULL DEFAULT 'new'
    CHECK (status IN (
      'new','assigned','claimed','reviewed','contacted','negotiating',
      'passed','duplicate','stale','sold','purchased','archived'
    )),
  assigned_to_user_id       uuid        REFERENCES tav.users (id),
  assigned_at               timestamptz,
  assigned_by_user_id       uuid        REFERENCES tav.users (id),
  claimed_by_user_id        uuid        REFERENCES tav.users (id),
  claimed_at                timestamptz,
  claim_expires_at          timestamptz,
  last_evaluated_by_user_id uuid        REFERENCES tav.users (id),
  last_evaluated_at         timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX opportunity_workflow_assigned_idx
  ON tav.opportunity_workflow (assigned_to_user_id)
  WHERE assigned_to_user_id IS NOT NULL;
CREATE INDEX opportunity_workflow_claimed_idx
  ON tav.opportunity_workflow (claimed_by_user_id)
  WHERE claimed_by_user_id IS NOT NULL;
CREATE INDEX opportunity_workflow_claim_expires_idx
  ON tav.opportunity_workflow (claim_expires_at)
  WHERE claim_expires_at IS NOT NULL;

CREATE TRIGGER opportunity_workflow_set_updated_at
  BEFORE UPDATE ON tav.opportunity_workflow
  FOR EACH ROW EXECUTE FUNCTION tav.set_updated_at();

-- ── opportunity_actions ───────────────────────────────────────────────────────
-- Auditable assignment/submission/evaluation events for v2 Opportunities.

CREATE TABLE tav.opportunity_actions (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  normalized_listing_id uuid        NOT NULL REFERENCES tav.normalized_listings (id),
  actor_user_id         uuid        NOT NULL REFERENCES tav.users (id),
  action                text        NOT NULL
    CHECK (action IN (
      'submitted','assigned','unassigned','reassigned','claimed','evaluated',
      'status_changed','note_added'
    )),
  notes                 text,
  metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX opportunity_actions_listing_idx
  ON tav.opportunity_actions (normalized_listing_id, created_at DESC);
CREATE INDEX opportunity_actions_actor_idx
  ON tav.opportunity_actions (actor_user_id);

-- ── maxbuy_policy ─────────────────────────────────────────────────────────────

CREATE TABLE tav.maxbuy_policy (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  policy_version       text        NOT NULL,
  scope                text        NOT NULL
    CHECK (scope IN ('global', 'segment', 'source', 'price_band')),
  scope_key            text,
  target_net_gross     numeric     CHECK (target_net_gross >= 0),
  effective_from       timestamptz NOT NULL DEFAULT now(),
  effective_to         timestamptz,
  changed_by_user_id   text        NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_maxbuy_policy_current
  ON tav.maxbuy_policy (scope, coalesce(scope_key, ''))
  WHERE effective_to IS NULL;

-- ── maxbuy_lookups / recommendations / overrides / passes ─────────────────────

CREATE TABLE tav.maxbuy_lookups (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            text        NOT NULL,
  vin                text        NOT NULL CHECK (length(vin) = 17),
  mileage            int         CHECK (mileage >= 0),
  is_estimated_miles boolean     NOT NULL DEFAULT false,
  asking_price       numeric     CHECK (asking_price >= 0),
  created_at         timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE tav.maxbuy_overrides (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recommendation_id uuid        NOT NULL REFERENCES tav.maxbuy_recommendations (id),
  buyer_user_id     text        NOT NULL,
  override_type     text        NOT NULL CHECK (override_type IN (
    'bought_despite_pass', 'passed_despite_buy', 'bid_reduced',
    'title_condition_concern', 'transport_concern', 'manager_call',
    'inventory_need', 'other'
  )),
  override_note     text,
  acted_price       numeric     CHECK (acted_price >= 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);

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

-- ── maxbuy ML registry (Phase 10+) ────────────────────────────────────────────

CREATE TABLE tav.maxbuy_models (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_version       text        NOT NULL UNIQUE,
  artifact_hash       text        NOT NULL,
  trained_at          timestamptz NOT NULL,
  status              text        NOT NULL CHECK (status IN ('shadow', 'production', 'retired')),
  metrics             jsonb       NOT NULL,
  approved_by_user_id text,
  approved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tav.maxbuy_pipeline_runs (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at           timestamptz NOT NULL DEFAULT now(),
  finished_at          timestamptz,
  status               text        NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'skipped')),
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

-- ── cron_runs ─────────────────────────────────────────────────────────────────
-- Audit log of scheduled-job runs (v1: daily stale-sweep). Job-agnostic.
-- detail: { "updated": <n> } on success, { "error": <summary> } on failure.

CREATE TABLE tav.cron_runs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name     text        NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  status       text        NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok','failed')),
  detail       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- purchase_outcomes
CREATE UNIQUE INDEX ON tav.purchase_outcomes (lead_id)
  WHERE lead_id IS NOT NULL;
ALTER TABLE tav.purchase_outcomes
  ADD CONSTRAINT purchase_outcomes_import_fingerprint_key UNIQUE (import_fingerprint);
ALTER TABLE tav.purchase_outcomes
  ADD CONSTRAINT purchase_outcomes_cycle_seq_chk
  CHECK (cycle_seq IS NULL OR cycle_seq >= 1);
ALTER TABLE tav.purchase_outcomes
  ADD CONSTRAINT purchase_outcomes_recon_cost_chk
  CHECK (recon_cost IS NULL OR recon_cost >= 0);

-- import_rows
CREATE INDEX ON tav.import_rows (import_batch_id);
CREATE INDEX ON tav.import_rows (outcome_id) WHERE outcome_id IS NOT NULL;

-- market_expenses
CREATE INDEX ON tav.market_expenses (region);
ALTER TABLE tav.market_expenses ADD CONSTRAINT market_expenses_region_type_city_date_key UNIQUE (region, expense_type, city, effective_date);

-- market_demand_index
CREATE INDEX ON tav.market_demand_index (region);
ALTER TABLE tav.market_demand_index ADD CONSTRAINT market_demand_index_region_segment_week_key UNIQUE (region, segment_key, week_label);

-- buy_box_score_attributions
CREATE INDEX ON tav.buy_box_score_attributions (lead_id);

-- sales_upload_batches
CREATE INDEX ON tav.sales_upload_batches (created_at DESC);

-- historical_sales
ALTER TABLE tav.historical_sales
  ADD CONSTRAINT historical_sales_row_hash_key UNIQUE (row_hash);
CREATE INDEX ON tav.historical_sales (vin) WHERE vin IS NOT NULL;
CREATE INDEX ON tav.historical_sales (year, make, model);
CREATE INDEX ON tav.historical_sales (upload_batch_id);
CREATE INDEX ON tav.historical_sales (sale_date DESC);
CREATE INDEX ON tav.historical_sales (make, model, trim, sale_date DESC);

-- market_velocities
ALTER TABLE tav.market_velocities
  ADD CONSTRAINT market_velocities_segment_key_key UNIQUE (segment_key);
CREATE INDEX ON tav.market_velocities (make, model);
CREATE INDEX ON tav.market_velocities (calculated_at DESC);

-- mmr_queries
CREATE INDEX ON tav.mmr_queries (vin) WHERE vin IS NOT NULL;
CREATE INDEX ON tav.mmr_queries (year, make, model)
  WHERE year IS NOT NULL AND make IS NOT NULL AND model IS NOT NULL;
CREATE INDEX ON tav.mmr_queries (requested_by_user_id);
CREATE INDEX ON tav.mmr_queries (created_at DESC);
CREATE INDEX ON tav.mmr_queries (vehicle_candidate_id)
  WHERE vehicle_candidate_id IS NOT NULL;
CREATE INDEX ON tav.mmr_queries (normalized_listing_id)
  WHERE normalized_listing_id IS NOT NULL;

-- mmr_cache
ALTER TABLE tav.mmr_cache
  ADD CONSTRAINT mmr_cache_cache_key_key UNIQUE (cache_key);
CREATE INDEX ON tav.mmr_cache (vin) WHERE vin IS NOT NULL;
CREATE INDEX ON tav.mmr_cache (expires_at);

-- leads (partial index for vehicle_candidate_id lookups)
CREATE INDEX ON tav.leads (vehicle_candidate_id)
  WHERE vehicle_candidate_id IS NOT NULL;

-- vehicle_enrichments
CREATE INDEX ON tav.vehicle_enrichments (vehicle_candidate_id);
CREATE INDEX ON tav.vehicle_enrichments (enrichment_source, enrichment_type);
CREATE INDEX ON tav.vehicle_enrichments (expires_at) WHERE expires_at IS NOT NULL;

-- user_activity
CREATE INDEX ON tav.user_activity (vin) WHERE vin IS NOT NULL;
CREATE INDEX ON tav.user_activity (user_id);
CREATE INDEX ON tav.user_activity (created_at DESC);
CREATE INDEX ON tav.user_activity (active_until) WHERE active_until IS NOT NULL;

-- dead_letters
CREATE INDEX ON tav.dead_letters (resolved, created_at) WHERE resolved = false;

-- cron_runs
CREATE INDEX ON tav.cron_runs (job_name, started_at DESC);

-- maxbuy
CREATE INDEX idx_maxbuy_lookups_vin ON tav.maxbuy_lookups (vin);
CREATE INDEX idx_maxbuy_lookups_created_at ON tav.maxbuy_lookups (created_at DESC);
CREATE INDEX idx_maxbuy_rec_lookup ON tav.maxbuy_recommendations (lookup_id);
CREATE INDEX idx_maxbuy_rec_verdict ON tav.maxbuy_recommendations (verdict);
CREATE INDEX idx_maxbuy_rec_created ON tav.maxbuy_recommendations (created_at DESC);
CREATE INDEX idx_maxbuy_rec_normalized_listing ON tav.maxbuy_recommendations (normalized_listing_id)
  WHERE normalized_listing_id IS NOT NULL;
CREATE INDEX idx_maxbuy_overrides_rec ON tav.maxbuy_overrides (recommendation_id);
CREATE INDEX idx_maxbuy_overrides_type ON tav.maxbuy_overrides (override_type);
CREATE INDEX idx_maxbuy_passes_rec ON tav.maxbuy_evaluated_passes (recommendation_id)
  WHERE recommendation_id IS NOT NULL;
CREATE INDEX idx_maxbuy_pipeline_runs_started ON tav.maxbuy_pipeline_runs (started_at DESC);

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER trg_normalized_listings_updated_at
  BEFORE UPDATE ON tav.normalized_listings
  FOR EACH ROW EXECUTE FUNCTION tav.set_updated_at();

CREATE TRIGGER trg_vehicle_candidates_updated_at
  BEFORE UPDATE ON tav.vehicle_candidates
  FOR EACH ROW EXECUTE FUNCTION tav.set_updated_at();

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON tav.leads
  FOR EACH ROW EXECUTE FUNCTION tav.set_updated_at();

CREATE TRIGGER trg_buy_box_rules_updated_at
  BEFORE UPDATE ON tav.buy_box_rules
  FOR EACH ROW EXECUTE FUNCTION tav.set_updated_at();

CREATE TRIGGER trg_mmr_cache_updated_at
  BEFORE UPDATE ON tav.mmr_cache
  FOR EACH ROW EXECUTE FUNCTION tav.set_updated_at();

-- =============================================================================
-- Views
-- =============================================================================

-- v_active_inbox: buyer-ready leads, excludes stale/removed, last 30 days.
CREATE OR REPLACE VIEW tav.v_active_inbox AS
SELECT
  l.*,
  nl.images,
  nl.seller_name,
  nl.seller_url,
  nl.posted_at
FROM tav.leads l
JOIN tav.normalized_listings nl ON nl.id = l.normalized_listing_id
WHERE l.status IN ('new', 'assigned')
  AND nl.freshness_status NOT IN ('stale_confirmed', 'removed')
  AND nl.last_seen_at > now() - interval '30 days'
ORDER BY l.final_score DESC, l.created_at DESC;

-- v_outcome_summary: region-level KPIs for the operations dashboard.
CREATE OR REPLACE VIEW tav.v_outcome_summary AS
SELECT
  region,
  COUNT(*)                                                    AS total_outcomes,
  ROUND(AVG(gross_profit)::numeric, 2)                        AS avg_gross_profit,
  ROUND(AVG(hold_days)::numeric, 2)                           AS avg_hold_days,
  ROUND(
    COUNT(*) FILTER (WHERE sale_price IS NOT NULL)::numeric /
    NULLIF(COUNT(*), 0),
    4
  )                                                           AS sell_through_rate,
  MAX(created_at)                                             AS last_outcome_at
FROM tav.purchase_outcomes
GROUP BY region;

-- v_outcome_summary_global: single-row global rollup (no GROUP BY) for /app/kpis.
-- Formulas mirror v_outcome_summary exactly, sans `region`. Always one row.
CREATE OR REPLACE VIEW tav.v_outcome_summary_global AS
SELECT
  COUNT(*)                                                    AS total_outcomes,
  ROUND(AVG(gross_profit)::numeric, 2)                        AS avg_gross_profit,
  ROUND(AVG(hold_days)::numeric, 2)                           AS avg_hold_days,
  ROUND(
    COUNT(*) FILTER (WHERE sale_price IS NOT NULL)::numeric /
    NULLIF(COUNT(*), 0),
    4
  )                                                           AS sell_through_rate,
  MAX(created_at)                                             AS last_outcome_at
FROM tav.purchase_outcomes;

-- v_segment_profit: YMM + mileage-bucket gross margin for buy-box tuning.
CREATE OR REPLACE VIEW tav.v_segment_profit AS
SELECT
  year,
  make,
  model,
  FLOOR(mileage / 10000) * 10000                              AS mileage_bucket,
  COUNT(*)                                                    AS outcome_count,
  ROUND(AVG(gross_profit)::numeric, 2)                        AS avg_gross_profit,
  ROUND(
    AVG(
      CASE WHEN gross_profit > 0
           THEN gross_profit::numeric / NULLIF(price_paid, 0)
      END
    ) * 100,
    2
  )                                                           AS avg_gross_margin_pct
FROM tav.purchase_outcomes
WHERE gross_profit IS NOT NULL
  AND price_paid   IS NOT NULL
  AND price_paid   > 0
GROUP BY year, make, model, FLOOR(mileage / 10000) * 10000;

-- MaxBuy benchmark materialized views + wrappers: see migration 0056_maxbuy_benchmark_views.sql

-- v_source_health: latest run per source/region pair.
CREATE OR REPLACE VIEW tav.v_source_health AS
SELECT DISTINCT ON (source, region)
  source,
  region,
  run_id,
  scraped_at,
  item_count,
  processed,
  rejected,
  created_leads,
  status,
  error_message
FROM tav.source_runs
ORDER BY source, region, scraped_at DESC;

-- =============================================================================
-- Role grants
-- PREREQUISITE: add "tav" to Supabase Dashboard → Settings → API →
-- "Exposed schemas" so PostgREST will accept Accept-Profile/Content-Profile: tav.
-- =============================================================================

GRANT USAGE ON SCHEMA tav TO service_role, authenticated, anon;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA tav
  TO service_role;

GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA tav
  TO service_role;

GRANT SELECT
  ON ALL TABLES IN SCHEMA tav
  TO authenticated, anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA tav
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA tav
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA tav
  GRANT SELECT ON TABLES TO authenticated, anon;
