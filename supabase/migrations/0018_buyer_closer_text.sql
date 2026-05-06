-- =============================================================================
-- Migration 0018 — buyer_id: uuid → text; add closer_id text
--
-- buyer_id was originally typed uuid anticipating a future user-management
-- system. In practice the import pipeline receives plain text identifiers
-- (names, short codes) from operational spreadsheets. Keeping uuid would
-- reject every historical import row.
--
-- closer_id captures the sales-closer role separately from the buyer (acquirer)
-- role. Both are analytics-only; no FK is enforced at this stage.
-- =============================================================================

-- 1. Change buyer_id from uuid to text (analytics-only column, no FK)
ALTER TABLE tav.purchase_outcomes
  ALTER COLUMN buyer_id TYPE text USING buyer_id::text;

-- 2. Add closer_id — nullable text, no FK enforced
ALTER TABLE tav.purchase_outcomes
  ADD COLUMN IF NOT EXISTS closer_id text;
