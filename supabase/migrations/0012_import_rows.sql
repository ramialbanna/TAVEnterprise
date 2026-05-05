-- =============================================================================
-- Migration 0012 — Add import_batches and import_rows tables
--
-- Bulk CSV / spreadsheet imports need an audit trail: which rows were accepted,
-- which were duplicates (matched on import_fingerprint), and which were
-- rejected with a reason_code. import_batches is the envelope; import_rows is
-- the per-row detail. This satisfies the "no silent drops" rule for the import
-- pipeline the same way dead_letters does for the scrape pipeline.
-- =============================================================================

-- Envelope: one row per upload / import job
CREATE TABLE IF NOT EXISTS tav.import_batches (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  week_label       text,
  row_count        integer     NOT NULL DEFAULT 0,
  imported_count   integer     NOT NULL DEFAULT 0,
  duplicate_count  integer     NOT NULL DEFAULT 0,
  rejected_count   integer     NOT NULL DEFAULT 0,
  status           text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','importing','complete','failed')),
  notes            text
);

-- Detail: one row per source row in the uploaded file
CREATE TABLE IF NOT EXISTS tav.import_rows (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id  uuid        NOT NULL REFERENCES tav.import_batches (id),
  row_index        integer     NOT NULL,   -- 0-based position in the source file
  status           text        NOT NULL
    CHECK (status IN ('imported','duplicate','rejected')),
  reason_code      text,                   -- required when status = 'rejected'
  raw_row          jsonb       NOT NULL,   -- verbatim parsed input, for replay
  outcome_id       uuid        REFERENCES tav.purchase_outcomes (id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Support efficient batch status queries and outcome back-lookups
CREATE INDEX IF NOT EXISTS import_rows_batch_id_idx
  ON tav.import_rows (import_batch_id);

CREATE INDEX IF NOT EXISTS import_rows_outcome_id_idx
  ON tav.import_rows (outcome_id)
  WHERE outcome_id IS NOT NULL;
