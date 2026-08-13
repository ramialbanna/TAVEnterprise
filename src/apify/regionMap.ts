import type { RegionKey } from "../types/domain";

/**
 * Apify actor-task ID → TAV region + ingest source.
 *
 * Facebook Marketplace tasks (raidr-api) and Craigslist automotive-scraper
 * share one webhook bridge; `source` selects the payload mapper and the
 * ingest envelope `source` field.
 *
 * Keys are Apify task IDs (17-char alphanumeric, e.g. `nccVufFs2grLH4Qsj`).
 * Source of truth confirmed by `GET /v2/actor-tasks/{id}` against the Rami_TAV
 * Apify account on 2026-05-14 (facebook-marketplace-vehicle-scraper tasks),
 * 2026-07-07 (custom-vehicle-scraper tasks), and 2026-08-07 (CL automotive).
 */

export type ApifyIngestSource = "facebook" | "craigslist";

export type ApifyTaskConfig = {
  region: RegionKey;
  source: ApifyIngestSource;
};

export const APIFY_TASK_CONFIG: Record<string, ApifyTaskConfig> = {
  // raidr-api/facebook-marketplace-vehicle-scraper (rented, original)
  nccVufFs2grLH4Qsj: { region: "dallas_tx", source: "facebook" }, // tav-tx-east
  MWtcjZFWqJrnYChgp: { region: "san_antonio_tx", source: "facebook" }, // tav-tx-south
  vk7OijnAOOo8V1ekc: { region: "lubbock_tx", source: "facebook" }, // tav-tx-west
  Xpq656NgueqfXDHvU: { region: "oklahoma_city_ok", source: "facebook" }, // tav-ok

  // raidr-api/custom-vehicle-scraper (streamlined, locationSearches-based)
  ZQEsd3nHcLAs5kLwL: { region: "dallas_tx", source: "facebook" }, // dallas-nick-task
  UfFehLMz5zylHOxCS: { region: "oklahoma_city_ok", source: "facebook" }, // oklahoma

  // e-commerce/automotive-scraper — Craigslist (item 67)
  // Schedule remains disabled until staging soak; webhook may already target prod.
  NMTFTt1C0aEnhEuY9: { region: "dallas_tx", source: "craigslist" }, // cl-dallas-automotive
};

/** @deprecated Prefer `APIFY_TASK_CONFIG` / `mapApifyTaskConfig`. Kept for callers that only need region. */
export const APIFY_TASK_REGION_MAP: Record<string, RegionKey> = Object.fromEntries(
  Object.entries(APIFY_TASK_CONFIG).map(([id, cfg]) => [id, cfg.region]),
) as Record<string, RegionKey>;

/**
 * Returns full task config (region + source), or null when the task is
 * intentionally unmapped (caller should 200-noop with `unmapped_task`).
 */
export function mapApifyTaskConfig(taskId: string): ApifyTaskConfig | null {
  return APIFY_TASK_CONFIG[taskId] ?? null;
}

/**
 * Returns the TAV region for a given Apify task ID, or null when unmapped.
 */
export function mapApifyTaskToRegion(taskId: string): RegionKey | null {
  return mapApifyTaskConfig(taskId)?.region ?? null;
}
