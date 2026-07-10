/** Matches tav.maxbuy_mileage_band() in migration 0056. */
export function mileageBand(mileage: number | null | undefined): string {
  if (mileage == null) return "unknown";
  if (mileage < 30_000) return "0-30k";
  if (mileage < 60_000) return "30-60k";
  if (mileage < 90_000) return "60-90k";
  if (mileage < 120_000) return "90-120k";
  if (mileage < 150_000) return "120-150k";
  return "150k+";
}

/**
 * @deprecated Item 54 — Max buy must not invent odometer. Prefer null mileage +
 * `mileageBand(null)` → `"unknown"`. Kept only for legacy callers/tests; do not
 * use in `evaluateRun`.
 */
export function estimateMileage(year: number, currentYear = new Date().getUTCFullYear()): number {
  const ageYears = Math.max(0, currentYear - year);
  return ageYears * 15_000;
}
