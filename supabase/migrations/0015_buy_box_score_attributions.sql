-- =============================================================================
-- Migration 0015 — Add tav.buy_box_score_attributions table
--
-- When a lead is scored, the hybrid_score is the result of combining a
-- rule-based score, a segment demand score, and a market demand score.
-- Storing the component breakdown at scoring time enables post-hoc analysis
-- of which signal drove purchase decisions and supports future rule tuning.
--
-- This is an append-only audit table — rows are never updated. A lead may
-- have multiple rows if it is re-scored (e.g., after a price change).
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.buy_box_score_attributions (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid    NOT NULL REFERENCES tav.leads (id),
  rule_id         text,                  -- text rule identifier (e.g. 'camry_under_150k')
  rule_version    integer,               -- version of the rule at scoring time
  rule_score      integer,               -- raw score from the rule match
  segment_score   integer,               -- score from segment demand index
  demand_score    integer,               -- score from region demand index
  hybrid_score    integer NOT NULL,      -- final blended score written to leads.buy_box_score
  components      jsonb   NOT NULL DEFAULT '{}',  -- full breakdown for debugging
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Supports "all score snapshots for a lead" queries and joining back to leads
CREATE INDEX IF NOT EXISTS buy_box_score_attributions_lead_id_idx
  ON tav.buy_box_score_attributions (lead_id);
