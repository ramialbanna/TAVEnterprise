-- =============================================================================
-- Migration 0069 — LLM Y/M/M/S token usage + offline_hit outcome (§70)
-- =============================================================================

ALTER TABLE tav.llm_ymms_decisions
  DROP CONSTRAINT IF EXISTS llm_ymms_decisions_outcome_check;

ALTER TABLE tav.llm_ymms_decisions
  ADD CONSTRAINT llm_ymms_decisions_outcome_check
  CHECK (outcome IN (
    'alias_hit',
    'offline_hit',
    'llm_hit',
    'llm_needs_review',
    'llm_invalid_pick',
    'fallback'
  ));

ALTER TABLE tav.llm_ymms_decisions
  ADD COLUMN IF NOT EXISTS cache_read_input_tokens integer,
  ADD COLUMN IF NOT EXISTS cache_creation_input_tokens integer,
  ADD COLUMN IF NOT EXISTS uncached_input_tokens integer,
  ADD COLUMN IF NOT EXISTS output_tokens integer;
