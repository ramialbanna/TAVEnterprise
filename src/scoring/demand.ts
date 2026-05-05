/**
 * Passes through the market demand score (0–100 from market_demand_index).
 * Returns 50 (neutral) when no demand data is available for this region.
 */
export function computeRegionDemandScore(demandScore: number | null | undefined): number {
  if (demandScore == null) return 50;
  return Math.max(0, Math.min(100, demandScore));
}
