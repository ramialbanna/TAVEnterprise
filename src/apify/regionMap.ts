import type { RegionKey } from "../types/domain";

/**
 * Apify actor-task ID → TAV region key.
 *
 * tx-east (Dallas), tx-south (San Antonio), and tx-west (Lubbock) are mapped.
 * tav-ok (Oklahoma City) remains unmapped until a separate ADR adds a non-TX
 * region key.
 *
 * Keys are Apify task IDs (17-char alphanumeric, e.g. `nccVufFs2grLH4Qsj`).
 * Source of truth confirmed by `GET /v2/actor-tasks/{id}` against the Rami_TAV
 * Apify account on 2026-05-14.
 */
export const APIFY_TASK_REGION_MAP: Record<string, RegionKey> = {
  nccVufFs2grLH4Qsj: "dallas_tx",      // tav-tx-east   (Dallas, TX)
  MWtcjZFWqJrnYChgp: "san_antonio_tx", // tav-tx-south  (San Antonio, TX)
  vk7OijnAOOo8V1ekc: "lubbock_tx",     // tav-tx-west   (Lubbock, TX)
};

/**
 * Returns the TAV region for a given Apify task ID, or null when the task is
 * intentionally unmapped (caller should 200-noop with `unmapped_task`).
 */
export function mapApifyTaskToRegion(taskId: string): RegionKey | null {
  return APIFY_TASK_REGION_MAP[taskId] ?? null;
}
