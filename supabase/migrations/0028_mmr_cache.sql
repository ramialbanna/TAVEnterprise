-- =============================================================================
-- Migration 0028 — Add tav.mmr_cache
--
-- Postgres-side queryable mirror of the KV MMR cache. KV (TAV_KV) remains
-- authoritative for hot reads from the Worker — this table serves analytics,
-- joins to tav.mmr_queries, and cold-start recovery if KV is flushed.
--
-- Worker write path: on a Manheim hit, write to KV first (latency-critical),
-- then upsert into this table best-effort. Worker read path: KV first; fall
-- back to this table only on miss.
--
-- The unique constraint on cache_key is a PLAIN unique constraint (not a
-- functional index) so Supabase JS upsert ON CONFLICT can target it.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tav.mmr_cache (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key             text        NOT NULL,
  vin                   text,
  year                  smallint,
  make                  text,
  model                 text,
  trim                  text,
  mileage_used          integer,
  is_inferred_mileage   boolean     NOT NULL DEFAULT false,
  mmr_value             numeric(10,2),
  mmr_payload           jsonb       NOT NULL,
  fetched_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL,
  source                text        NOT NULL
    CHECK (source IN ('manheim','manual')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Plain unique constraint on cache_key (Supabase JS upsert target)
ALTER TABLE tav.mmr_cache
  ADD CONSTRAINT mmr_cache_cache_key_key UNIQUE (cache_key);

-- VIN reverse lookup (partial — VIN is nullable for YMM-only entries)
CREATE INDEX IF NOT EXISTS mmr_cache_vin_idx
  ON tav.mmr_cache (vin)
  WHERE vin IS NOT NULL;

-- Sweep query: "all rows expiring before now()"
CREATE INDEX IF NOT EXISTS mmr_cache_expires_at_idx
  ON tav.mmr_cache (expires_at);

-- updated_at trigger — uses the existing tav.set_updated_at() function
-- defined in migration 0001 (same pattern as trg_buy_box_rules_updated_at).
CREATE TRIGGER trg_mmr_cache_updated_at
  BEFORE UPDATE ON tav.mmr_cache
  FOR EACH ROW EXECUTE FUNCTION tav.set_updated_at();
