-- =============================================================================
-- Migration 0025 — Add tav.historical_sales (pivot shape)
--
-- Per-vehicle historical purchase/sale record. Source of truth for KPI
-- rollups, gross-profit analytics, and market-velocity calculations.
--
-- Replaces the reverted 0022 shape. Key differences:
--   - row_hash (application-computed SHA-256) is the dedup natural key,
--     not (import_run_id, row_offset).
--   - buyer / buyer_user_id are split (display name vs Cloudflare Access id).
--   - acquisition_cost / acquisition_date replace purchase_price / purchase_date.
--   - Full P&L breakdown (transport, recon, auction fees) plus a STORED
--     generated gross_profit column.
--   - upload_batch_id FK → tav.sales_upload_batches (created in 0024).
--
-- The unique constraint on row_hash is a PLAIN unique constraint (not a
-- functional index) so Supabase JS upsert ON CONFLICT can target it. See
-- migration 0021 for the same pattern applied to market_demand_index.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.historical_sales (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vin                 text,
  year                smallint    NOT NULL,
  make                text        NOT NULL,
  model               text        NOT NULL,
  trim                text,
  buyer               text,
  buyer_user_id       text,
  acquisition_date    date,
  sale_date           date        NOT NULL,
  acquisition_cost    numeric(12,2),
  sale_price          numeric(12,2) NOT NULL,
  transport_cost      numeric(10,2),
  recon_cost          numeric(10,2),
  auction_fees        numeric(10,2),
  gross_profit        numeric(12,2)
    GENERATED ALWAYS AS (
      sale_price
      - COALESCE(acquisition_cost, 0)
      - COALESCE(transport_cost, 0)
      - COALESCE(recon_cost, 0)
      - COALESCE(auction_fees, 0)
    ) STORED,
  source_file_name    text,
  upload_batch_id     uuid        REFERENCES tav.sales_upload_batches (id),
  row_hash            text        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Plain unique constraint (Supabase JS upsert can target this; functional
-- indexes will not work — see migration 0021).
ALTER TABLE tav.historical_sales
  ADD CONSTRAINT historical_sales_row_hash_key UNIQUE (row_hash);

-- VIN lookup (partial — most rows have VIN, but the column is nullable)
CREATE INDEX IF NOT EXISTS historical_sales_vin_idx
  ON tav.historical_sales (vin)
  WHERE vin IS NOT NULL;

-- Segment lookups (year/make/model rollups feed velocity + KPIs)
CREATE INDEX IF NOT EXISTS historical_sales_year_make_model_idx
  ON tav.historical_sales (year, make, model);

-- Batch reverse lookup (for the uploads UI: "show rows in this batch")
CREATE INDEX IF NOT EXISTS historical_sales_upload_batch_id_idx
  ON tav.historical_sales (upload_batch_id);

-- Time-window KPI queries ("sales in last 30 days")
CREATE INDEX IF NOT EXISTS historical_sales_sale_date_idx
  ON tav.historical_sales (sale_date DESC);

-- Velocity calculation key (segment + time window)
CREATE INDEX IF NOT EXISTS historical_sales_velocity_idx
  ON tav.historical_sales (make, model, trim, sale_date DESC);
