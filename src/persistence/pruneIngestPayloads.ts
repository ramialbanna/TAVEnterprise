import type { SupabaseClient } from "./supabase";
import { log, logError } from "../logging/logger";

/** Keep this many days of raw Apify payloads and schema-drift samples. */
export const INGEST_PAYLOAD_RETENTION_DAYS = 14;

export type PruneIngestPayloadsResult = {
  driftDeleted: number;
  rawDeleted: number;
};

export async function pruneIngestPayloads(
  db: SupabaseClient,
  retentionDays: number = INGEST_PAYLOAD_RETENTION_DAYS,
): Promise<PruneIngestPayloadsResult> {
  const { data, error } = await db.rpc("prune_ingest_payloads", {
    retention_days: retentionDays,
    max_raw_deletes: 25000,
  });
  if (error) {
    logError("persistence", "prune_ingest_payloads.failed", error);
    throw error;
  }
  const row = (data ?? {}) as { drift_deleted?: number; raw_deleted?: number };
  const result = {
    driftDeleted: Number(row.drift_deleted ?? 0),
    rawDeleted: Number(row.raw_deleted ?? 0),
  };
  log("prune_ingest_payloads.complete", { ...result, kpi: true });
  return result;
}
