-- Stop disk growth from ingest observability:
-- 1. Dropping a raw_listings row nulls FKs instead of blocking.
-- 2. prune_ingest_payloads() deletes payloads older than N days.
-- 3. schema_drift_events is truncated once — it was 3M+ expected-field rows.

ALTER TABLE tav.normalized_listings
  DROP CONSTRAINT IF EXISTS normalized_listings_raw_listing_id_fkey;
ALTER TABLE tav.normalized_listings
  ADD CONSTRAINT normalized_listings_raw_listing_id_fkey
  FOREIGN KEY (raw_listing_id) REFERENCES tav.raw_listings (id) ON DELETE SET NULL;

ALTER TABLE tav.filtered_out
  DROP CONSTRAINT IF EXISTS filtered_out_raw_listing_id_fkey;
ALTER TABLE tav.filtered_out
  ADD CONSTRAINT filtered_out_raw_listing_id_fkey
  FOREIGN KEY (raw_listing_id) REFERENCES tav.raw_listings (id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION tav.prune_ingest_payloads(
  retention_days integer DEFAULT 14,
  max_raw_deletes integer DEFAULT 3000
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  cutoff timestamptz := now() - make_interval(days => GREATEST(retention_days, 1));
  drift_deleted bigint := 0;
  raw_deleted bigint := 0;
  batch int;
  remaining int := GREATEST(max_raw_deletes, 1);
BEGIN
  DELETE FROM tav.schema_drift_events WHERE created_at < cutoff;
  GET DIAGNOSTICS drift_deleted = ROW_COUNT;

  WHILE remaining > 0 LOOP
    DELETE FROM tav.raw_listings
    WHERE id IN (
      SELECT id FROM tav.raw_listings
      WHERE received_at < cutoff
      LIMIT LEAST(remaining, 400)
    );
    GET DIAGNOSTICS batch = ROW_COUNT;
    EXIT WHEN batch = 0;
    raw_deleted := raw_deleted + batch;
    remaining := remaining - batch;
  END LOOP;

  RETURN jsonb_build_object(
    'drift_deleted', drift_deleted,
    'raw_deleted', raw_deleted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION tav.prune_ingest_payloads(integer, integer) TO service_role;

CREATE INDEX IF NOT EXISTS normalized_listings_raw_listing_id_idx
  ON tav.normalized_listings (raw_listing_id)
  WHERE raw_listing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS filtered_out_raw_listing_id_idx
  ON tav.filtered_out (raw_listing_id)
  WHERE raw_listing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS raw_listings_received_at_idx
  ON tav.raw_listings (received_at);
