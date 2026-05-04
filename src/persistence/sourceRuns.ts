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

export async function completeSourceRun(
  db: SupabaseClient,
  id: string,
  counts: { processed: number; rejected: number; created_leads: number },
): Promise<void> {
  const { error } = await db
    .from("source_runs")
    .update({
      status: "completed",
      processed: counts.processed,
      rejected: counts.rejected,
      created_leads: counts.created_leads,
    })
    .eq("id", id);

  if (error) throw error;
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
