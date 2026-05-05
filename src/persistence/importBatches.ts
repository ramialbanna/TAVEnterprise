import type { SupabaseClient } from "./supabase";
import type { ImportBatch, ImportBatchStatus } from "../types/domain";

export async function createImportBatch(
  db: SupabaseClient,
  input: { weekLabel?: string; rowCount: number; notes?: string },
): Promise<ImportBatch> {
  const { data, error } = await db
    .from("import_batches")
    .insert({
      week_label: input.weekLabel ?? null,
      row_count: input.rowCount,
      imported_count: 0,
      duplicate_count: 0,
      rejected_count: 0,
      status: "pending" as ImportBatchStatus,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error("createImportBatch: no row returned");

  return mapBatch(data);
}

export async function updateImportBatchCounts(
  db: SupabaseClient,
  batchId: string,
  counts: {
    importedCount: number;
    duplicateCount: number;
    rejectedCount: number;
    status: ImportBatchStatus;
  },
): Promise<void> {
  const { error } = await db
    .from("import_batches")
    .update({
      imported_count: counts.importedCount,
      duplicate_count: counts.duplicateCount,
      rejected_count: counts.rejectedCount,
      status: counts.status,
    })
    .eq("id", batchId);

  if (error) throw error;
}

export async function listImportBatches(
  db: SupabaseClient,
  limit = 20,
): Promise<ImportBatch[]> {
  const { data, error } = await db
    .from("import_batches")
    .select()
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(mapBatch);
}

function mapBatch(row: Record<string, unknown>): ImportBatch {
  return {
    id: row.id as string,
    createdAt: row.created_at as string,
    weekLabel: (row.week_label as string | null) ?? null,
    rowCount: row.row_count as number,
    importedCount: row.imported_count as number,
    duplicateCount: row.duplicate_count as number,
    rejectedCount: row.rejected_count as number,
    status: row.status as ImportBatchStatus,
    notes: (row.notes as string | null) ?? null,
  };
}
