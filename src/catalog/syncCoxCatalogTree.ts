import {
  buildCoxCatalogYearRange,
  buildIntelCatalogPath,
  fetchIntelCatalogItems,
} from "./intelCatalogClient";
import { log, serializeError } from "../logging/logger";
import {
  finishCoxCatalogSyncRun,
  hasCoxCatalogTreeForYear,
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

export type CoxCatalogSyncOptions = {
  /** Explicit year list. When set, `mode` is ignored. */
  years?: number[];
  /** When no explicit years: `missing` syncs only years with zero rows (default), `all` re-syncs full range. */
  mode?: "missing" | "all";
};

export async function resolveCoxCatalogSyncYears(
  db: SupabaseClient,
  options?: CoxCatalogSyncOptions,
): Promise<number[]> {
  if (options?.years?.length) {
    return [...options.years].sort((a, b) => a - b);
  }

  const range = buildCoxCatalogYearRange();
  if (options?.mode === "all") return range;

  const missing: number[] = [];
  for (const year of range) {
    if (!(await hasCoxCatalogTreeForYear(db, year))) {
      missing.push(year);
    }
  }
  return missing;
}

/**
 * Pull Cox Y/M/M/S from tav-intelligence-worker and upsert into `tav.cox_catalog_tree`.
 * Uses existing Worker secrets + INTEL_WORKER service binding — no manual env vars.
 */
export async function runCoxCatalogSync(
  env: Env,
  db: SupabaseClient,
  options?: CoxCatalogSyncOptions,
): Promise<CoxCatalogSyncResult> {
  const years = await resolveCoxCatalogSyncYears(db, options);
  const runId = await startCoxCatalogSyncRun(db);

  if (years.length === 0) {
    await finishCoxCatalogSyncRun(db, runId, {
      status: "completed",
      yearsSynced: [],
      rowCount: 0,
      errorMessage: null,
    });
    return { runId, status: "completed", yearsSynced: [], rowCount: 0, skippedModels: 0 };
  }

  let rowCount = 0;
  const syncedYears: number[] = [];
  let skippedModels = 0;

  let skippedYears = 0;

  try {
    for (const year of years) {
      let makes: string[];
      try {
        makes = await fetchIntelCatalogItems(env, buildIntelCatalogPath(year));
      } catch (err) {
        skippedYears += 1;
        log("catalog.sync.year_skipped", { year, error: serializeError(err) });
        continue;
      }

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

    const status =
      skippedModels > 0 || skippedYears > 0 ? "partial" : "completed";
    const skipNotes = [
      skippedModels > 0 ? `${skippedModels} model(s) skipped after fetch retries` : null,
      skippedYears > 0 ? `${skippedYears} year(s) skipped after fetch failure` : null,
    ]
      .filter(Boolean)
      .join("; ");
    await finishCoxCatalogSyncRun(db, runId, {
      status,
      yearsSynced: syncedYears,
      rowCount,
      errorMessage: skipNotes.length > 0 ? skipNotes : null,
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
