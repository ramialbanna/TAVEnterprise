import {
  buildCoxCatalogYearRange,
  buildIntelCatalogPath,
  fetchIntelCatalogItems,
  IntelCatalogFetchError,
} from "./intelCatalogClient";
import { log, serializeError } from "../logging/logger";
import {
  finishCoxCatalogSyncRun,
  startCoxCatalogSyncRun,
  upsertCoxCatalogTreeRows,
} from "../persistence/coxCatalogTree";
import type { SupabaseClient } from "../persistence/supabase";
import type { Env } from "../types/env";

const UPSERT_CHUNK_SIZE = 500;

export type CoxCatalogSyncResult = {
  runId: string;
  status: "completed" | "partial";
  yearsSynced: number[];
  rowCount: number;
  skippedModels?: number;
};

/**
 * Pull Cox Y/M/M/S from tav-intelligence-worker and upsert into `tav.cox_catalog_tree`.
 * Uses existing Worker secrets + INTEL_WORKER service binding — no manual env vars.
 */
export async function runCoxCatalogSync(
  env: Env,
  db: SupabaseClient,
): Promise<CoxCatalogSyncResult> {
  const years = buildCoxCatalogYearRange();
  const runId = await startCoxCatalogSyncRun(db);

  let rowCount = 0;
  const syncedYears: number[] = [];
  let skippedModels = 0;

  try {
    for (const year of years) {
      const makes = await fetchIntelCatalogItems(env, buildIntelCatalogPath(year));
      const batch: Array<{ year: number; make: string; model: string; style: string }> = [];

      for (const make of makes) {
        const models = await fetchIntelCatalogItems(env, buildIntelCatalogPath(year, make));
        for (const model of models) {
          try {
            const styles = await fetchIntelCatalogItems(
              env,
              buildIntelCatalogPath(year, make, model),
            );
            for (const style of styles) {
              batch.push({ year, make, model, style });
            }
          } catch (err) {
            skippedModels += 1;
            log("catalog.sync.model_skipped", {
              year,
              make,
              model,
              error: serializeError(err),
            });
          }
        }
      }

      for (let i = 0; i < batch.length; i += UPSERT_CHUNK_SIZE) {
        rowCount += await upsertCoxCatalogTreeRows(
          db,
          batch.slice(i, i + UPSERT_CHUNK_SIZE),
        );
      }

      syncedYears.push(year);
      log("catalog.sync.year_completed", {
        year,
        styleCount: batch.length,
        rowCountTotal: rowCount,
        skippedModels,
      });
    }

    const status = skippedModels > 0 ? "partial" : "completed";
    await finishCoxCatalogSyncRun(db, runId, {
      status,
      yearsSynced: syncedYears,
      rowCount,
      errorMessage: skippedModels > 0 ? `${skippedModels} model(s) skipped after fetch retries` : null,
    });

    return { runId, status, yearsSynced: syncedYears, rowCount, skippedModels };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishCoxCatalogSyncRun(db, runId, {
      status: syncedYears.length > 0 ? "partial" : "failed",
      yearsSynced: syncedYears,
      rowCount,
      errorMessage: message,
    }).catch(() => undefined);
    throw err;
  }
}
