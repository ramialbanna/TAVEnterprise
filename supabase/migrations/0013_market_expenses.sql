-- =============================================================================
-- Migration 0013 — Add tav.market_expenses table
--
-- Transport, auction fees, and miscellaneous overhead vary by region and
-- change over time. Storing them in a table (rather than hard-coding in the
-- Worker) lets the scoring layer look up the current rate at valuation time
-- and keeps historical rates for back-testing buy-box rules.
--
-- The partial unique index on (region, expense_type, city, effective_date)
-- uses COALESCE(city,'') so NULL and '' both represent "region-wide" and
-- collapse to a single row per date.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.market_expenses (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  region         text    NOT NULL,
  city           text,                          -- null = region-wide rate
  expense_type   text    NOT NULL
    CHECK (expense_type IN ('transport','auction_fee','misc_overhead')),
  amount_cents   integer NOT NULL,
  effective_date date    NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Supports "give me the current transport rate for dallas_tx" queries
CREATE INDEX IF NOT EXISTS market_expenses_region_idx
  ON tav.market_expenses (region);

-- Prevents duplicate rates for the same region / type / city / date
CREATE UNIQUE INDEX IF NOT EXISTS market_expenses_region_type_city_date_unique
  ON tav.market_expenses (region, expense_type, COALESCE(city,''), effective_date);
