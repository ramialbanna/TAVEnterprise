import type { SupabaseClient } from "./supabase";
import { log } from "../logging/logger";

export type SchemaDriftParams = {
  source: string;
  source_run_id: string;
  event_type: "unexpected_field" | "missing_required" | "wrong_type";
  field_path: string;
  sample_value?: unknown;
};

// Writes to tav.schema_drift_events. Never throws — drift is observability data
// and must never block or fail the ingest pipeline.
export async function writeSchemaDrift(
  db: SupabaseClient,
  params: SchemaDriftParams,
): Promise<void> {
  try {
    const { error } = await db.from("schema_drift_events").insert({
      source: params.source,
      source_run_id: params.source_run_id,
      event_type: params.event_type,
      field_path: params.field_path,
      sample_value: params.sample_value ?? null,
    });
    if (error) {
      log("schema_drift.write_failed", { source: params.source, field_path: params.field_path, error: error.message });
    }
  } catch (err) {
    log("schema_drift.write_failed", { source: params.source, field_path: params.field_path, error: err instanceof Error ? err.message : String(err) });
  }
}
