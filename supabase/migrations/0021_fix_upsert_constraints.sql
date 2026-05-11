-- =============================================================================
-- Migration 0021 — Replace COALESCE functional indexes with standard unique
--                  constraints on market_demand_index and market_expenses
--
-- Migrations 0013 and 0014 used functional unique indexes with COALESCE() to
-- treat NULL and '' as equivalent. Supabase's JS client upsert ON CONFLICT
-- cannot target functional indexes — it requires a plain unique constraint.
--
-- Fix: make the nullable columns NOT NULL DEFAULT '' so a standard unique
-- constraint on the plain columns works correctly. Existing NULL values are
-- coerced to '' by the ALTER COLUMN SET DEFAULT + UPDATE before the constraint
-- is added.
-- =============================================================================

-- ── market_demand_index ──────────────────────────────────────────────────────

-- 1. Drop the functional unique index
DROP INDEX IF EXISTS tav.market_demand_index_region_segment_week_unique;

-- 2. Coerce existing NULLs to '' before adding NOT NULL
UPDATE tav.market_demand_index SET segment_key = '' WHERE segment_key IS NULL;

-- 3. Make the column NOT NULL with default ''
ALTER TABLE tav.market_demand_index
  ALTER COLUMN segment_key SET DEFAULT '',
  ALTER COLUMN segment_key SET NOT NULL;

-- 4. Add a plain unique constraint that Supabase upsert can target
ALTER TABLE tav.market_demand_index
  ADD CONSTRAINT market_demand_index_region_segment_week_key
  UNIQUE (region, segment_key, week_label);


-- ── market_expenses ──────────────────────────────────────────────────────────

-- 1. Drop the functional unique index
DROP INDEX IF EXISTS tav.market_expenses_region_type_city_date_unique;

-- 2. Coerce existing NULLs to '' before adding NOT NULL
UPDATE tav.market_expenses SET city = '' WHERE city IS NULL;

-- 3. Make the column NOT NULL with default ''
ALTER TABLE tav.market_expenses
  ALTER COLUMN city SET DEFAULT '',
  ALTER COLUMN city SET NOT NULL;

-- 4. Add a plain unique constraint that Supabase upsert can target
ALTER TABLE tav.market_expenses
  ADD CONSTRAINT market_expenses_region_type_city_date_key
  UNIQUE (region, expense_type, city, effective_date);
