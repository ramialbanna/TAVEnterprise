import type { SupabaseClient } from "../persistence/supabase";
import { log, logError } from "../logging/logger";

export async function runStaleSweep(db: SupabaseClient): Promise<{ updated: number }> {
  const { data, error } = await db.rpc("run_stale_sweep");
  if (error) {
    logError("persistence", "stale_sweep.failed", error);
    throw error;
  }
  const updated = (data as number) ?? 0;
  log("stale_sweep.complete", { updated, kpi: true });
  return { updated };
}
