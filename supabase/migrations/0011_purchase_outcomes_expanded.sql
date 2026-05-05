-- =============================================================================
-- Migration 0011 — Expand tav.purchase_outcomes for buy-outcome analytics
--
-- The original purchase_outcomes table captured only a thin audit trail
-- (purchase price, MMR at purchase, estimated gross profit). This migration
-- adds the financial detail, provenance, and dedup fields needed to support
-- import pipelines and outcome-based buy-box scoring in later phases.
--
-- All changes are additive (new nullable columns). The lead_id NOT NULL
-- constraint is relaxed so historical bulk imports without a matching lead
-- can be recorded without a dummy lead row.
-- =============================================================================

-- 1. Relax lead_id — historical imports may have no corresponding lead
ALTER TABLE tav.purchase_outcomes ALTER COLUMN lead_id DROP NOT NULL;

-- 2. Drop the implicit unique constraint that was created via "UNIQUE" on the
--    column definition; replace it with a partial index that only enforces
--    uniqueness when lead_id is actually present.
ALTER TABLE tav.purchase_outcomes DROP CONSTRAINT IF EXISTS purchase_outcomes_lead_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_outcomes_lead_id_unique
  ON tav.purchase_outcomes (lead_id)
  WHERE lead_id IS NOT NULL;

-- 3. Denormalized vehicle fields (captured at purchase time; may differ from
--    the live normalized_listing if the listing was updated after purchase)
ALTER TABLE tav.purchase_outcomes
  ADD COLUMN IF NOT EXISTS vin          text,
  ADD COLUMN IF NOT EXISTS year         smallint CHECK (year BETWEEN 1900 AND 2100),
  ADD COLUMN IF NOT EXISTS make         text,
  ADD COLUMN IF NOT EXISTS model        text,
  ADD COLUMN IF NOT EXISTS mileage      integer  CHECK (mileage >= 0),
  ADD COLUMN IF NOT EXISTS source       text,
  ADD COLUMN IF NOT EXISTS region       text,
  ADD COLUMN IF NOT EXISTS listed_price integer  CHECK (listed_price >= 0);

-- 4. Financial fields — cents for fees to avoid floating-point rounding
ALTER TABLE tav.purchase_outcomes
  ADD COLUMN IF NOT EXISTS price_paid        integer,          -- dollars
  ADD COLUMN IF NOT EXISTS sale_price        integer,          -- dollars, null until sold
  ADD COLUMN IF NOT EXISTS gross_profit      integer,          -- sale_price - price_paid - expenses
  ADD COLUMN IF NOT EXISTS hold_days         integer,          -- days from purchase to sale
  ADD COLUMN IF NOT EXISTS transport_cost    integer,          -- cents
  ADD COLUMN IF NOT EXISTS auction_fee       integer,          -- cents
  ADD COLUMN IF NOT EXISTS misc_overhead     integer;          -- cents

-- 5. Condition capture — raw preserves the source string; normalized is
--    constrained to the vocabulary the scoring layer reads
ALTER TABLE tav.purchase_outcomes
  ADD COLUMN IF NOT EXISTS condition_grade_raw        text,
  ADD COLUMN IF NOT EXISTS condition_grade_normalized text
    CHECK (condition_grade_normalized IN ('excellent','good','fair','poor','unknown'));

-- 6. Channel classification
ALTER TABLE tav.purchase_outcomes
  ADD COLUMN IF NOT EXISTS purchase_channel text
    CHECK (purchase_channel IN ('auction','private','dealer')),
  ADD COLUMN IF NOT EXISTS selling_channel  text
    CHECK (selling_channel IN ('retail','wholesale','auction'));

-- 7. Reporting / import provenance
ALTER TABLE tav.purchase_outcomes
  ADD COLUMN IF NOT EXISTS week_label          text,   -- e.g. '2026-W01'
  ADD COLUMN IF NOT EXISTS buyer_id            uuid,   -- analytics only; no FK enforced
  ADD COLUMN IF NOT EXISTS import_batch_id     uuid,   -- set during bulk import
  ADD COLUMN IF NOT EXISTS import_fingerprint  text;   -- SHA-256 dedup key for idempotent re-imports

-- 8. Partial unique index: prevents double-import of the same source row
CREATE UNIQUE INDEX IF NOT EXISTS purchase_outcomes_import_fingerprint_unique
  ON tav.purchase_outcomes (import_fingerprint)
  WHERE import_fingerprint IS NOT NULL;
