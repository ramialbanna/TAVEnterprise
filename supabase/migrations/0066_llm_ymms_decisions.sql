-- =============================================================================
-- Migration 0066 — LLM Y/M/M/S decision audit log (item 57)
--
-- Every attempted resolveListingWithLLM call — alias fast-path hit, Claude
-- proposal accepted, Claude proposal rejected by the deterministic gate, or
-- fallback to the offline matcher — gets a row here. This is what Phase 0
-- eval scoring, prompt tuning, and cost tracking read from; it is separate
-- from tav.catalog_match_suggestions (item 55, which only stores the
-- offline scorer's top-3) and from tav.valuation_snapshots (which only
-- records the final MMR hit/miss, not which resolver path produced it).
-- =============================================================================

CREATE TABLE tav.llm_ymms_decisions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_listing_id  uuid REFERENCES tav.normalized_listings (id) ON DELETE CASCADE,
  year                   smallint,
  input_make             text,
  input_model            text,
  input_trim             text,
  input_title            text,
  catalog_row_count      integer,
  outcome                text NOT NULL
    CHECK (outcome IN ('alias_hit', 'llm_hit', 'llm_needs_review', 'llm_invalid_pick', 'fallback')),
  fallback_reason        text,
  proposed_make          text,
  proposed_model         text,
  proposed_style         text,
  confidence             numeric,
  reasoning              text,
  model                  text,
  latency_ms             integer,
  -- Set later once the deterministic-gate/MMR outcome is known downstream —
  -- did the proposal ultimately get sent to Cox as-is.
  accepted               boolean,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX llm_ymms_decisions_listing_idx ON tav.llm_ymms_decisions (normalized_listing_id);
CREATE INDEX llm_ymms_decisions_outcome_idx ON tav.llm_ymms_decisions (outcome);
CREATE INDEX llm_ymms_decisions_created_at_idx ON tav.llm_ymms_decisions (created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON tav.llm_ymms_decisions TO service_role;
