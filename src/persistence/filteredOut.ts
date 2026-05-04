import type { Env } from "../types/env";
import type { SupabaseClient } from "./supabase";
import { withRetry } from "./retry";
import { writeDeadLetter } from "./deadLetter";

export type FilteredOutParams = {
  source: string;
  source_run_id: string;    // string run_id from ingest payload, not the UUID
  source_listing_id?: string;
  listing_url?: string;
  reason_code: string;
  details?: unknown;
  raw_listing_id?: string;  // UUID FK → raw_listings, links the audit trail
};

// Writes to tav.filtered_out. On retry exhaustion falls back to dead_letters.
// Never throws.
export async function writeFilteredOut(
  db: SupabaseClient,
  env: Env,
  params: FilteredOutParams,
): Promise<void> {
  try {
    await withRetry(async () => {
      const { error } = await db.from("filtered_out").insert({
        source: params.source,
        source_run_id: params.source_run_id,
        source_listing_id: params.source_listing_id ?? null,
        listing_url: params.listing_url ?? null,
        reason_code: params.reason_code,
        details: params.details ?? null,
        raw_listing_id: params.raw_listing_id ?? null,
      });
      if (error) throw error;
    });
  } catch (err) {
    await writeDeadLetter(db, env, {
      source: params.source,
      region: "unknown",
      run_id: params.source_run_id,
      item_index: -1,
      reason_code: "filtered_out_write_failed",
      payload: params,
      error_message: err instanceof Error ? err.message : String(err),
    });
  }
}
