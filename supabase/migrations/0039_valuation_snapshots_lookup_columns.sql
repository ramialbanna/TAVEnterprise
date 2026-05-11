-- =============================================================================
-- Migration 0039 — valuation_snapshots: lookup normalization columns
--
-- Adds four nullable columns that record the normalized make/model/trim used
-- for the YMM MMR lookup and the confidence of that normalization.
--
-- lookup_make / lookup_model / lookup_trim:
--   The canonical strings sent to the intelligence worker after G.5.3
--   normalization. NULL on VIN-path rows (normalization not applicable).
--
-- normalization_confidence:
--   Quality of the normalization result:
--     'exact'   — input matched reference data directly
--     'alias'   — input matched via alias table; canonical used
--     'partial' — make resolved but model not found; raw model used
--     'none'    — neither make nor model found; raw values used
--   NULL on VIN-path rows.
-- =============================================================================

ALTER TABLE tav.valuation_snapshots
  ADD COLUMN IF NOT EXISTS lookup_make              text,
  ADD COLUMN IF NOT EXISTS lookup_model             text,
  ADD COLUMN IF NOT EXISTS lookup_trim              text,
  ADD COLUMN IF NOT EXISTS normalization_confidence text
    CHECK (normalization_confidence IN ('exact', 'alias', 'partial', 'none'));
