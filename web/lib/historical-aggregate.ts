import type { HistoricalSale } from "@/lib/app-api/schemas";

/**
 * Pure aggregate helpers over `/app/historical-sales` row sets.
 *
 * All functions are null-safe and never coerce a missing value to `0`:
 *   - `median([])` → `null`
 *   - any `null` / `undefined` / non-finite number is dropped before computing
 *   - `comparisonAggregates([])` returns `{ count: 0, … all metrics null }`
 *
 * These live in `web/lib` (not under a dashboard page) because Phase 4 plans to reuse
 * `bucketGrossByMonth`-style aggregations for the segment-trend chart. Keeping them here
 * (instead of duplicating into another section) is the explicit follow-up flagged in
 * `docs/followups.md` 2026-05-13.
 */

export type ComparisonAggregates = {
  /** Always the input row count, including rows that contributed no finite metric. */
  count: number;
  /** Latest valid `saleDate` (ISO string) across the input. `null` when none parse. */
  lastSoldDate: string | null;
  avgSalePrice: number | null;
  medianSalePrice: number | null;
  avgAcquisitionCost: number | null;
  avgGross: number | null;
};

/** Median of finite numbers. Returns `null` for an empty / all-invalid input. */
export function median(nums: ReadonlyArray<number | null | undefined>): number | null {
  const finite: number[] = [];
  for (const n of nums) {
    if (typeof n === "number" && Number.isFinite(n)) finite.push(n);
  }
  if (finite.length === 0) return null;
  finite.sort((a, b) => a - b);
  const mid = Math.floor(finite.length / 2);
  if (finite.length % 2 === 1) return finite[mid]!;
  return (finite[mid - 1]! + finite[mid]!) / 2;
}

/** Arithmetic mean of finite numbers; `null` when there are none. */
function mean(nums: ReadonlyArray<number | null | undefined>): number | null {
  let sum = 0;
  let n = 0;
  for (const x of nums) {
    if (typeof x === "number" && Number.isFinite(x)) {
      sum += x;
      n += 1;
    }
  }
  return n === 0 ? null : sum / n;
}

/** Latest `saleDate` (ISO string) among rows whose `saleDate` parses to a valid date. */
function latestSaleDate(rows: ReadonlyArray<HistoricalSale>): string | null {
  let bestIso: string | null = null;
  let bestMs = -Infinity;
  for (const row of rows) {
    const iso = row.saleDate;
    const ms = typeof iso === "string" ? Date.parse(iso) : NaN;
    if (Number.isFinite(ms) && ms > bestMs) {
      bestMs = ms;
      bestIso = iso;
    }
  }
  return bestIso;
}

/**
 * Aggregate summary for the MMR Lab comparison panel. Reads only documented
 * `HistoricalSale` fields. `count` reflects the full input length even when every
 * metric is null — operators still see "n = N similar units" with each metric
 * separately marked unavailable.
 */
export function comparisonAggregates(rows: ReadonlyArray<HistoricalSale>): ComparisonAggregates {
  if (rows.length === 0) {
    return {
      count: 0,
      lastSoldDate: null,
      avgSalePrice: null,
      medianSalePrice: null,
      avgAcquisitionCost: null,
      avgGross: null,
    };
  }
  const salePrices = rows.map((r) => r.salePrice);
  const acqCosts = rows.map((r) => r.acquisitionCost);
  const grosses = rows.map((r) => r.grossProfit);
  return {
    count: rows.length,
    lastSoldDate: latestSaleDate(rows),
    avgSalePrice: mean(salePrices),
    medianSalePrice: median(salePrices),
    avgAcquisitionCost: mean(acqCosts),
    avgGross: mean(grosses),
  };
}
