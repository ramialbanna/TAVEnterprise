import type { SupabaseClient } from "./supabase";
import type { ImportRowStatus } from "../types/domain";

export interface ImportRowInput {
  importBatchId: string;
  rowIndex: number;
  status: ImportRowStatus;
  reasonCode?: string | null;
  rawRow: unknown;
  outcomeId?: string | null;
}

// Returns the inserted row id.
export async function insertImportRow(
  db: SupabaseClient,
  input: ImportRowInput,
): Promise<string> {
  const { data, error } = await db
    .from("import_rows")
    .insert({
      import_batch_id: input.importBatchId,
      row_index: input.rowIndex,
      status: input.status,
      reason_code: input.reasonCode ?? null,
      raw_row: input.rawRow,
      outcome_id: input.outcomeId ?? null,
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data) throw new Error("insertImportRow: no row returned");
  return data.id as string;
}

// Inserts all rows in a single .insert() call. Throws on any error.
export async function bulkInsertImportRows(
  db: SupabaseClient,
  rows: ImportRowInput[],
): Promise<void> {
  const { error } = await db.from("import_rows").insert(
    rows.map((r) => ({
      import_batch_id: r.importBatchId,
      row_index: r.rowIndex,
      status: r.status,
      reason_code: r.reasonCode ?? null,
      raw_row: r.rawRow,
      outcome_id: r.outcomeId ?? null,
    })),
  );

  if (error) throw error;
}
