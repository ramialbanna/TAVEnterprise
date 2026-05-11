-- =============================================================================
-- Migration 0037 — vehicle enrichment table + replay anchor columns
--
-- vehicle_enrichments: stores structured data fetched from external sources
-- for a vehicle candidate. Each row is one enrichment event; the same source
-- may produce multiple rows over time (history) or be refreshed (expires_at).
--
-- Replay anchors: adds week-label columns to leads and buy_box_score_attributions
-- so scoring replays can be compared against the data snapshot that was active
-- at the time of the original calculation.
-- =============================================================================

CREATE TABLE tav.vehicle_enrichments (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_candidate_id uuid        NOT NULL REFERENCES tav.vehicle_candidates (id) ON DELETE CASCADE,
  enrichment_source    text        NOT NULL
    CHECK (enrichment_source IN (
      'manheim_vin_decode',
      'manheim_auction_history',
      'manheim_condition_report',
      'manual'
    )),
  enrichment_type      text        NOT NULL
    CHECK (enrichment_type IN (
      'vin_decode',
      'auction_history',
      'condition_report',
      'title_status',
      'manual_note'
    )),
  payload              jsonb       NOT NULL DEFAULT '{}',
  fetched_at           timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON tav.vehicle_enrichments (vehicle_candidate_id);

CREATE INDEX ON tav.vehicle_enrichments (enrichment_source, enrichment_type);

CREATE INDEX ON tav.vehicle_enrichments (expires_at)
  WHERE expires_at IS NOT NULL;

-- Replay anchor on leads: records which scoring-data week was active when the
-- lead score was computed.
ALTER TABLE tav.leads
  ADD COLUMN scoring_week_label text;

-- Replay anchors on buy_box_score_attributions: records the demand and segment
-- snapshot weeks used at attribution time.
ALTER TABLE tav.buy_box_score_attributions
  ADD COLUMN demand_week_label      text,
  ADD COLUMN segment_snapshot_week  text;

GRANT SELECT, INSERT, UPDATE ON tav.vehicle_enrichments TO service_role;
