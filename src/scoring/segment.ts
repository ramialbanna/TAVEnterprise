/**
 * Maps average gross margin percentage from purchase outcomes to 0–100.
 * Returns 50 (neutral) when no historical data is available.
 * Margin bands: ≥20% → 100, ≥15% → 85, ≥10% → 70, ≥5% → 55, ≥0% → 40, <0% → 10
 */
export function computeSegmentProfitScore(avgGrossMarginPct: number | null | undefined): number {
  if (avgGrossMarginPct == null) return 50;
  if (avgGrossMarginPct >= 20) return 100;
  if (avgGrossMarginPct >= 15) return 85;
  if (avgGrossMarginPct >= 10) return 70;
  if (avgGrossMarginPct >= 5) return 55;
  if (avgGrossMarginPct >= 0) return 40;
  return 10;
}
