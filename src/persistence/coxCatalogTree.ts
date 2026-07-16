import type { SupabaseClient } from "./supabase";
import {
  buildCoxCatalogSearchText,
  inferVariantKind,
  type CoxCatalogTreeRow,
} from "../valuation/matchListingToCoxCatalog";

export type CoxCatalogSyncRunStatus = "running" | "completed" | "failed" | "partial";

export async function startCoxCatalogSyncRun(db: SupabaseClient): Promise<string> {
  const { data, error } = await db
    .schema("tav")
    .from("cox_catalog_sync_runs")
    .insert({ status: "running" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function finishCoxCatalogSyncRun(
  db: SupabaseClient,
  runId: string,
  input: {
    status: CoxCatalogSyncRunStatus;
    yearsSynced: number[];
    rowCount: number;
    errorMessage?: string | null;
  },
): Promise<void> {
  const { error } = await db
    .schema("tav")
    .from("cox_catalog_sync_runs")
    .update({
      status: input.status,
      years_synced: input.yearsSynced,
      row_count: input.rowCount,
      finished_at: new Date().toISOString(),
      error_message: input.errorMessage ?? null,
    })
    .eq("id", runId);
  if (error) throw error;
}

export async function upsertCoxCatalogTreeRows(
  db: SupabaseClient,
  rows: Array<{ year: number; make: string; model: string; style: string }>,
): Promise<number> {
  if (rows.length === 0) return 0;

  const payload = rows.map((row) => ({
    year: row.year,
    make: row.make,
    model: row.model,
    style: row.style,
    search_text: buildCoxCatalogSearchText(row.year, row.make, row.model, row.style),
    variant_kind: inferVariantKind(row.model),
    synced_at: new Date().toISOString(),
  }));

  const { error } = await db.schema("tav").from("cox_catalog_tree").upsert(payload, {
    onConflict: "year,make,model,style",
  });
  if (error) throw error;
  return payload.length;
}

export async function loadCoxCatalogTreeForMake(
  db: SupabaseClient,
  year: number,
  make: string,
): Promise<CoxCatalogTreeRow[]> {
  const { data, error } = await db
    .schema("tav")
    .from("cox_catalog_tree")
    .select("year, make, model, style, search_text, variant_kind")
    .eq("year", year)
    .ilike("make", make);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    year: row.year as number,
    make: row.make as string,
    model: row.model as string,
    style: row.style as string,
    searchText: row.search_text as string,
    variantKind: (row.variant_kind as string | null) ?? null,
  }));
}

export async function hasCoxCatalogTreeForYear(
  db: SupabaseClient,
  year: number,
): Promise<boolean> {
  const { count, error } = await db
    .schema("tav")
    .from("cox_catalog_tree")
    .select("year", { count: "exact", head: true })
    .eq("year", year);
  if (error) throw error;
  return (count ?? 0) > 0;
}
