import type { RegionKey } from "../types/domain";

/**
 * Apify actor-task ID → TAV region key.
 *
 * All four Apify Facebook tasks are mapped (east, south, west, OK), plus any
 * tasks on the newer `raidr-api/custom-vehicle-scraper` actor that have been
 * wired up with a webhook.
 *
 * Keys are Apify task IDs (17-char alphanumeric, e.g. `nccVufFs2grLH4Qsj`).
 * Source of truth confirmed by `GET /v2/actor-tasks/{id}` against the Rami_TAV
 * Apify account on 2026-05-14 (facebook-marketplace-vehicle-scraper tasks)
 * and 2026-07-07 (custom-vehicle-scraper tasks).
 */
export const APIFY_TASK_REGION_MAP: Record<string, RegionKey> = {
  // raidr-api/facebook-marketplace-vehicle-scraper (rented, original)
  nccVufFs2grLH4Qsj: "dallas_tx",      // tav-tx-east   (Dallas, TX)
  MWtcjZFWqJrnYChgp: "san_antonio_tx", // tav-tx-south  (San Antonio, TX)
  vk7OijnAOOo8V1ekc: "lubbock_tx",         // tav-tx-west   (Lubbock, TX)
  Xpq656NgueqfXDHvU: "oklahoma_city_ok",  // tav-ok        (Oklahoma City, OK)

  // raidr-api/custom-vehicle-scraper (streamlined, locationSearches-based)
  ZQEsd3nHcLAs5kLwL: "dallas_tx", // dallas-nick-task (Dallas, TX) — webhook → production
  UfFehLMz5zylHOxCS: "oklahoma_city_ok", // oklahoma / tav-oklahoma-scheduled-task — webhook → production
};

/**
 * Returns the TAV region for a given Apify task ID, or null when the task is
 * intentionally unmapped (caller should 200-noop with `unmapped_task`).
 */
export function mapApifyTaskToRegion(taskId: string): RegionKey | null {
  return APIFY_TASK_REGION_MAP[taskId] ?? null;
}
