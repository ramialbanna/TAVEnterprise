-- =============================================================================
-- Migration 0024 — Add tav.sales_upload_batches
--
-- Per-CSV-upload batch record for the sales/historical upload flow. Captures
-- uploader identity (Cloudflare Access user), file metadata, accept/reject
-- counts, and a structured validation_errors payload.
--
-- This table must be created BEFORE tav.historical_sales (migration 0025)
-- because historical_sales.upload_batch_id is a foreign key into this table.
--
-- Distinct from the generic tav.import_batches table, which is reserved for
-- the purchase_outcomes import pipeline. The two upload paths share no rows.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.sales_upload_batches (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by_user_id   text,
  uploaded_by_name      text,
  uploaded_by_email     text,
  file_name             text        NOT NULL,
  row_count             integer     NOT NULL,
  accepted_count        integer     NOT NULL DEFAULT 0,
  rejected_count        integer     NOT NULL DEFAULT 0,
  status                text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','validating','complete','failed')),
  validation_errors     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Chronological listing for the uploads UI
CREATE INDEX IF NOT EXISTS sales_upload_batches_created_at_idx
  ON tav.sales_upload_batches (created_at DESC);
