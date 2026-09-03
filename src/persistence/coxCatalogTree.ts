import type { SupabaseClient } from "./supabase";
import {
  buildCoxCatalogSearchText,
  inferVariantKind,
  type CoxCatalogTreeRow,
} from "../valuation/matchListingToCoxCatalog";
import { squashCatalogToken } from "../valuation/matchCatalogOption";

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

const TREE_COLUMNS = "year, make, model, style, search_text, variant_kind";

type CatalogTreeRecord = {
  year: number;
  make: string;
  model: string;
  style: string;
  search_text: string;
  variant_kind: string | null;
};

function toTreeRow(row: CatalogTreeRecord): CoxCatalogTreeRow {
  return {
    year: row.year,
    make: row.make,
    model: row.model,
    style: row.style,
    searchText: row.search_text,
    variantKind: row.variant_kind ?? null,
  };
}

export async function loadCoxCatalogTreeForMake(
  db: SupabaseClient,
  year: number,
  make: string,
): Promise<CoxCatalogTreeRow[]> {
  const { data, error } = await db
    .schema("tav")
    .from("cox_catalog_tree")
    .select(TREE_COLUMNS)
    .eq("year", year)
    .ilike("make", make);
  if (error) throw error;

  const rows = (data ?? []) as CatalogTreeRecord[];
  if (rows.length > 0) return rows.map(toTreeRow);

  return loadByPunctuationInsensitiveMake(db, year, make);
}

/**
 * Item 72 — second attempt for makes Cox spells with spaces or hyphens.
 *
 * `ilike` is case-insensitive but not punctuation-insensitive, so our `bmw`
 * never matched Cox's `B M W` and every BMW listing fell through with
 * `catalog_not_synced` despite 2,427 tree rows existing.
 *
 * The `%`-interleaved pattern only narrows the scan; the squashed equality
 * check below is what decides, so a loose pattern cannot produce a wrong make.
 * Runs only when the exact lookup found nothing, which is the rare path.
 */
async function loadByPunctuationInsensitiveMake(
  db: SupabaseClient,
  year: number,
  make: string,
): Promise<CoxCatalogTreeRow[]> {
  const squashed = squashCatalogToken(make);
  if (!squashed) return [];

  const { data, error } = await db
    .schema("tav")
    .from("cox_catalog_tree")
    .select(TREE_COLUMNS)
    .eq("year", year)
    .ilike("make", squashed.split("").join("%"));
  if (error) throw error;

  return ((data ?? []) as CatalogTreeRecord[])
    .filter((row) => squashCatalogToken(row.make) === squashed)
    .map(toTreeRow);
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
