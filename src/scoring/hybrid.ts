/**
 * Hybrid buy-box score formula:
 *   hybridScore = ruleScore * 0.60 + segmentProfitScore * 0.25 + regionDemandScore * 0.15
 *
 * The feature flag check is the caller's responsibility — this function
 * always computes the hybrid score regardless of flag state.
 */
export function computeHybridBuyBoxScore(
  ruleScore: number,
  segmentProfitScore: number,
  regionDemandScore: number,
): number {
  return Math.round(
    ruleScore          * 0.60 +
    segmentProfitScore * 0.25 +
    regionDemandScore  * 0.15,
  );
}
