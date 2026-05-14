import type { RegionKey } from "../types/domain";

/**
 * Apify actor-task ID → TAV region key.
 *
 * Initial scope: tx-east (Dallas) and tx-south (San Antonio) only. tx-west
 * (Lubbock) and tav-ok (Oklahoma City) intentionally absent — their locations
 * are outside REGION_KEYS, so the bridge no-ops them until REGION_KEYS is
 * expanded via a separate ADR + DB migration.
 *
 * Keys are Apify task IDs (17-char alphanumeric, e.g. `nccVufFs2grLH4Qsj`).
 * Source of truth confirmed by `GET /v2/actor-tasks/{id}` against the Rami_TAV
 * Apify account on 2026-05-14.
 */
export const APIFY_TASK_REGION_MAP: Record<string, RegionKey> = {
  nccVufFs2grLH4Qsj: "dallas_tx",      // tav-tx-east   (Dallas, TX)
  MWtcjZFWqJrnYChgp: "san_antonio_tx", // tav-tx-south  (San Antonio, TX)
};

/**
 * Returns the TAV region for a given Apify task ID, or null when the task is
 * intentionally unmapped (caller should 200-noop with `unmapped_task`).
 */
export function mapApifyTaskToRegion(taskId: string): RegionKey | null {
  return APIFY_TASK_REGION_MAP[taskId] ?? null;
}
