import type { SupabaseClient } from "./supabase";
import { log } from "../logging/logger";

export type SchemaDriftParams = {
  source: string;
  source_run_id: string;
  event_type: "unexpected_field" | "missing_required" | "wrong_type";
  field_path: string;
  sample_value?: unknown;
};

const SAMPLE_VALUE_MAX_CHARS = 200;

/** Keep jsonb samples small — full listing objects were toast-bloating the table. */
export function capSchemaDriftSample(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    return value.length <= SAMPLE_VALUE_MAX_CHARS ? value : value.slice(0, SAMPLE_VALUE_MAX_CHARS);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  try {
    const encoded = JSON.stringify(value);
    if (encoded.length <= SAMPLE_VALUE_MAX_CHARS) return value;
    return encoded.slice(0, SAMPLE_VALUE_MAX_CHARS);
  } catch {
    return String(value).slice(0, SAMPLE_VALUE_MAX_CHARS);
  }
}

/** One row per field_path per ingest run — not one per listing. */
export function takeUnseenDriftEvents<T extends { field_path: string; sample_value?: unknown }>(
  events: T[],
  seen: Set<string>,
): T[] {
  const out: T[] = [];
  for (const event of events) {
    if (seen.has(event.field_path)) continue;
    seen.add(event.field_path);
    out.push({ ...event, sample_value: capSchemaDriftSample(event.sample_value) });
  }
  return out;
}

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
      sample_value: capSchemaDriftSample(params.sample_value),
    });
    if (error) {
      log("schema_drift.write_failed", { source: params.source, field_path: params.field_path, error: error.message });
    }
  } catch (err) {
    log("schema_drift.write_failed", { source: params.source, field_path: params.field_path, error: err instanceof Error ? err.message : String(err) });
  }
}
