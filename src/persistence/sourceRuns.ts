import type { SupabaseClient } from "./supabase";

export type SourceRunRecord = {
  id: string;
  status: string;
  processed: number;
  rejected: number;
  created_leads: number;
};

type SourceRunInsert = {
  source: string;
  run_id: string;
  region: string;
  scraped_at: string;
  item_count: number;
};

// Upserts the source_run and returns it.
// If the run already has status='completed', returns the stored row immediately
// so the caller can short-circuit without reprocessing items.
export async function upsertSourceRun(
  db: SupabaseClient,
  params: SourceRunInsert,
): Promise<SourceRunRecord> {
  // Check for an existing run first to support the idempotency gate.
  const { data: existing, error: selectErr } = await db
    .from("source_runs")
    .select("id, status, processed, rejected, created_leads")
    .eq("source", params.source)
    .eq("run_id", params.run_id)
    .maybeSingle();

  if (selectErr) throw selectErr;

  // Idempotency gate: return stored counters, skip reprocessing.
  if (existing !== null && (existing as SourceRunRecord).status === "completed") {
    return toRecord(existing);
  }

  // Insert or update to running.
  const { data, error } = await db
    .from("source_runs")
    .upsert(
      {
        source: params.source,
        run_id: params.run_id,
        region: params.region,
        scraped_at: params.scraped_at,
        item_count: params.item_count,
        status: "running",
      },
      { onConflict: "source,run_id" },
    )
    .select("id, status, processed, rejected, created_leads")
    .single();

  if (error) throw error;
  if (!data) throw new Error("upsertSourceRun: no row returned");

  return toRecord(data);
}

export type SourceRunTerminalStatus = "completed" | "failed" | "truncated";

export interface SourceRunCompletion {
  processed:      number;
  rejected:       number;
  created_leads:  number;
  /** Terminal status. Defaults to 'completed' for callers that have not been updated. */
  status?:        SourceRunTerminalStatus;
  /** Free-text annotation; common pattern: `batch_truncated:N_items_skipped`. */
  error_message?: string | null;
}

export async function completeSourceRun(
  db: SupabaseClient,
  id: string,
  counts: SourceRunCompletion,
): Promise<void> {
  const { error } = await db
    .from("source_runs")
    .update({
      status:        counts.status ?? "completed",
      processed:     counts.processed,
      rejected:      counts.rejected,
      created_leads: counts.created_leads,
      error_message: counts.error_message ?? null,
    })
    .eq("id", id);

  if (error) throw error;
}

/**
 * Best-effort wrapper around completeSourceRun. Retries transient failures
 * via withRetry and swallows non-retryable / exhausted errors so a failed
 * completion never escapes into the request response. Intended for
 * execCtx.waitUntil call sites where the request response has already
 * been sent and any thrown error would surface as an unhandled rejection
 * in the Worker runtime.
 */
export async function completeSourceRunSafe(
  db: SupabaseClient,
  id: string,
  counts: SourceRunCompletion,
  logger: (event: string, fields?: Record<string, unknown>) => void,
): Promise<void> {
  const { withRetry } = await import("./retry");
  try {
    await withRetry(() => completeSourceRun(db, id, counts));
    logger("ingest.source_run_completed", {
      source_run_id: id,
      status: counts.status ?? "completed",
      processed: counts.processed,
      rejected: counts.rejected,
      created_leads: counts.created_leads,
    });
  } catch (err) {
    logger("ingest.source_run_complete_failed", {
      source_run_id: id,
      status: counts.status ?? "completed",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function toRecord(row: Record<string, unknown>): SourceRunRecord {
  return {
    id: row.id as string,
    status: row.status as string,
    processed: (row.processed as number) ?? 0,
    rejected: (row.rejected as number) ?? 0,
    created_leads: (row.created_leads as number) ?? 0,
  };
}
