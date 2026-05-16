import type { SupabaseClient } from "./supabase";

/**
 * Read-only persistence for the v1.5 Ingest Monitor backend
 * (`GET /app/ingest-runs[/:id]`). Every function is a pure read — no
 * writes, no mutations. Diagnostic detail is assembled only from data
 * that already exists in the current schema.
 */

const SUMMARY_COLUMNS =
  "id, source, run_id, region, status, item_count, processed, rejected, created_leads, scraped_at, created_at, error_message";

export interface IngestRunSummary {
  id: string;
  source: string;
  run_id: string;
  region: string;
  status: string;
  item_count: number | null;
  processed: number | null;
  rejected: number | null;
  created_leads: number | null;
  scraped_at: string;
  created_at: string;
  error_message: string | null;
}

export interface IngestRunListFilter {
  limit: number;
  source?: string;
  region?: string;
  status?: string;
}

export interface IngestRunDetail {
  run: IngestRunSummary;
  rawListingCount: number;
  normalizedListingCount: number;
  filteredOutByReason: Record<string, number>;
  valuationMissByReason: Record<string, number>;
  schemaDriftByType: Record<string, number>;
  createdLeadCount: number;
  createdLeadIds: string[];
  // dead_letters has no source_run linkage in the current schema, so it is
  // intentionally not reported per-run. See docs/APP_API.md.
}

/** Tally occurrences of `key` across rows. Rows with a null/undefined key are skipped. */
export function countByKey(
  rows: Array<Record<string, unknown>>,
  key: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const v = row[key];
    if (v === null || v === undefined) continue;
    const k = String(v);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function toSummary(row: Record<string, unknown>): IngestRunSummary {
  return {
    id: row.id as string,
    source: row.source as string,
    run_id: row.run_id as string,
    region: row.region as string,
    status: row.status as string,
    item_count: (row.item_count as number | null) ?? null,
    processed: (row.processed as number | null) ?? null,
    rejected: (row.rejected as number | null) ?? null,
    created_leads: (row.created_leads as number | null) ?? null,
    scraped_at: row.scraped_at as string,
    created_at: row.created_at as string,
    error_message: (row.error_message as string | null) ?? null,
  };
}

export async function listSourceRuns(
  db: SupabaseClient,
  filter: IngestRunListFilter,
): Promise<IngestRunSummary[]> {
  let q = db
    .from("source_runs")
    .select(SUMMARY_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(filter.limit);

  if (filter.source) q = q.eq("source", filter.source);
  if (filter.region) q = q.eq("region", filter.region);
  if (filter.status) q = q.eq("status", filter.status);

  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(toSummary);
}

async function countRows(
  db: SupabaseClient,
  table: string,
  column: string,
  value: string,
): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);
  if (error) throw error;
  return count ?? 0;
}

export async function getSourceRunDetail(
  db: SupabaseClient,
  id: string,
): Promise<IngestRunDetail | null> {
  const { data: runRow, error: runErr } = await db
    .from("source_runs")
    .select(SUMMARY_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (runErr) throw runErr;
  if (!runRow) return null;

  const run = toSummary(runRow as Record<string, unknown>);

  // raw/normalized listings are keyed by source_runs.id (uuid FK).
  const rawListingCount = await countRows(db, "raw_listings", "source_run_id", run.id);
  const normalizedListingCount = await countRows(db, "normalized_listings", "source_run_id", run.id);

  // filtered_out.source_run_id stores the source run_id string (not the uuid).
  const { data: filtered, error: fErr } = await db
    .from("filtered_out")
    .select("reason_code")
    .eq("source_run_id", run.run_id);
  if (fErr) throw fErr;

  // schema_drift_events.source_run_id stores the uuid (as text).
  const { data: drift, error: dErr } = await db
    .from("schema_drift_events")
    .select("event_type")
    .eq("source_run_id", run.id);
  if (dErr) throw dErr;

  // valuation_snapshots has no source_run_id — join through normalized_listings.
  const { data: misses, error: vErr } = await db
    .from("valuation_snapshots")
    .select("missing_reason, normalized_listings!inner(source_run_id)")
    .eq("normalized_listings.source_run_id", run.id)
    .not("missing_reason", "is", null);
  if (vErr) throw vErr;

  // leads link to a run via normalized_listings.source_run_id.
  const { data: leadRows, error: lErr } = await db
    .from("leads")
    .select("id, normalized_listings!inner(source_run_id)")
    .eq("normalized_listings.source_run_id", run.id);
  if (lErr) throw lErr;

  const createdLeadIds = ((leadRows ?? []) as Array<Record<string, unknown>>)
    .map((r) => r.id as string)
    .filter((x): x is string => typeof x === "string");

  return {
    run,
    rawListingCount,
    normalizedListingCount,
    filteredOutByReason: countByKey((filtered ?? []) as Array<Record<string, unknown>>, "reason_code"),
    valuationMissByReason: countByKey((misses ?? []) as Array<Record<string, unknown>>, "missing_reason"),
    schemaDriftByType: countByKey((drift ?? []) as Array<Record<string, unknown>>, "event_type"),
    createdLeadCount: createdLeadIds.length,
    createdLeadIds,
  };
}
