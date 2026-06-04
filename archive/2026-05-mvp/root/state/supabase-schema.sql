-- ============================================================================
-- TAV Marketplace — Supabase schema (idempotent)
-- All phases combined: 4.5, 5.5, 5.7, 5.8, 5.9b, 5.9c, 5.9d, 5.9e
--
-- Apply via: Supabase Dashboard → SQL Editor → paste → Run
-- Idempotent: safe to re-run. Uses CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE, etc.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS tav;
SET search_path TO tav, public;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Canonical listings store
CREATE TABLE IF NOT EXISTS tav.listings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id       text NOT NULL UNIQUE,
  fingerprint      text NOT NULL,
  title            text,
  price            integer,
  year             integer,
  make             text,
  model            text,
  mileage          integer,
  location_city    text,
  location_state   text,
  seller_name      text,
  seller_id        text,
  listing_url      text NOT NULL,
  photo_url        text,
  description      text,
  transmission     text,
  exterior_color   text,
  vehicle_type     text,
  is_live          boolean NOT NULL DEFAULT true,
  is_sold          boolean NOT NULL DEFAULT false,
  is_pending       boolean NOT NULL DEFAULT false,
  source_task      text,
  listed_at        timestamptz,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  -- Phase 5.8: Manheim MMR + deal grading
  vin              text,
  mmr              integer,
  mmr_adjusted     integer,
  mmr_source       text CHECK (mmr_source IN ('vin','ymm') OR mmr_source IS NULL),
  mmr_confidence   text CHECK (mmr_confidence IN ('high','medium','low','none') OR mmr_confidence IS NULL),
  mmr_fetched_at   timestamptz,
  deal_grade       text CHECK (deal_grade IN ('steal','great','good','fair','pass','unknown') OR deal_grade IS NULL),
  -- Phase 5.9c: composite deal score
  deal_score              integer,
  deal_score_components   jsonb,
  deal_score_computed_at  timestamptz,
  raw              jsonb
);

CREATE INDEX IF NOT EXISTS idx_listings_fingerprint ON tav.listings (fingerprint);
CREATE INDEX IF NOT EXISTS idx_listings_price       ON tav.listings (price);
CREATE INDEX IF NOT EXISTS idx_listings_city        ON tav.listings (location_city);
CREATE INDEX IF NOT EXISTS idx_listings_make_model  ON tav.listings (make, model);
CREATE INDEX IF NOT EXISTS idx_listings_year        ON tav.listings (year);
CREATE INDEX IF NOT EXISTS idx_listings_first_seen  ON tav.listings (first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_live        ON tav.listings (is_live, is_sold)
  WHERE is_live = true AND is_sold = false;
CREATE INDEX IF NOT EXISTS idx_listings_deal_grade  ON tav.listings (deal_grade)
  WHERE deal_grade IN ('steal','great');
CREATE INDEX IF NOT EXISTS idx_listings_vin         ON tav.listings (vin)
  WHERE vin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_mmr_pending ON tav.listings (first_seen_at DESC)
  WHERE deal_grade = 'unknown' AND mileage IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_deal_score  ON tav.listings (deal_score DESC NULLS LAST)
  WHERE is_live = true AND is_sold = false;

-- Time-series snapshots (one per sighting)
CREATE TABLE IF NOT EXISTS tav.listings_history (
  id          bigserial PRIMARY KEY,
  listing_id  text NOT NULL REFERENCES tav.listings(listing_id) ON DELETE CASCADE,
  price       integer,
  is_live     boolean,
  is_sold     boolean,
  is_pending  boolean,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_history_listing ON tav.listings_history (listing_id, observed_at DESC);

-- Fingerprint registry (vehicle identity across relist events)
CREATE TABLE IF NOT EXISTS tav.fingerprints (
  fingerprint       text PRIMARY KEY,
  first_listing_id  text NOT NULL,
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  relist_count      integer NOT NULL DEFAULT 0,
  last_seen_at      timestamptz NOT NULL DEFAULT now()
);

-- Relist detection events
CREATE TABLE IF NOT EXISTS tav.relisted_events (
  id                  bigserial PRIMARY KEY,
  fingerprint         text NOT NULL REFERENCES tav.fingerprints(fingerprint),
  original_listing_id text NOT NULL,
  new_listing_id      text NOT NULL,
  price_delta         integer,
  detected_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_relisted_fp ON tav.relisted_events (fingerprint);

-- Price change log
CREATE TABLE IF NOT EXISTS tav.price_changes (
  id          bigserial PRIMARY KEY,
  listing_id  text NOT NULL REFERENCES tav.listings(listing_id) ON DELETE CASCADE,
  old_price   integer,
  new_price   integer,
  delta       integer,
  changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pricechg_listing ON tav.price_changes (listing_id, changed_at DESC);

-- Operator CRM state
CREATE TABLE IF NOT EXISTS tav.lead_state (
  listing_id    text PRIMARY KEY REFERENCES tav.listings(listing_id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','lead','contacted','negotiating','bought','pass','lost')),
  notes         text,
  contacted_at  timestamptz,
  bought_price  integer,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    text
);

-- ============================================================================
-- Phase 5.8: Config table (flat, named columns — used by grade_deal + compute_deal_score)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tav.config (
  cluster_id              text PRIMARY KEY,
  -- Grade thresholds
  steal_under             integer NOT NULL DEFAULT 2000,
  great_band              integer NOT NULL DEFAULT 500,
  good_band               integer NOT NULL DEFAULT 500,
  fair_band               integer NOT NULL DEFAULT 1500,
  -- Retry policy
  mmr_retry_max           integer NOT NULL DEFAULT 24,
  mmr_retry_minutes       integer NOT NULL DEFAULT 60,
  -- Phase 5.9c: Deal Score weights
  score_baseline             integer NOT NULL DEFAULT 50,
  score_mmr_per_100          numeric NOT NULL DEFAULT 1.0,
  score_mmr_min              integer NOT NULL DEFAULT -25,
  score_mmr_max              integer NOT NULL DEFAULT 30,
  score_dom_per_day          numeric NOT NULL DEFAULT 0.5,
  score_dom_max              integer NOT NULL DEFAULT 20,
  score_relist_per_count     numeric NOT NULL DEFAULT 5.0,
  score_relist_max           integer NOT NULL DEFAULT 15,
  score_drop_per_pct         numeric NOT NULL DEFAULT 2.0,
  score_drop_max             integer NOT NULL DEFAULT 20,
  score_freshness_start_day  integer NOT NULL DEFAULT 30,
  score_freshness_end_day    integer NOT NULL DEFAULT 60,
  score_freshness_min        integer NOT NULL DEFAULT -15,
  updated_at              timestamptz NOT NULL DEFAULT now()
);
INSERT INTO tav.config (cluster_id) VALUES ('global') ON CONFLICT DO NOTHING;

ALTER TABLE tav.config ENABLE ROW LEVEL SECURITY;

-- Phase 5.9e: Separate KV table for operational envelope tunables
-- (separate from config to avoid conflict with grade/score named columns)
CREATE TABLE IF NOT EXISTS tav.config_kv (
  cluster  text NOT NULL DEFAULT 'global',
  key      text NOT NULL,
  value    text,
  notes    text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cluster, key)
);
ALTER TABLE tav.config_kv ENABLE ROW LEVEL SECURITY;

INSERT INTO tav.config_kv (cluster, key, value, notes) VALUES
  ('global','envelope_apify_cap_usd',         '200',     'Apify monthly hard cap (Billing → Limits)'),
  ('global','envelope_apify_warn_usd',         '160',     'Apify warn threshold (~80% of cap)'),
  ('global','envelope_make_p9_trigger_usd',    '500',     'Phase 9 escalates to top priority above this'),
  ('global','envelope_make_warn_usd',          '400',     'Make.com warn threshold (escalate Phase 9 priority)'),
  ('global','envelope_make_credits_per_item',  '2',       'Make ops per dataset item (avg, post-router)'),
  ('global','envelope_make_credits_fixed_per_run','4',    'Make ops per scenario run regardless of items'),
  ('global','envelope_worker_req_warn',        '50000',   'Cloudflare Worker daily request warn (yellow)'),
  ('global','envelope_worker_req_page',        '70000',   'Cloudflare Worker daily request page (red)'),
  ('global','envelope_worker_free_cap',        '100000',  'Cloudflare Worker free-tier daily request cap'),
  ('global','envelope_manheim_daily_cap',      '2000000', 'Manheim Mashery PROD daily call cap'),
  ('global','envelope_manheim_warn',           '1500000', 'Manheim warn threshold (75% of cap)'),
  ('global','envelope_supabase_db_cap_gb',     '8',       'Supabase Pro included DB size before overage billing'),
  ('global','envelope_supabase_db_warn_gb',    '6',       'Supabase DB warn threshold (75% of included)')
ON CONFLICT (cluster, key) DO NOTHING;

-- Helper: read a numeric envelope tunable with a sensible default
CREATE OR REPLACE FUNCTION tav.envelope_num(p_key text, p_default numeric)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT NULLIF(value,'')::numeric FROM tav.config_kv
      WHERE cluster = 'global' AND key = p_key LIMIT 1),
    p_default
  );
$$;
GRANT EXECUTE ON FUNCTION tav.envelope_num(text,numeric) TO authenticated, anon, service_role;

-- ============================================================================
-- Phase 5.5: Dead-letter queue + drift watchdog
-- ============================================================================

CREATE TABLE IF NOT EXISTS tav.dead_letter (
  id              bigserial PRIMARY KEY,
  source          text NOT NULL,
  reason          text NOT NULL,
  missing_fields  text[],
  payload_version integer,
  raw             jsonb NOT NULL,
  error_detail    text,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dead_letter_occurred ON tav.dead_letter (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_dead_letter_reason   ON tav.dead_letter (reason, occurred_at DESC);

CREATE TABLE IF NOT EXISTS tav.drift_snapshots (
  id               bigserial PRIMARY KEY,
  snapshot_date    date NOT NULL UNIQUE,
  sample_size      integer NOT NULL,
  top_keys         text[]  NOT NULL,
  null_counts      jsonb   NOT NULL,
  dead_letter_24h  integer NOT NULL DEFAULT 0,
  keys_added       text[],
  keys_removed     text[],
  null_regressions jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drift_date ON tav.drift_snapshots (snapshot_date DESC);

-- Phase 5.8: MMR retry queue
CREATE TABLE IF NOT EXISTS tav.mmr_retry_queue (
  listing_id    text PRIMARY KEY REFERENCES tav.listings(listing_id) ON DELETE CASCADE,
  attempts      integer NOT NULL DEFAULT 0,
  last_attempt  timestamptz,
  next_attempt  timestamptz NOT NULL DEFAULT now(),
  last_outcome  text,
  exhausted     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mmr_retry_due ON tav.mmr_retry_queue (next_attempt)
  WHERE exhausted = false;
ALTER TABLE tav.mmr_retry_queue ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Phase 5.7: Metrics tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS tav.run_metrics (
  apify_run_id          text PRIMARY KEY,
  apify_task_id         text,
  cluster               text,
  started_at            timestamptz,
  finished_at           timestamptz,
  apify_status          text,
  items_returned        integer,
  apify_cost_usd        numeric(10,4),
  apify_compute_units   numeric(10,4),
  cost_polled_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_run_metrics_finished     ON tav.run_metrics (finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_metrics_status       ON tav.run_metrics (apify_status);
CREATE INDEX IF NOT EXISTS idx_run_metrics_cost_pending ON tav.run_metrics (finished_at DESC)
  WHERE apify_cost_usd IS NULL AND apify_status = 'SUCCEEDED';

CREATE TABLE IF NOT EXISTS tav.scenario_metrics (
  scenario_run_id    text PRIMARY KEY,
  apify_run_id       text REFERENCES tav.run_metrics(apify_run_id) ON DELETE SET NULL,
  started_at         timestamptz NOT NULL,
  finished_at        timestamptz,
  items_in           integer,
  items_filtered_out integer,
  items_ok           integer,
  items_dead_letter  integer,
  scenario_status    text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scenario_metrics_finished ON tav.scenario_metrics (finished_at DESC);

CREATE TABLE IF NOT EXISTS tav.item_metrics (
  id                     bigserial PRIMARY KEY,
  scenario_run_id        text,
  apify_run_id           text,
  listing_id             text,
  outcome                text NOT NULL,
  apify_listed_at        timestamptz,
  normalizer_received_at timestamptz,
  normalizer_duration_ms integer,
  db_written_at          timestamptz NOT NULL DEFAULT now(),
  e2e_latency_seconds    integer GENERATED ALWAYS AS
                           (EXTRACT(EPOCH FROM (db_written_at - apify_listed_at))::int) STORED,
  worker_version         text,
  -- Phase 5.8
  mmr_outcome            text,
  mmr_lookup_ms          integer,
  deal_grade             text,
  mmr_confidence         text
);
CREATE INDEX IF NOT EXISTS idx_item_metrics_db_written ON tav.item_metrics (db_written_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_metrics_scenario   ON tav.item_metrics (scenario_run_id);
CREATE INDEX IF NOT EXISTS idx_item_metrics_outcome    ON tav.item_metrics (outcome, db_written_at DESC);

ALTER TABLE tav.run_metrics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tav.scenario_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE tav.item_metrics     ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS on core tables
-- ============================================================================
ALTER TABLE tav.listings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tav.listings_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE tav.fingerprints     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tav.relisted_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tav.price_changes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tav.lead_state       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tav.dead_letter      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tav.drift_snapshots  ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Dead-letter log helper
CREATE OR REPLACE FUNCTION tav.log_dead_letter(
  p_source          text,
  p_reason          text,
  p_missing_fields  text[],
  p_payload_version integer,
  p_raw             jsonb,
  p_error_detail    text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO tav.dead_letter (source, reason, missing_fields, payload_version, raw, error_detail)
  VALUES (p_source, p_reason, p_missing_fields, p_payload_version, p_raw, p_error_detail)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION tav.log_dead_letter(text,text,text[],integer,jsonb,text) TO service_role;

-- Drift check (nightly cron)
CREATE OR REPLACE FUNCTION tav.run_drift_check()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_today        date := (now() AT TIME ZONE 'UTC')::date;
  v_sample_size  integer;
  v_top_keys     text[];
  v_null_counts  jsonb;
  v_dl_24h       integer;
  v_prev         tav.drift_snapshots%ROWTYPE;
  v_keys_added   text[];
  v_keys_removed text[];
  v_null_regress jsonb := '{}'::jsonb;
  v_id           bigint;
BEGIN
  SELECT count(*) INTO v_sample_size
  FROM tav.listings
  WHERE first_seen_at > now() - interval '24 hours' AND raw IS NOT NULL;

  SELECT COALESCE(array_agg(k ORDER BY cnt DESC), ARRAY[]::text[]) INTO v_top_keys
  FROM (
    SELECT jsonb_object_keys(raw) AS k, count(*) AS cnt
    FROM tav.listings
    WHERE first_seen_at > now() - interval '24 hours' AND raw IS NOT NULL
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 200
  ) t;

  SELECT jsonb_build_object(
    'listing_id',    count(*) FILTER (WHERE listing_id IS NULL),
    'listing_url',   count(*) FILTER (WHERE listing_url IS NULL),
    'fingerprint',   count(*) FILTER (WHERE fingerprint IS NULL),
    'price',         count(*) FILTER (WHERE price IS NULL),
    'year',          count(*) FILTER (WHERE year IS NULL),
    'make',          count(*) FILTER (WHERE make IS NULL),
    'model',         count(*) FILTER (WHERE model IS NULL),
    'mileage',       count(*) FILTER (WHERE mileage IS NULL),
    'location_city', count(*) FILTER (WHERE location_city IS NULL)
  ) INTO v_null_counts
  FROM tav.listings WHERE first_seen_at > now() - interval '24 hours';

  SELECT count(*) INTO v_dl_24h
  FROM tav.dead_letter WHERE occurred_at > now() - interval '24 hours';

  SELECT * INTO v_prev FROM tav.drift_snapshots
  WHERE snapshot_date = v_today - 1
  ORDER BY snapshot_date DESC LIMIT 1;

  IF FOUND THEN
    SELECT COALESCE(array_agg(k), ARRAY[]::text[]) INTO v_keys_added
    FROM (SELECT unnest(v_top_keys) EXCEPT SELECT unnest(v_prev.top_keys)) t(k);

    SELECT COALESCE(array_agg(k), ARRAY[]::text[]) INTO v_keys_removed
    FROM (SELECT unnest(v_prev.top_keys) EXCEPT SELECT unnest(v_top_keys)) t(k);

    SELECT COALESCE(jsonb_object_agg(k, jsonb_build_object('prev', prev_v, 'now', now_v)), '{}'::jsonb)
      INTO v_null_regress
    FROM (
      SELECT key AS k,
             COALESCE((v_prev.null_counts->>key)::int, 0) AS prev_v,
             (v_null_counts->>key)::int AS now_v
      FROM jsonb_object_keys(v_null_counts) key
    ) t
    WHERE now_v > 5 AND now_v > prev_v * 1.5;
  END IF;

  INSERT INTO tav.drift_snapshots
    (snapshot_date, sample_size, top_keys, null_counts, dead_letter_24h,
     keys_added, keys_removed, null_regressions)
  VALUES
    (v_today, v_sample_size, v_top_keys, v_null_counts, v_dl_24h,
     NULLIF(v_keys_added,   ARRAY[]::text[]),
     NULLIF(v_keys_removed, ARRAY[]::text[]),
     NULLIF(v_null_regress, '{}'::jsonb))
  ON CONFLICT (snapshot_date) DO UPDATE SET
    sample_size      = EXCLUDED.sample_size,
    top_keys         = EXCLUDED.top_keys,
    null_counts      = EXCLUDED.null_counts,
    dead_letter_24h  = EXCLUDED.dead_letter_24h,
    keys_added       = EXCLUDED.keys_added,
    keys_removed     = EXCLUDED.keys_removed,
    null_regressions = EXCLUDED.null_regressions
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'date', v_today, 'sample_size', v_sample_size,
                            'dead_letter_24h', v_dl_24h);
END;
$$;
GRANT EXECUTE ON FUNCTION tav.run_drift_check() TO service_role;

-- Phase 5.8: Grade deal (pure function, reads config thresholds)
CREATE OR REPLACE FUNCTION tav.grade_deal(
  p_price      integer,
  p_mmr_adj    integer,
  p_cluster_id text DEFAULT 'global'
) RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_cfg tav.config%ROWTYPE;
  v_d   integer;
BEGIN
  IF p_price IS NULL OR p_mmr_adj IS NULL THEN RETURN 'unknown'; END IF;

  SELECT * INTO v_cfg FROM tav.config WHERE cluster_id = p_cluster_id;
  IF NOT FOUND THEN SELECT * INTO v_cfg FROM tav.config WHERE cluster_id = 'global'; END IF;
  IF NOT FOUND THEN
    v_cfg.steal_under := 2000; v_cfg.great_band := 500;
    v_cfg.good_band   := 500;  v_cfg.fair_band  := 1500;
  END IF;

  v_d := p_price - p_mmr_adj;
  IF v_d <= -v_cfg.steal_under THEN RETURN 'steal'; END IF;
  IF v_d <= -v_cfg.great_band  THEN RETURN 'great'; END IF;
  IF abs(v_d) <  v_cfg.good_band THEN RETURN 'good';  END IF;
  IF v_d <=  v_cfg.fair_band   THEN RETURN 'fair';  END IF;
  RETURN 'pass';
END;
$$;
GRANT EXECUTE ON FUNCTION tav.grade_deal(integer,integer,text) TO service_role, authenticated;

-- Phase 5.9c: Composite deal score (reads config weights)
-- Uses listed_at (Marketplace posting time) as DOM start; falls back to first_seen_at.
CREATE OR REPLACE FUNCTION tav.compute_deal_score(p_listing_id text, p_cluster_id text DEFAULT 'global')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_cfg       tav.config%ROWTYPE;
  v_l         tav.listings%ROWTYPE;
  v_relist    integer := 0;
  v_dom_days  numeric;
  v_age_days  numeric;
  v_drop_pct  numeric := 0;
  v_mmr_delta numeric;
  v_c_mmr     numeric := 0;
  v_c_dom     numeric := 0;
  v_c_relist  numeric := 0;
  v_c_drop    numeric := 0;
  v_c_fresh   numeric := 0;
  v_score     integer;
BEGIN
  SELECT * INTO v_cfg FROM tav.config WHERE cluster_id = p_cluster_id;
  IF NOT FOUND THEN
    SELECT * INTO v_cfg FROM tav.config WHERE cluster_id = 'global';
  END IF;

  SELECT * INTO v_l FROM tav.listings WHERE listing_id = p_listing_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('score', NULL, 'reason', 'listing_not_found');
  END IF;

  SELECT COALESCE(f.relist_count, 0) INTO v_relist
  FROM tav.fingerprints f WHERE f.fingerprint = v_l.fingerprint;
  v_relist := COALESCE(v_relist, 0);

  -- DOM: days since listing was posted on Marketplace (listed_at), fallback to first_seen_at
  v_dom_days := EXTRACT(EPOCH FROM (now() - COALESCE(v_l.listed_at, v_l.first_seen_at))) / 86400.0;
  v_age_days := EXTRACT(EPOCH FROM (now() - v_l.first_seen_at)) / 86400.0;

  -- Price drop % over last 30 days
  SELECT
    COALESCE(SUM(CASE WHEN pc.delta < 0 THEN -pc.delta ELSE 0 END) /
             NULLIF(MAX(pc.old_price), 0) * 100, 0)
  INTO v_drop_pct
  FROM tav.price_changes pc
  WHERE pc.listing_id = p_listing_id
    AND pc.changed_at > now() - interval '30 days';
  v_drop_pct := COALESCE(v_drop_pct, 0);

  -- MMR component: positive when underpriced (mmr_adjusted > price)
  IF v_l.mmr_adjusted IS NOT NULL AND v_l.price IS NOT NULL THEN
    v_mmr_delta := (v_l.mmr_adjusted::numeric - v_l.price::numeric);
    v_c_mmr := GREATEST(v_cfg.score_mmr_min,
                LEAST(v_cfg.score_mmr_max,
                  (v_mmr_delta / 100.0) * v_cfg.score_mmr_per_100));
  END IF;

  -- DOM component: cap at score_dom_max
  v_c_dom := LEAST(v_cfg.score_dom_max, v_dom_days * v_cfg.score_dom_per_day);
  v_c_dom := GREATEST(0, v_c_dom);

  -- Relist component: cap at score_relist_max
  v_c_relist := LEAST(v_cfg.score_relist_max, v_relist * v_cfg.score_relist_per_count);
  v_c_relist := GREATEST(0, v_c_relist);

  -- Price-drop component: cap at score_drop_max
  v_c_drop := LEAST(v_cfg.score_drop_max, v_drop_pct * v_cfg.score_drop_per_pct);
  v_c_drop := GREATEST(0, v_c_drop);

  -- Freshness penalty: linear decay from start_day to end_day
  IF v_age_days <= v_cfg.score_freshness_start_day THEN
    v_c_fresh := 0;
  ELSIF v_age_days >= v_cfg.score_freshness_end_day THEN
    v_c_fresh := v_cfg.score_freshness_min;
  ELSE
    v_c_fresh := v_cfg.score_freshness_min *
                 ((v_age_days - v_cfg.score_freshness_start_day) /
                  NULLIF(v_cfg.score_freshness_end_day - v_cfg.score_freshness_start_day, 0));
  END IF;

  v_score := GREATEST(0, LEAST(100,
    ROUND(v_cfg.score_baseline + v_c_mmr + v_c_dom + v_c_relist + v_c_drop + v_c_fresh)::integer
  ));

  RETURN jsonb_build_object(
    'score',      v_score,
    'baseline',   v_cfg.score_baseline,
    'mmr',        ROUND(v_c_mmr, 2),
    'dom',        ROUND(v_c_dom, 2),
    'relist',     ROUND(v_c_relist, 2),
    'price_drop', ROUND(v_c_drop, 2),
    'freshness',  ROUND(v_c_fresh, 2),
    'inputs',     jsonb_build_object(
      'mmr_delta',    ROUND(COALESCE(v_mmr_delta, 0), 2),
      'dom_days',     ROUND(v_dom_days, 1),
      'age_days',     ROUND(v_age_days, 1),
      'relist_count', v_relist,
      'drop_pct_30d', ROUND(v_drop_pct, 2)
    ),
    'computed_at', now()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION tav.compute_deal_score(text, text) TO service_role;

-- Phase 5.9c: Trigger to refresh deal_score on in-place updates
CREATE OR REPLACE FUNCTION tav.refresh_deal_score()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := tav.compute_deal_score(NEW.listing_id);
  IF v_result ? 'score' AND (v_result->>'score') IS NOT NULL THEN
    NEW.deal_score             := (v_result->>'score')::integer;
    NEW.deal_score_components  := v_result;
    NEW.deal_score_computed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_listings_score_refresh ON tav.listings;
CREATE TRIGGER trg_listings_score_refresh
  BEFORE UPDATE OF price, mmr, mmr_adjusted, last_seen_at, deal_grade ON tav.listings
  FOR EACH ROW
  EXECUTE FUNCTION tav.refresh_deal_score();

-- Phase 5.9c: Nightly score refresh (DOM + freshness shift daily)
CREATE OR REPLACE FUNCTION tav.refresh_all_deal_scores()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tav, public
AS $$
DECLARE
  v_count integer := 0;
  v_row   record;
  v_res   jsonb;
BEGIN
  FOR v_row IN
    SELECT listing_id FROM tav.listings
    WHERE is_live = true AND is_sold = false
      AND first_seen_at > now() - interval '90 days'
  LOOP
    v_res := tav.compute_deal_score(v_row.listing_id);
    IF v_res ? 'score' AND (v_res->>'score') IS NOT NULL THEN
      UPDATE tav.listings
      SET deal_score             = (v_res->>'score')::integer,
          deal_score_components  = v_res,
          deal_score_computed_at = now()
      WHERE listing_id = v_row.listing_id;
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('refreshed', v_count, 'at', now());
END;
$$;
GRANT EXECUTE ON FUNCTION tav.refresh_all_deal_scores() TO service_role;

-- Phase 5.9d: Tighter MMR retry cadence (30s for pending rows, 5min for genuine misses)
-- Replaces the Phase 5.8 trigger function with LEAST() conflict resolution.
CREATE OR REPLACE FUNCTION tav.queue_mmr_retry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_pending boolean;
  v_delay   interval;
BEGIN
  IF NEW.mileage IS NOT NULL
     AND (NEW.deal_grade IS NULL OR NEW.deal_grade = 'unknown')
     AND NEW.mmr IS NULL THEN
    -- Check if a recent item_metrics row shows this as 'pending' (async in-flight)
    SELECT EXISTS (
      SELECT 1 FROM tav.item_metrics
       WHERE listing_id = NEW.listing_id
         AND mmr_outcome = 'pending'
         AND db_written_at > now() - interval '2 minutes'
    ) INTO v_pending;

    v_delay := CASE WHEN v_pending THEN interval '30 seconds'
                                   ELSE interval '5 minutes' END;

    INSERT INTO tav.mmr_retry_queue (listing_id, next_attempt)
    VALUES (NEW.listing_id, now() + v_delay)
    ON CONFLICT (listing_id) DO UPDATE
      SET next_attempt = LEAST(tav.mmr_retry_queue.next_attempt, EXCLUDED.next_attempt);
  ELSIF NEW.mmr IS NOT NULL THEN
    DELETE FROM tav.mmr_retry_queue WHERE listing_id = NEW.listing_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_listings_mmr_queue ON tav.listings;
CREATE TRIGGER trg_listings_mmr_queue
  AFTER INSERT OR UPDATE OF mmr, deal_grade ON tav.listings
  FOR EACH ROW EXECUTE FUNCTION tav.queue_mmr_retry();

-- Phase 5.9d: Async MMR writeback RPC (called by Worker ctx.waitUntil())
CREATE OR REPLACE FUNCTION tav.upsert_mmr_async(
  p_listing_id text,
  p_payload    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tav, public
AS $$
DECLARE
  v_outcome    text  := p_payload->>'mmr_outcome';
  v_mmr        int   := NULLIF(p_payload->>'mmr','')::int;
  v_adjusted   int   := NULLIF(p_payload->>'mmr_adjusted','')::int;
  v_source     text  := p_payload->>'mmr_source';
  v_confidence text  := COALESCE(p_payload->>'mmr_confidence','none');
  v_grade      text  := COALESCE(p_payload->>'deal_grade','unknown');
  v_fetched_at timestamptz := COALESCE(
                   NULLIF(p_payload->>'mmr_fetched_at','')::timestamptz,
                   now());
  v_lookup_ms  int   := NULLIF(p_payload->>'mmr_lookup_ms','')::int;
BEGIN
  UPDATE tav.listings
     SET mmr            = COALESCE(v_mmr,        mmr),
         mmr_adjusted   = COALESCE(v_adjusted,   mmr_adjusted),
         mmr_source     = COALESCE(v_source,     mmr_source),
         mmr_confidence = CASE
                            WHEN mmr IS NOT NULL THEN mmr_confidence
                            ELSE v_confidence
                          END,
         deal_grade     = CASE
                            WHEN mmr IS NOT NULL THEN deal_grade
                            ELSE v_grade
                          END,
         mmr_fetched_at = COALESCE(v_fetched_at, mmr_fetched_at)
   WHERE listing_id = p_listing_id
     AND (mmr IS NULL OR v_mmr IS NOT NULL);

  IF NOT FOUND THEN
    PERFORM tav.log_dead_letter(
      'mmr_async', 'listing_missing', NULL, NULL,
      jsonb_build_object('listing_id', p_listing_id, 'payload', p_payload),
      'upsert_mmr_async called for unknown listing_id');
    RETURN jsonb_build_object('ok', false, 'reason', 'listing_missing');
  END IF;

  INSERT INTO tav.item_metrics (
    listing_id, scenario_run_id, outcome, db_written_at,
    mmr_outcome, mmr_lookup_ms, deal_grade, mmr_confidence, worker_version)
  VALUES (
    p_listing_id, NULL, 'mmr_async', v_fetched_at,
    v_outcome, v_lookup_ms, v_grade, v_confidence, 'v1.3.0');

  RETURN jsonb_build_object(
    'ok', true,
    'listing_id', p_listing_id,
    'mmr_outcome', v_outcome,
    'deal_grade', v_grade,
    'mmr', v_mmr);
END;
$$;
GRANT EXECUTE ON FUNCTION tav.upsert_mmr_async(text, jsonb) TO service_role;

-- Phase 5.8: Hourly MMR retry worker
CREATE OR REPLACE FUNCTION tav.retry_failed_mmr()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_secret     text;
  v_url        text;
  v_row        record;
  v_request_id bigint;
  v_dispatched integer := 0;
  v_exhausted  integer := 0;
  v_max        integer;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'NORMALIZER_SECRET';
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'NORMALIZER_URL';

  IF v_secret IS NULL OR v_url IS NULL THEN
    RETURN jsonb_build_object('dispatched', 0, 'reason', 'no_worker_credentials');
  END IF;

  SELECT mmr_retry_max INTO v_max FROM tav.config WHERE cluster_id = 'global';
  v_max := COALESCE(v_max, 24);

  FOR v_row IN
    SELECT q.listing_id
    FROM tav.mmr_retry_queue q
    WHERE q.exhausted = false AND q.attempts >= v_max
  LOOP
    UPDATE tav.mmr_retry_queue SET exhausted = true WHERE listing_id = v_row.listing_id;
    PERFORM tav.log_dead_letter(
      'mmr_retry', 'mmr_exhausted', NULL, NULL,
      jsonb_build_object('listing_id', v_row.listing_id),
      'MMR retry exhausted after ' || v_max || ' attempts'
    );
    v_exhausted := v_exhausted + 1;
  END LOOP;

  FOR v_row IN
    SELECT l.listing_id, l.raw
    FROM tav.mmr_retry_queue q
    JOIN tav.listings l ON l.listing_id = q.listing_id
    WHERE q.exhausted = false
      AND q.next_attempt <= now()
      AND l.raw IS NOT NULL
    ORDER BY q.next_attempt ASC
    LIMIT 50
  LOOP
    SELECT net.http_post(
      url := v_url || '/normalize',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_secret,
        'Content-Type',  'application/json'
      ),
      body := jsonb_build_object('raw', v_row.raw)
    ) INTO v_request_id;

    UPDATE tav.mmr_retry_queue
    SET attempts     = attempts + 1,
        last_attempt = now(),
        next_attempt = now() + interval '1 hour'
    WHERE listing_id = v_row.listing_id;
    v_dispatched := v_dispatched + 1;
  END LOOP;

  RETURN jsonb_build_object('dispatched', v_dispatched, 'exhausted', v_exhausted);
END;
$$;
GRANT EXECUTE ON FUNCTION tav.retry_failed_mmr() TO service_role;

-- Phase 5.8: Reap MMR retry responses from pg_net
CREATE OR REPLACE FUNCTION tav.reap_mmr_retry_responses()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_resp    record;
  v_body    jsonb;
  v_payload jsonb;
  v_reaped  integer := 0;
BEGIN
  FOR v_resp IN
    SELECT id, status_code, content, created
    FROM net._http_response
    WHERE created > now() - interval '90 minutes'
      AND status_code = 200
      AND content IS NOT NULL
    ORDER BY created DESC
    LIMIT 200
  LOOP
    BEGIN
      v_body := v_resp.content::jsonb;
      v_payload := v_body->'payload';
      IF (v_body->>'ok')::boolean = true
         AND v_payload IS NOT NULL
         AND v_payload ? 'listing_id'
         AND v_payload ? 'mmr' THEN
        PERFORM tav.upsert_listing(v_payload);
        v_reaped := v_reaped + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  RETURN jsonb_build_object('reaped', v_reaped);
END;
$$;
GRANT EXECUTE ON FUNCTION tav.reap_mmr_retry_responses() TO service_role;

-- Phase 5.7: RPC called by Make Module 2 on run start
CREATE OR REPLACE FUNCTION tav.log_run_start(
  p_apify_run_id   text,
  p_apify_task_id  text,
  p_cluster        text,
  p_started_at     timestamptz,
  p_finished_at    timestamptz,
  p_apify_status   text,
  p_items_returned integer
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO tav.run_metrics
    (apify_run_id, apify_task_id, cluster, started_at, finished_at, apify_status, items_returned)
  VALUES (p_apify_run_id, p_apify_task_id, p_cluster, p_started_at, p_finished_at,
          p_apify_status, p_items_returned)
  ON CONFLICT (apify_run_id) DO UPDATE SET
    apify_status   = EXCLUDED.apify_status,
    items_returned = EXCLUDED.items_returned,
    finished_at    = COALESCE(EXCLUDED.finished_at, tav.run_metrics.finished_at);
END;
$$;
GRANT EXECUTE ON FUNCTION tav.log_run_start(text,text,text,timestamptz,timestamptz,text,integer) TO service_role;

-- Phase 5.7: RPC called by Make Module 9 on scenario end
CREATE OR REPLACE FUNCTION tav.log_scenario_end(payload jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO tav.scenario_metrics
    (scenario_run_id, apify_run_id, started_at, finished_at,
     items_in, items_filtered_out, items_ok, items_dead_letter, scenario_status)
  VALUES (
    payload->>'scenario_run_id',
    payload->>'apify_run_id',
    (payload->>'started_at')::timestamptz,
    COALESCE((payload->>'finished_at')::timestamptz, now()),
    NULLIF(payload->>'items_in','')::int,
    NULLIF(payload->>'items_filtered_out','')::int,
    NULLIF(payload->>'items_ok','')::int,
    NULLIF(payload->>'items_dead_letter','')::int,
    payload->>'scenario_status'
  )
  ON CONFLICT (scenario_run_id) DO UPDATE SET
    finished_at        = EXCLUDED.finished_at,
    items_in           = EXCLUDED.items_in,
    items_filtered_out = EXCLUDED.items_filtered_out,
    items_ok           = EXCLUDED.items_ok,
    items_dead_letter  = EXCLUDED.items_dead_letter,
    scenario_status    = EXCLUDED.scenario_status;
END;
$$;
GRANT EXECUTE ON FUNCTION tav.log_scenario_end(jsonb) TO service_role;

-- Phase 5.7: Apify cost poller (reads APIFY_API_TOKEN from Vault)
CREATE OR REPLACE FUNCTION tav.poll_apify_costs()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_token        text;
  v_run          record;
  v_request_id   bigint;
  v_polled_count integer := 0;
BEGIN
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets WHERE name = 'APIFY_API_TOKEN';

  IF v_token IS NULL THEN
    RAISE NOTICE 'APIFY_API_TOKEN not in vault; skipping cost poll';
    RETURN jsonb_build_object('polled', 0, 'reason', 'no_token');
  END IF;

  FOR v_run IN
    SELECT apify_run_id FROM tav.run_metrics
    WHERE apify_status = 'SUCCEEDED'
      AND apify_cost_usd IS NULL
      AND finished_at < now() - interval '2 minutes'
      AND finished_at > now() - interval '7 days'
    ORDER BY finished_at ASC
    LIMIT 50
  LOOP
    SELECT net.http_get(
      url := 'https://api.apify.com/v2/actor-runs/' || v_run.apify_run_id,
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_token)
    ) INTO v_request_id;
    v_polled_count := v_polled_count + 1;
  END LOOP;

  RETURN jsonb_build_object('polled', v_polled_count);
END;
$$;
GRANT EXECUTE ON FUNCTION tav.poll_apify_costs() TO service_role;

-- Phase 5.7: Reap Apify cost responses from pg_net
CREATE OR REPLACE FUNCTION tav.reap_apify_cost_responses()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_resp    record;
  v_body    jsonb;
  v_run_id  text;
  v_cost    numeric;
  v_compute numeric;
  v_reaped  integer := 0;
BEGIN
  FOR v_resp IN
    SELECT id, status_code, content, created
    FROM net._http_response
    WHERE created > now() - interval '2 hours'
      AND status_code = 200
      AND content IS NOT NULL
    ORDER BY created DESC
    LIMIT 200
  LOOP
    BEGIN
      v_body    := v_resp.content::jsonb;
      v_run_id  := v_body->'data'->>'id';
      v_cost    := NULLIF(v_body->'data'->'usage'->>'totalUsageUsd','')::numeric;
      v_compute := NULLIF(v_body->'data'->'usage'->>'COMPUTE_UNITS','')::numeric;

      IF v_run_id IS NOT NULL AND v_cost IS NOT NULL THEN
        UPDATE tav.run_metrics
        SET apify_cost_usd      = v_cost,
            apify_compute_units = v_compute,
            cost_polled_at      = now()
        WHERE apify_run_id = v_run_id
          AND apify_cost_usd IS NULL;
        IF FOUND THEN v_reaped := v_reaped + 1; END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  RETURN jsonb_build_object('reaped', v_reaped);
END;
$$;
GRANT EXECUTE ON FUNCTION tav.reap_apify_cost_responses() TO service_role;

-- Phase 5.9b: Data pruning (relaxed for Pro 8GB tier)
CREATE OR REPLACE FUNCTION tav.prune_old_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tav, public
AS $$
DECLARE
  v_history_deleted   bigint := 0;
  v_metrics_deleted   bigint := 0;
  v_runs_deleted      bigint := 0;
  v_responses_deleted bigint := 0;
BEGIN
  -- listings_history: 365 days
  WITH d AS (
    DELETE FROM tav.listings_history WHERE observed_at < now() - interval '365 days' RETURNING 1
  ) SELECT count(*) INTO v_history_deleted FROM d;

  -- item_metrics: 90 days
  WITH d AS (
    DELETE FROM tav.item_metrics WHERE db_written_at < now() - interval '90 days' RETURNING 1
  ) SELECT count(*) INTO v_metrics_deleted FROM d;

  -- run_metrics: 365 days
  WITH d AS (
    DELETE FROM tav.run_metrics WHERE created_at < now() - interval '365 days' RETURNING 1
  ) SELECT count(*) INTO v_runs_deleted FROM d;

  -- pg_net responses: belt-and-braces sweep of anything older than 48h
  BEGIN
    WITH d AS (
      DELETE FROM net._http_response WHERE created < now() - interval '48 hours' RETURNING 1
    ) SELECT count(*) INTO v_responses_deleted FROM d;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'history_deleted',   v_history_deleted,
    'metrics_deleted',   v_metrics_deleted,
    'runs_deleted',      v_runs_deleted,
    'responses_deleted', v_responses_deleted,
    'pruned_at',         now()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION tav.prune_old_data() TO service_role;

-- ============================================================================
-- MAIN INGEST RPC: tav.upsert_listing(payload jsonb)
-- Called by Make Module 8a for every normalized item.
-- ============================================================================
CREATE OR REPLACE FUNCTION tav.upsert_listing(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_payload_version integer := NULLIF(payload->>'payload_version','')::integer;
  v_listing_id    text    := payload->>'listing_id';
  v_fingerprint   text    := payload->>'fingerprint';
  v_listing_url   text    := payload->>'listing_url';
  v_price         integer := NULLIF(payload->>'price','')::integer;
  v_existing      tav.listings%ROWTYPE;
  v_was_relisted  boolean := false;
  v_inserted      boolean := false;
  v_updated       boolean := false;
  v_price_changed boolean := false;
  v_fp_first_id   text;
  v_missing       text[]  := ARRAY[]::text[];
  v_dl_id         bigint;
  v_score_result  jsonb;
BEGIN
  -- N2 validation prologue: reject bad payloads to dead_letter
  IF v_payload_version IS NULL OR v_payload_version < 1 THEN
    v_dl_id := tav.log_dead_letter('upsert_listing', 'unversioned', NULL,
                                   v_payload_version, payload,
                                   'payload_version missing or < 1');
    RETURN jsonb_build_object('ok', false, 'reason', 'unversioned', 'dead_letter_id', v_dl_id);
  END IF;

  IF v_listing_id  IS NULL OR v_listing_id  = '' THEN v_missing := array_append(v_missing, 'listing_id');  END IF;
  IF v_listing_url IS NULL OR v_listing_url = '' THEN v_missing := array_append(v_missing, 'listing_url'); END IF;
  IF v_fingerprint IS NULL OR v_fingerprint = '' THEN v_missing := array_append(v_missing, 'fingerprint'); END IF;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    v_dl_id := tav.log_dead_letter('upsert_listing', 'missing_required', v_missing,
                                   v_payload_version, payload, NULL);
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_required',
                              'missing_fields', v_missing, 'dead_letter_id', v_dl_id);
  END IF;

  SELECT * INTO v_existing FROM tav.listings WHERE listing_id = v_listing_id;

  IF FOUND THEN
    -- L1 dedup: listing_id exists → update
    UPDATE tav.listings SET
      price        = v_price,
      is_live      = COALESCE((payload->>'is_live')::boolean,    is_live),
      is_sold      = COALESCE((payload->>'is_sold')::boolean,    is_sold),
      is_pending   = COALESCE((payload->>'is_pending')::boolean, is_pending),
      last_seen_at = now(),
      raw          = COALESCE(payload->'raw', raw)
    WHERE listing_id = v_listing_id;
    v_updated := true;

    IF v_existing.price IS DISTINCT FROM v_price THEN
      INSERT INTO tav.price_changes (listing_id, old_price, new_price, delta)
      VALUES (v_listing_id, v_existing.price, v_price, v_price - v_existing.price);
      v_price_changed := true;
    END IF;
  ELSE
    -- New listing_id — check fingerprint for relist (L2 dedup)
    SELECT first_listing_id INTO v_fp_first_id
    FROM tav.fingerprints WHERE fingerprint = v_fingerprint;

    IF FOUND THEN
      INSERT INTO tav.relisted_events (fingerprint, original_listing_id, new_listing_id, price_delta)
      SELECT v_fingerprint, v_fp_first_id, v_listing_id,
             v_price - (SELECT price FROM tav.listings WHERE listing_id = v_fp_first_id);
      UPDATE tav.fingerprints
      SET relist_count = relist_count + 1, last_seen_at = now()
      WHERE fingerprint = v_fingerprint;
      v_was_relisted := true;
    ELSE
      INSERT INTO tav.fingerprints (fingerprint, first_listing_id)
      VALUES (v_fingerprint, v_listing_id);
    END IF;

    INSERT INTO tav.listings (
      listing_id, fingerprint, title, price, year, make, model, mileage,
      location_city, location_state, seller_name, seller_id, listing_url,
      photo_url, description, transmission, exterior_color, vehicle_type,
      is_live, is_sold, is_pending, source_task, listed_at, raw
    ) VALUES (
      v_listing_id, v_fingerprint,
      payload->>'title', v_price,
      NULLIF(payload->>'year','')::integer,
      payload->>'make', payload->>'model',
      NULLIF(payload->>'mileage','')::integer,
      payload->>'location_city', payload->>'location_state',
      payload->>'seller_name', payload->>'seller_id',
      payload->>'listing_url', payload->>'photo_url',
      payload->>'description', payload->>'transmission',
      payload->>'exterior_color', payload->>'vehicle_type',
      COALESCE((payload->>'is_live')::boolean,    true),
      COALESCE((payload->>'is_sold')::boolean,    false),
      COALESCE((payload->>'is_pending')::boolean, false),
      payload->>'source_task',
      NULLIF(payload->>'listed_at','')::timestamptz,
      payload->'raw'
    );

    INSERT INTO tav.lead_state (listing_id, status)
    VALUES (v_listing_id, 'new') ON CONFLICT DO NOTHING;
    v_inserted := true;
  END IF;

  -- L3 history snapshot
  INSERT INTO tav.listings_history (listing_id, price, is_live, is_sold, is_pending)
  VALUES (
    v_listing_id, v_price,
    (payload->>'is_live')::boolean,
    (payload->>'is_sold')::boolean,
    COALESCE((payload->>'is_pending')::boolean, false)
  );

  -- Side-effect: persist MMR fields (Phase 5.8). Never blocks ingest.
  BEGIN
    UPDATE tav.listings SET
      vin            = COALESCE(NULLIF(payload->>'vin',''),                      vin),
      mmr            = COALESCE(NULLIF(payload->>'mmr','')::int,                 mmr),
      mmr_adjusted   = COALESCE(NULLIF(payload->>'mmr_adjusted','')::int,        mmr_adjusted),
      mmr_source     = COALESCE(NULLIF(payload->>'mmr_source',''),               mmr_source),
      mmr_confidence = COALESCE(NULLIF(payload->>'mmr_confidence',''),           mmr_confidence),
      mmr_fetched_at = COALESCE(NULLIF(payload->>'mmr_fetched_at','')::timestamptz, mmr_fetched_at),
      deal_grade     = COALESCE(NULLIF(payload->>'deal_grade',''),               deal_grade)
    WHERE listing_id = v_listing_id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Side-effect: compute deal_score (Phase 5.9c). Never blocks ingest.
  BEGIN
    v_score_result := tav.compute_deal_score(v_listing_id);
    IF v_score_result ? 'score' AND (v_score_result->>'score') IS NOT NULL THEN
      UPDATE tav.listings SET
        deal_score             = (v_score_result->>'score')::integer,
        deal_score_components  = v_score_result,
        deal_score_computed_at = now()
      WHERE listing_id = v_listing_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Side-effect: write per-item metrics (Phase 5.7 + 5.8). Never blocks ingest.
  BEGIN
    INSERT INTO tav.item_metrics
      (scenario_run_id, apify_run_id, listing_id, outcome,
       apify_listed_at, normalizer_received_at, normalizer_duration_ms, worker_version,
       mmr_outcome, mmr_lookup_ms, deal_grade, mmr_confidence)
    VALUES (
      payload->>'scenario_run_id',
      payload->>'apify_run_id',
      v_listing_id,
      CASE
        WHEN v_inserted     THEN 'inserted'
        WHEN v_was_relisted THEN 'relisted'
        WHEN v_price_changed OR v_updated THEN 'updated'
        ELSE 'no_change'
      END,
      NULLIF(payload->>'listed_at','')::timestamptz,
      NULLIF(payload->>'normalizer_received_at','')::timestamptz,
      NULLIF(payload->>'normalizer_duration_ms','')::int,
      payload->>'worker_version',
      payload->>'mmr_outcome',
      NULLIF(payload->>'mmr_lookup_ms','')::int,
      payload->>'deal_grade',
      payload->>'mmr_confidence'
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok',            true,
    'listing_id',    v_listing_id,
    'inserted',      v_inserted,
    'updated',       v_updated,
    'was_relisted',  v_was_relisted,
    'price_changed', v_price_changed
  );

EXCEPTION WHEN OTHERS THEN
  -- Catch-all: route to dead_letter, stamp item_metrics, never crash Make
  v_dl_id := tav.log_dead_letter('upsert_listing', 'coerce_failed', NULL,
                                 v_payload_version, payload, SQLERRM);
  BEGIN
    INSERT INTO tav.item_metrics
      (scenario_run_id, apify_run_id, listing_id, outcome,
       apify_listed_at, normalizer_received_at, normalizer_duration_ms, worker_version)
    VALUES (
      payload->>'scenario_run_id',
      payload->>'apify_run_id',
      v_listing_id,
      'dead_letter',
      NULLIF(payload->>'listed_at','')::timestamptz,
      NULLIF(payload->>'normalizer_received_at','')::timestamptz,
      NULLIF(payload->>'normalizer_duration_ms','')::int,
      payload->>'worker_version'
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN jsonb_build_object('ok', false, 'reason', 'coerce_failed',
                            'error', SQLERRM, 'dead_letter_id', v_dl_id);
END;
$$;
GRANT EXECUTE ON FUNCTION tav.upsert_listing(jsonb) TO service_role;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active listings inbox (last 30d, live + unsold)
CREATE OR REPLACE VIEW tav.v_active_inbox AS
SELECT
  l.listing_id, l.title, l.price, l.year, l.make, l.model, l.mileage,
  l.location_city, l.location_state, l.seller_name,
  l.listing_url, l.photo_url,
  (l.listed_at      AT TIME ZONE 'America/Chicago') AS listed_at,
  (l.first_seen_at  AT TIME ZONE 'America/Chicago') AS first_seen_at,
  (l.last_seen_at   AT TIME ZONE 'America/Chicago') AS last_seen_at,
  l.source_task, l.is_live, l.is_sold,
  l.vin, l.mmr, l.mmr_adjusted, l.mmr_source, l.mmr_confidence, l.deal_grade,
  l.deal_score, l.deal_score_components,
  (l.deal_score_computed_at AT TIME ZONE 'America/Chicago') AS deal_score_computed_at,
  (l.price - l.mmr_adjusted)  AS price_minus_mmr_adj,
  s.status                    AS lead_status,
  f.relist_count,
  (SELECT count(*) FROM tav.price_changes pc WHERE pc.listing_id = l.listing_id)
                              AS price_change_count
FROM tav.listings l
LEFT JOIN tav.lead_state   s ON s.listing_id = l.listing_id
LEFT JOIN tav.fingerprints f ON f.fingerprint = l.fingerprint
WHERE l.is_live = true AND l.is_sold = false
  AND l.first_seen_at > now() - interval '30 days'
ORDER BY l.first_seen_at DESC;

-- Motivated sellers (relisted ≥2 times)
CREATE OR REPLACE VIEW tav.v_motivated_sellers AS
SELECT f.fingerprint, f.first_listing_id, f.relist_count, f.last_seen_at,
       l.title, l.year, l.make, l.model, l.location_city
FROM tav.fingerprints f
JOIN tav.listings l ON l.listing_id = f.first_listing_id
WHERE f.relist_count >= 2
ORDER BY f.relist_count DESC, f.last_seen_at DESC;

-- Phase 5.9d: Deal inbox (steal+great+high-score+pending fresh listings)
CREATE OR REPLACE VIEW tav.v_deal_inbox AS
SELECT
  l.listing_id, l.title, l.price, l.mmr, l.mmr_adjusted,
  (l.price - l.mmr_adjusted)                                    AS price_minus_mmr_adj,
  l.deal_grade, l.deal_score, l.deal_score_components,
  l.mmr_confidence, l.mmr_source,
  l.year, l.make, l.model, l.mileage,
  l.location_city, l.location_state, l.seller_name,
  l.listing_url, l.photo_url,
  (l.first_seen_at AT TIME ZONE 'America/Chicago')              AS first_seen_at,
  (l.last_seen_at  AT TIME ZONE 'America/Chicago')              AS last_seen_at,
  EXTRACT(EPOCH FROM (now() - l.first_seen_at))/86400.0          AS age_days,
  COALESCE(f.relist_count, 0)                                    AS relist_count,
  (SELECT count(*) FROM tav.price_changes pc WHERE pc.listing_id = l.listing_id
                                                AND pc.delta < 0
                                                AND pc.changed_at > now() - interval '30 days')
                                                                 AS price_drops_30d,
  s.status AS lead_status,
  CASE
    WHEN l.mmr IS NULL
     AND l.first_seen_at > now() - interval '5 minutes'
     AND EXISTS (SELECT 1 FROM tav.mmr_retry_queue q WHERE q.listing_id = l.listing_id)
      THEN 'pending'
    WHEN l.mmr IS NULL THEN 'unknown'
    ELSE 'enriched'
  END                                                            AS enrichment_status
FROM tav.listings l
LEFT JOIN tav.fingerprints f ON f.fingerprint = l.fingerprint
LEFT JOIN tav.lead_state    s ON s.listing_id  = l.listing_id
WHERE l.is_live = true AND l.is_sold = false
  AND (
        l.deal_grade IN ('steal','great')
     OR l.deal_score >= 70
     OR (l.mmr IS NULL AND l.first_seen_at > now() - interval '5 minutes')
      )
  AND l.first_seen_at > now() - interval '14 days'
ORDER BY
  CASE WHEN l.mmr IS NULL AND l.first_seen_at > now() - interval '5 minutes'
       THEN 0 ELSE 1 END,
  l.deal_score DESC NULLS LAST,
  CASE l.deal_grade WHEN 'steal' THEN 0 WHEN 'great' THEN 1 ELSE 2 END,
  CASE l.mmr_confidence WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
  l.first_seen_at DESC;
GRANT SELECT ON tav.v_deal_inbox TO authenticated, anon, service_role;

-- Phase 5.7: Ops dashboard (last 24h rolling)
CREATE OR REPLACE VIEW tav.v_ops_dashboard AS
WITH last24 AS (
  SELECT * FROM tav.item_metrics WHERE db_written_at > now() - interval '24 hours'
),
runs24 AS (
  SELECT * FROM tav.run_metrics WHERE finished_at > now() - interval '24 hours'
),
scen24 AS (
  SELECT * FROM tav.scenario_metrics WHERE finished_at > now() - interval '24 hours'
),
dl24 AS (
  SELECT count(*) AS dead_letter_count FROM tav.dead_letter
  WHERE occurred_at > now() - interval '24 hours'
)
SELECT
  (SELECT count(*) FROM runs24)                                                   AS apify_runs_24h,
  (SELECT count(*) FROM runs24 WHERE apify_status = 'SUCCEEDED')                  AS apify_runs_success_24h,
  (SELECT count(*) FILTER (WHERE apify_status NOT IN ('SUCCEEDED')) FROM runs24)  AS apify_runs_failed_24h,
  (SELECT count(*) FROM scen24)                                                   AS scenario_runs_24h,
  (SELECT sum(items_returned) FROM runs24)                                        AS items_returned_24h,
  (SELECT count(*) FROM last24)                                                   AS items_processed_24h,
  (SELECT count(*) FROM last24 WHERE outcome = 'inserted')                        AS items_inserted_24h,
  (SELECT count(*) FROM last24 WHERE outcome IN ('updated','relisted'))           AS items_updated_24h,
  (SELECT dead_letter_count FROM dl24)                                            AS dead_letter_24h,
  ROUND(100.0 *
    NULLIF((SELECT dead_letter_count FROM dl24), 0)::numeric
    / NULLIF((SELECT count(*) FROM last24) + (SELECT dead_letter_count FROM dl24), 0), 2)
                                                                                  AS failure_pct_24h,
  (SELECT percentile_cont(0.50) WITHIN GROUP (ORDER BY e2e_latency_seconds)
     FROM last24 WHERE e2e_latency_seconds IS NOT NULL
                   AND e2e_latency_seconds BETWEEN 0 AND 86400)                   AS p50_latency_seconds,
  (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY e2e_latency_seconds)
     FROM last24 WHERE e2e_latency_seconds IS NOT NULL
                   AND e2e_latency_seconds BETWEEN 0 AND 86400)                   AS p95_latency_seconds,
  (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY normalizer_duration_ms)
     FROM last24 WHERE normalizer_duration_ms IS NOT NULL)                        AS p95_normalizer_ms,
  (SELECT sum(apify_cost_usd) FROM runs24)                                        AS apify_cost_24h_usd,
  (SELECT round(avg(apify_cost_usd)::numeric, 4) FROM runs24
     WHERE apify_status = 'SUCCEEDED' AND apify_cost_usd IS NOT NULL)             AS avg_cost_per_run_usd,
  (SELECT round((sum(apify_cost_usd) / NULLIF((SELECT count(*) FROM last24
     WHERE outcome IN ('inserted','updated','relisted')), 0))::numeric, 4)
     FROM runs24)                                                                 AS cost_per_good_listing_usd,
  (SELECT round(avg(items_returned)::numeric, 1) FROM runs24
     WHERE apify_status = 'SUCCEEDED')                                            AS avg_items_per_run,
  (SELECT max(db_written_at) FROM tav.item_metrics)                              AS last_item_written_at,
  (SELECT max(finished_at)   FROM tav.run_metrics)                               AS last_apify_run_at,
  now()                                                                           AS dashboard_generated_at;
GRANT SELECT ON tav.v_ops_dashboard TO authenticated, anon, service_role;

-- Per-cluster breakdown
CREATE OR REPLACE VIEW tav.v_ops_by_cluster AS
SELECT
  cluster,
  count(*)                                             AS runs_24h,
  count(*) FILTER (WHERE apify_status = 'SUCCEEDED')  AS runs_success_24h,
  sum(items_returned)                                  AS items_24h,
  round(avg(apify_cost_usd)::numeric, 4)               AS avg_cost_usd,
  max(finished_at)                                     AS last_run_at
FROM tav.run_metrics
WHERE finished_at > now() - interval '24 hours'
GROUP BY cluster
ORDER BY cluster;
GRANT SELECT ON tav.v_ops_by_cluster TO authenticated, anon, service_role;

-- Phase 5.8: MMR coverage + deal counts
CREATE OR REPLACE VIEW tav.v_ops_dashboard_mmr AS
WITH last24 AS (
  SELECT * FROM tav.item_metrics WHERE db_written_at > now() - interval '24 hours'
)
SELECT
  (SELECT count(*) FROM last24)                                                           AS items_24h,
  (SELECT count(*) FROM last24 WHERE mmr_outcome IN ('vin_hit','ymm_hit'))                AS mmr_hits_24h,
  (SELECT count(*) FROM last24 WHERE mmr_outcome = 'vin_hit')                             AS mmr_vin_hits_24h,
  (SELECT count(*) FROM last24 WHERE mmr_outcome = 'ymm_hit')                             AS mmr_ymm_hits_24h,
  (SELECT count(*) FROM last24 WHERE mmr_outcome = 'miss')                                AS mmr_misses_24h,
  (SELECT count(*) FROM last24 WHERE mmr_outcome = 'skip_no_miles')                       AS mmr_skipped_24h,
  ROUND(100.0 *
    NULLIF((SELECT count(*) FROM last24 WHERE mmr_outcome IN ('vin_hit','ymm_hit')), 0)::numeric
    / NULLIF((SELECT count(*) FROM last24 WHERE mmr_outcome IN ('vin_hit','ymm_hit','miss')), 0), 1)
                                                                                          AS mmr_hit_rate_pct_24h,
  (SELECT percentile_cont(0.50) WITHIN GROUP (ORDER BY mmr_lookup_ms)
     FROM last24 WHERE mmr_lookup_ms IS NOT NULL)                                          AS p50_mmr_lookup_ms,
  (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY mmr_lookup_ms)
     FROM last24 WHERE mmr_lookup_ms IS NOT NULL)                                          AS p95_mmr_lookup_ms,
  (SELECT count(*) FROM last24 WHERE deal_grade = 'steal')                                 AS deals_steal_24h,
  (SELECT count(*) FROM last24 WHERE deal_grade = 'great')                                 AS deals_great_24h,
  (SELECT count(*) FROM last24 WHERE deal_grade = 'good')                                  AS deals_good_24h,
  (SELECT count(*) FROM last24 WHERE deal_grade = 'fair')                                  AS deals_fair_24h,
  (SELECT count(*) FROM last24 WHERE deal_grade = 'pass')                                  AS deals_pass_24h,
  (SELECT count(*) FROM tav.mmr_retry_queue WHERE exhausted = false)                       AS mmr_retry_queue_open,
  (SELECT count(*) FROM tav.mmr_retry_queue WHERE exhausted = true)                        AS mmr_retry_queue_exhausted,
  now()                                                                                    AS dashboard_generated_at;
GRANT SELECT ON tav.v_ops_dashboard_mmr TO authenticated, anon, service_role;

-- Phase 5.9b: Storage health view (Pro thresholds: 8GB DB)
CREATE OR REPLACE VIEW tav.v_storage_health AS
WITH sizes AS (
  SELECT
    pg_database_size(current_database())                           AS db_bytes,
    (SELECT sum(pg_total_relation_size(c.oid))
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'tav' AND c.relkind = 'r')                AS tav_bytes
)
SELECT
  ROUND(db_bytes  / 1024.0 / 1024.0, 1)                               AS db_size_mb,
  ROUND(db_bytes  / 1024.0 / 1024.0 / 1024.0, 2)                      AS db_size_gb,
  ROUND(tav_bytes / 1024.0 / 1024.0, 1)                               AS tav_size_mb,
  ROUND(100.0 * db_bytes / (8.0 * 1024 * 1024 * 1024), 1)             AS db_pct_of_8gb,
  CASE
    WHEN db_bytes >= 7.5 * 1024 * 1024 * 1024 THEN 'page'
    WHEN db_bytes >= 6.0 * 1024 * 1024 * 1024 THEN 'warn'
    ELSE 'ok'
  END                                                                 AS db_status,
  GREATEST(0, ROUND((db_bytes / 1024.0 / 1024.0 / 1024.0) - 8, 2))    AS db_overage_gb,
  ROUND(GREATEST(0, (db_bytes / 1024.0 / 1024.0 / 1024.0) - 8) * 0.125, 2)
                                                                       AS db_overage_usd_estimate,
  now()                                                               AS generated_at
FROM sizes;
GRANT SELECT ON tav.v_storage_health TO authenticated, anon, service_role;

-- Phase 5.9b: Compute health view (Small instance: 2 vCPU)
CREATE OR REPLACE VIEW tav.v_compute_health AS
SELECT
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'active')               AS active_conns,
  (SELECT count(*) FROM pg_stat_activity)                                      AS total_conns,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections')        AS max_conns,
  ROUND(100.0 *
    (SELECT count(*) FROM pg_stat_activity)::numeric
    / NULLIF((SELECT setting::int FROM pg_settings WHERE name = 'max_connections'), 0), 1)
                                                                                AS conn_pct,
  ROUND(100.0 *
    sum(heap_blks_hit)::numeric
    / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2)                  AS cache_hit_pct,
  (SELECT count(*) FROM pg_stat_activity
   WHERE wait_event_type IS NOT NULL AND state = 'active')                     AS waiting_now,
  CASE
    WHEN ROUND(100.0 *
           (SELECT count(*) FROM pg_stat_activity)::numeric
           / NULLIF((SELECT setting::int FROM pg_settings WHERE name = 'max_connections'), 0), 1)
         > 80 THEN 'page'
    WHEN ROUND(100.0 *
           sum(heap_blks_hit)::numeric
           / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) < 95 THEN 'warn'
    ELSE 'ok'
  END                                                                          AS compute_status,
  now()                                                                         AS generated_at
FROM pg_statio_user_tables;
GRANT SELECT ON tav.v_compute_health TO authenticated, anon, service_role;

-- Phase 5.9c: Score distribution for ops dashboard
CREATE OR REPLACE VIEW tav.v_ops_dashboard_score AS
SELECT
  (SELECT count(*) FROM tav.listings WHERE is_live = true AND is_sold = false
                                       AND deal_score >= 85)             AS score_85_plus,
  (SELECT count(*) FROM tav.listings WHERE is_live = true AND is_sold = false
                                       AND deal_score BETWEEN 70 AND 84) AS score_70_84,
  (SELECT count(*) FROM tav.listings WHERE is_live = true AND is_sold = false
                                       AND deal_score BETWEEN 55 AND 69) AS score_55_69,
  (SELECT count(*) FROM tav.listings WHERE is_live = true AND is_sold = false
                                       AND deal_score BETWEEN 40 AND 54) AS score_40_54,
  (SELECT count(*) FROM tav.listings WHERE is_live = true AND is_sold = false
                                       AND deal_score < 40)              AS score_under_40,
  (SELECT count(*) FROM tav.listings WHERE is_live = true AND is_sold = false
                                       AND deal_score IS NULL)           AS score_null,
  (SELECT ROUND(avg(deal_score), 1) FROM tav.listings
     WHERE is_live = true AND is_sold = false AND deal_score IS NOT NULL) AS avg_score_active,
  (SELECT ROUND(avg(deal_score), 1) FROM tav.listings
     WHERE first_seen_at > now() - interval '24 hours' AND deal_score IS NOT NULL)
                                                                         AS avg_score_24h,
  now()                                                                   AS generated_at;
GRANT SELECT ON tav.v_ops_dashboard_score TO authenticated, anon, service_role;

-- Phase 5.9d: Latency dashboard
CREATE OR REPLACE VIEW tav.v_ops_dashboard_latency AS
WITH lat24 AS (
  SELECT e2e_latency_seconds AS to_pg_seconds
    FROM tav.item_metrics
   WHERE db_written_at > now() - interval '24 hours'
     AND e2e_latency_seconds BETWEEN 0 AND 86400
),
enrich24 AS (
  SELECT EXTRACT(EPOCH FROM (l.mmr_fetched_at - l.first_seen_at))::numeric AS to_enriched_seconds
    FROM tav.listings l
   WHERE l.mmr_fetched_at IS NOT NULL
     AND l.first_seen_at  > now() - interval '24 hours'
     AND l.mmr_fetched_at >= l.first_seen_at
     AND EXTRACT(EPOCH FROM (l.mmr_fetched_at - l.first_seen_at)) < 3600
),
pending_now AS (
  SELECT count(*) AS pending_count
    FROM tav.listings l
   WHERE l.is_live = true AND l.is_sold = false
     AND l.mmr IS NULL
     AND l.mileage IS NOT NULL
     AND l.first_seen_at > now() - interval '5 minutes'
)
SELECT
  (SELECT percentile_cont(0.50) WITHIN GROUP (ORDER BY to_pg_seconds) FROM lat24)
                                                              AS p50_to_postgres_seconds,
  (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY to_pg_seconds) FROM lat24)
                                                              AS p95_to_postgres_seconds,
  (SELECT percentile_cont(0.50) WITHIN GROUP (ORDER BY to_enriched_seconds) FROM enrich24)
                                                              AS p50_to_enriched_seconds,
  (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY to_enriched_seconds) FROM enrich24)
                                                              AS p95_to_enriched_seconds,
  (SELECT pending_count FROM pending_now)                     AS pending_listings_now,
  300::int                                                    AS p95_to_postgres_target_seconds,
  60::int                                                     AS p95_to_enriched_target_seconds,
  now()                                                       AS generated_at;
GRANT SELECT ON tav.v_ops_dashboard_latency TO authenticated, anon, service_role;

-- Phase 5.9e: Operating envelope — single-row consolidated watchdog
CREATE OR REPLACE VIEW tav.v_ops_envelope AS
WITH
  apify AS (
    SELECT
      (SELECT sum(apify_cost_usd) FROM tav.run_metrics
         WHERE finished_at > now() - interval '24 hours')            AS cost_24h_usd,
      tav.envelope_num('envelope_apify_cap_usd',  200)               AS cap_usd,
      tav.envelope_num('envelope_apify_warn_usd', 160)               AS warn_usd
  ),
  make AS (
    SELECT
      ((SELECT count(*) FROM tav.item_metrics
          WHERE db_written_at > now() - interval '24 hours') * 30::bigint
        * tav.envelope_num('envelope_make_credits_per_item', 2)
      + (SELECT count(*) FROM tav.run_metrics
          WHERE finished_at > now() - interval '24 hours') * 30::bigint
        * tav.envelope_num('envelope_make_credits_fixed_per_run', 4)) AS ops_projected_30d,
      tav.envelope_num('envelope_make_p9_trigger_usd', 500)          AS p9_trigger_usd,
      tav.envelope_num('envelope_make_warn_usd',       400)          AS warn_usd
  ),
  worker AS (
    SELECT
      (SELECT count(*) FROM tav.item_metrics
         WHERE db_written_at > now() - interval '24 hours')          AS req_24h,
      tav.envelope_num('envelope_worker_req_warn',   50000)          AS warn_req,
      tav.envelope_num('envelope_worker_req_page',   70000)          AS page_req,
      tav.envelope_num('envelope_worker_free_cap',  100000)          AS free_cap
  ),
  manheim AS (
    SELECT
      (SELECT count(*) FROM tav.item_metrics
         WHERE db_written_at > now() - interval '24 hours'
           AND mmr_outcome IS NOT NULL
           AND mmr_outcome NOT IN ('skip_no_miles','cache_hit'))     AS calls_24h,
      tav.envelope_num('envelope_manheim_daily_cap', 2000000)        AS cap_calls,
      tav.envelope_num('envelope_manheim_warn',      1500000)        AS warn_calls
  ),
  supa AS (
    SELECT
      (SELECT db_size_gb FROM tav.v_storage_health)                  AS db_gb,
      tav.envelope_num('envelope_supabase_db_cap_gb',  8)            AS cap_gb,
      tav.envelope_num('envelope_supabase_db_warn_gb', 6)            AS warn_gb
  )
SELECT
  -- Apify
  ROUND((SELECT cost_24h_usd * 30 FROM apify)::numeric, 2)                AS apify_projected_usd,
  (SELECT cap_usd  FROM apify)::numeric                                   AS apify_cap_usd,
  (SELECT ROUND(100.0 * cost_24h_usd * 30 / NULLIF(cap_usd,0), 1) FROM apify)
                                                                          AS apify_pct_of_cap,
  CASE
    WHEN (SELECT cost_24h_usd * 30 FROM apify) >= (SELECT cap_usd  FROM apify) THEN 'page'
    WHEN (SELECT cost_24h_usd * 30 FROM apify) >= (SELECT warn_usd FROM apify) THEN 'warn'
    ELSE 'ok'
  END                                                                     AS apify_status,

  -- Make.com
  (SELECT ops_projected_30d FROM make)                                    AS make_ops_projected_30d,
  ROUND(((SELECT ops_projected_30d FROM make)::numeric * 180.53 / 150000)::numeric, 2)
                                                                          AS make_projected_usd,
  (SELECT p9_trigger_usd FROM make)::numeric                             AS make_p9_trigger_usd,
  CASE
    WHEN ((SELECT ops_projected_30d FROM make)::numeric * 180.53 / 150000)
         >= (SELECT p9_trigger_usd FROM make) THEN 'page'
    WHEN ((SELECT ops_projected_30d FROM make)::numeric * 180.53 / 150000)
         >= (SELECT warn_usd FROM make) THEN 'warn'
    ELSE 'ok'
  END                                                                     AS make_status,

  -- Cloudflare Worker
  (SELECT req_24h FROM worker)                                            AS worker_requests_24h,
  (SELECT free_cap FROM worker)::int                                      AS worker_free_cap_24h,
  ROUND(100.0 * (SELECT req_24h FROM worker) / NULLIF((SELECT free_cap FROM worker),0), 1)
                                                                          AS worker_pct_of_free,
  CASE
    WHEN (SELECT req_24h FROM worker) >= (SELECT page_req FROM worker) THEN 'page'
    WHEN (SELECT req_24h FROM worker) >= (SELECT warn_req FROM worker) THEN 'warn'
    ELSE 'ok'
  END                                                                     AS worker_status,

  -- Manheim
  (SELECT calls_24h FROM manheim)                                         AS manheim_calls_24h,
  (SELECT cap_calls FROM manheim)::bigint                                 AS manheim_daily_cap,
  ROUND(100.0 * (SELECT calls_24h FROM manheim) / NULLIF((SELECT cap_calls FROM manheim),0), 2)
                                                                          AS manheim_pct_of_cap,
  CASE
    WHEN (SELECT calls_24h FROM manheim) >= (SELECT cap_calls  FROM manheim) THEN 'page'
    WHEN (SELECT calls_24h FROM manheim) >= (SELECT warn_calls FROM manheim) THEN 'warn'
    ELSE 'ok'
  END                                                                     AS manheim_status,

  -- Supabase DB size
  (SELECT db_gb FROM supa)                                                AS supabase_db_gb,
  (SELECT cap_gb FROM supa)::numeric                                      AS supabase_db_cap_gb,
  ROUND(100.0 * (SELECT db_gb FROM supa) / NULLIF((SELECT cap_gb FROM supa),0), 1)
                                                                          AS supabase_pct_of_included,
  CASE
    WHEN (SELECT db_gb FROM supa) >= (SELECT cap_gb  FROM supa) THEN 'page'
    WHEN (SELECT db_gb FROM supa) >= (SELECT warn_gb FROM supa) THEN 'warn'
    ELSE 'ok'
  END                                                                     AS supabase_status,

  -- Overall worst-wins
  CASE
    WHEN 'page' = ANY (ARRAY[
      CASE WHEN (SELECT cost_24h_usd * 30 FROM apify) >= (SELECT cap_usd  FROM apify) THEN 'page' ELSE '' END,
      CASE WHEN ((SELECT ops_projected_30d FROM make)::numeric * 180.53 / 150000) >= (SELECT p9_trigger_usd FROM make) THEN 'page' ELSE '' END,
      CASE WHEN (SELECT req_24h FROM worker) >= (SELECT page_req FROM worker) THEN 'page' ELSE '' END,
      CASE WHEN (SELECT calls_24h FROM manheim) >= (SELECT cap_calls FROM manheim) THEN 'page' ELSE '' END,
      CASE WHEN (SELECT db_gb FROM supa) >= (SELECT cap_gb FROM supa) THEN 'page' ELSE '' END
    ]) THEN 'page'
    WHEN 'warn' = ANY (ARRAY[
      CASE WHEN (SELECT cost_24h_usd * 30 FROM apify) >= (SELECT warn_usd FROM apify) THEN 'warn' ELSE '' END,
      CASE WHEN ((SELECT ops_projected_30d FROM make)::numeric * 180.53 / 150000) >= (SELECT warn_usd FROM make) THEN 'warn' ELSE '' END,
      CASE WHEN (SELECT req_24h FROM worker) >= (SELECT warn_req FROM worker) THEN 'warn' ELSE '' END,
      CASE WHEN (SELECT calls_24h FROM manheim) >= (SELECT warn_calls FROM manheim) THEN 'warn' ELSE '' END,
      CASE WHEN (SELECT db_gb FROM supa) >= (SELECT warn_gb FROM supa) THEN 'warn' ELSE '' END
    ]) THEN 'warn'
    ELSE 'ok'
  END                                                                     AS overall_status,

  'ops'::text                                                              AS _pk,
  now()                                                                    AS generated_at;
GRANT SELECT ON tav.v_ops_envelope TO authenticated, anon, service_role;

-- Phase 5.9e: Long-format envelope (5-row table for AppSheet)
CREATE OR REPLACE VIEW tav.v_ops_envelope_lines AS
SELECT 'apify'::text AS service, 'Apify (compute)'::text AS label,
       apify_projected_usd::numeric     AS projected_value,
       'usd/mo'::text                   AS unit,
       apify_cap_usd::numeric           AS cap_value,
       apify_pct_of_cap                 AS pct_of_cap,
       apify_status                     AS status,
       'Hard-capped in Apify Billing — pause runs at the cap'::text AS remediation
  FROM tav.v_ops_envelope
UNION ALL
SELECT 'make', 'Make.com (Pro ops)',
       make_projected_usd, 'usd/mo',
       make_p9_trigger_usd,
       ROUND(100.0 * make_projected_usd / NULLIF(make_p9_trigger_usd,0), 1),
       make_status,
       'Phase 9 (Apify→Worker direct + CF Queue) planned for first billing cycle; >$500 = escalate'
  FROM tav.v_ops_envelope
UNION ALL
SELECT 'worker', 'Cloudflare Worker (free initially)',
       worker_requests_24h::numeric, 'req/day',
       worker_free_cap_24h::numeric, worker_pct_of_free,
       worker_status,
       'Above 70K/day → enable paid plan ($5–10/mo acceptable)'
  FROM tav.v_ops_envelope
UNION ALL
SELECT 'manheim', 'Manheim Mashery (PROD)',
       manheim_calls_24h::numeric, 'calls/day',
       manheim_daily_cap::numeric, manheim_pct_of_cap,
       manheim_status,
       'Phase 5.10 circuit breaker engages on rate-limit response'
  FROM tav.v_ops_envelope
UNION ALL
SELECT 'supabase', 'Supabase Pro (DB size)',
       supabase_db_gb, 'gb',
       supabase_db_cap_gb, supabase_pct_of_included,
       supabase_status,
       'Overage billed at $0.125/GB-mo over 8GB; pruning runs nightly'
  FROM tav.v_ops_envelope;
GRANT SELECT ON tav.v_ops_envelope_lines TO authenticated, anon, service_role;

-- ============================================================================
-- pg_cron: schedule all background jobs (idempotent — unschedule before re-add)
-- ============================================================================
DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job
  WHERE jobname IN (
    'tav-drift-check',
    'tav-poll-apify-costs',
    'tav-reap-apify-costs',
    'tav-retry-mmr',
    'tav-reap-mmr-retry',
    'tav-prune',
    'tav-refresh-scores'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Drift check: 09:00 UTC = 04:00 CDT / 03:00 CST
SELECT cron.schedule('tav-drift-check',      '0 9 * * *',    $$ SELECT tav.run_drift_check(); $$);
-- Apify cost poller: :15 past every hour; reaper: :20
SELECT cron.schedule('tav-poll-apify-costs', '15 * * * *',   $$ SELECT tav.poll_apify_costs(); $$);
SELECT cron.schedule('tav-reap-apify-costs', '20 * * * *',   $$ SELECT tav.reap_apify_cost_responses(); $$);
-- MMR retry: :30 past every hour; reaper: :35
SELECT cron.schedule('tav-retry-mmr',        '30 * * * *',   $$ SELECT tav.retry_failed_mmr(); $$);
SELECT cron.schedule('tav-reap-mmr-retry',   '35 * * * *',   $$ SELECT tav.reap_mmr_retry_responses(); $$);
-- Prune: 08:00 UTC daily = 03:00 CDT / 02:00 CST
SELECT cron.schedule('tav-prune',            '0 8 * * *',    $$ SELECT tav.prune_old_data(); $$);
-- Score refresh: 08:15 UTC daily (15 min after prune)
SELECT cron.schedule('tav-refresh-scores',   '15 8 * * *',   $$ SELECT tav.refresh_all_deal_scores(); $$);

-- ============================================================================
-- Phase 5.9b: pg_net tuning
-- NOTE: pg_net.ttl and pg_net.batch_size are managed by Supabase internally
-- and cannot be set via ALTER ROLE from the SQL Editor. The Pro plan already
-- ships with extended TTL. No action needed here.
-- ============================================================================

-- ============================================================================
-- VERIFY: list scheduled jobs
-- ============================================================================
SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'tav-%' ORDER BY jobname;
