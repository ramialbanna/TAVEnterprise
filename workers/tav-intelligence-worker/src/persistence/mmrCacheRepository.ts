import type { SupabaseClient } from "./supabase";
import { PersistenceError } from "../errors";
import type { MmrLookupInput } from "../services/mmrLookup";
import type { MmrResponseEnvelope } from "../validate";

export interface MmrCacheUpsertArgs {
  cacheKey: string;
  input:    MmrLookupInput;
  envelope: MmrResponseEnvelope;
}

export interface MmrCacheRepository {
  /**
   * Upsert the Postgres mirror of a freshly-fetched KV cache entry.
   * Conflicts on `cache_key` are resolved by overwriting (last-write-wins),
   * matching KV semantics for the same key.
   */
  upsert(args: MmrCacheUpsertArgs): Promise<void>;
}

export function createMmrCacheRepository(
  client: SupabaseClient,
): MmrCacheRepository {
  return {
    async upsert(args) {
      const row = buildRow(args);
      const { error } = await client
        .from("mmr_cache")
        .upsert(row, { onConflict: "cache_key" });
      if (error) {
        throw new PersistenceError("mmr_cache upsert failed", {
          code:    error.code,
          message: error.message,
        });
      }
    },
  };
}

function buildRow(args: MmrCacheUpsertArgs): Record<string, unknown> {
  const { cacheKey, input, envelope } = args;

  const row: Record<string, unknown> = {
    cache_key:           cacheKey,
    mileage_used:        envelope.mileage_used,
    is_inferred_mileage: envelope.is_inferred_mileage,
    mmr_value:           envelope.mmr_value,
    // Distribution columns added in migration 0035. Only wholesaleAvg is
    // derivable from the current response shape (it equals the primary scalar).
    // The remaining fields require source-specific parsing not yet implemented.
    mmr_wholesale_avg:   envelope.mmr_value,
    mmr_wholesale_clean: null,
    mmr_wholesale_rough: null,
    mmr_retail_clean:    null,
    mmr_sample_count:    null,
    mmr_payload:         envelope.mmr_payload ?? {},
    fetched_at:          envelope.fetched_at,
    expires_at:          envelope.expires_at ?? new Date().toISOString(),
    source:              "manheim" as const,
  };

  if (input.kind === "vin") {
    row.vin  = input.vin;
    row.year = input.year;
  } else {
    row.year  = input.year;
    row.make  = input.make;
    row.model = input.model;
    row.trim  = input.trim ?? null;
  }

  return row;
}
