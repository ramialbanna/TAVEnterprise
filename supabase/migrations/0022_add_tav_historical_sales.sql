-- =============================================================================
-- Migration 0022 — Add tav.historical_sales table
--
-- Raw CSV ingest staging table for past vehicle purchases and sales. This is
-- the "raw" layer: every row from an uploaded CSV lands here with minimal
-- transformation, preserving the original payload for audit and reprocessing.
--
-- Design notes:
--   • import_run_id references tav.import_batches so each CSV upload is
--     tracked as a batch; rows are deduplicated by (import_run_id, row_offset).
--   • raw_row (jsonb) holds the full original CSV row so downstream processors
--     can re-derive any field without needing the original file.
--   • row_status drives the processing state machine:
--       pending   → awaiting normalization / matching
--       processed → successfully linked to a purchase_outcome
--       rejected  → failed validation; see rejection_reason
--       skipped   → duplicate of an existing outcome; intentionally ignored
--   • All vehicle / financial fields are nullable — CSV sources vary widely
--     and missing data is not a failure at this layer.
--   • This table does NOT replace tav.purchase_outcomes. historical_sales is
--     the raw staging layer; purchase_outcomes is the normalized record.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.historical_sales (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Import provenance
  import_run_id       uuid        NOT NULL REFERENCES tav.import_batches (id),
  row_offset          integer     NOT NULL,   -- 0-based row index within the CSV

  -- Vehicle identity (nullable — source CSVs vary)
  stock_number        text,
  vin                 text,
  year                smallint,
  make                text,
  model               text,
  trim                text,
  mileage             integer,

  -- Financials (nullable)
  purchase_price      numeric(10,2),
  sale_price          numeric(10,2),

  -- Dates (nullable)
  purchase_date       date,
  sale_date           date,
  days_in_inventory   integer,               -- may be supplied or computed by importer

  -- People / location (nullable)
  buyer_id            text,
  closer_id           text,
  source_location     text,                  -- lot / region string as it appears in the CSV

  -- Processing state
  row_status          text        NOT NULL DEFAULT 'pending'
    CHECK (row_status IN ('pending','processed','rejected','skipped')),
  rejection_reason    text,                  -- populated when row_status = 'rejected'

  -- Full original row for audit and re-processing
  raw_row             jsonb       NOT NULL,

  created_at          timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Unique constraint — idempotent re-ingest of the same CSV
-- =============================================================================

-- A given import batch + row position is the natural deduplication key.
-- ON CONFLICT (import_run_id, row_offset) DO NOTHING lets callers safely
-- replay a partial upload without creating duplicates.
ALTER TABLE tav.historical_sales
  ADD CONSTRAINT historical_sales_import_run_row_key
  UNIQUE (import_run_id, row_offset);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Batch-level queries ("show me all rows from import run X")
CREATE INDEX IF NOT EXISTS historical_sales_import_run_id_idx
  ON tav.historical_sales (import_run_id);

-- Processing queue ("give me all pending rows")
CREATE INDEX IF NOT EXISTS historical_sales_row_status_idx
  ON tav.historical_sales (row_status)
  WHERE row_status = 'pending';

-- VIN-based matching (nullable, so partial index to skip nulls)
CREATE INDEX IF NOT EXISTS historical_sales_vin_idx
  ON tav.historical_sales (vin)
  WHERE vin IS NOT NULL;
