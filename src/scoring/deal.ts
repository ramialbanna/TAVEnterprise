// Price vs MMR deal score. Returns 0 when either value is absent.
export function computeDealScore(
  price: number | undefined,
  mmrValue: number | undefined,
): number {
  if (!price || !mmrValue || mmrValue <= 0) return 0;
  const pct = price / mmrValue;
  if (pct <= 0.70) return 100;
  if (pct <= 0.75) return 90;
  if (pct <= 0.80) return 80;
  if (pct <= 0.85) return 70;
  if (pct <= 0.90) return 55;
  if (pct <= 0.95) return 40;
  if (pct <= 1.00) return 25;
  return 10;
}
