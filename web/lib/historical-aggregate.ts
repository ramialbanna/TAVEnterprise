import type { HistoricalSale } from "@/lib/app-api/schemas";

/**
 * Pure aggregate helpers over `/app/historical-sales` row sets.
 *
 * All functions are null-safe and never coerce a missing value to `0`:
 *   - `median([])` → `null`
 *   - any `null` / `undefined` / non-finite number is dropped before computing
 *   - `comparisonAggregates([])` returns `{ count: 0, … all metrics null }`
 *   - bucketers drop rows with an unparseable `saleDate` or a missing metric (never
 *     fabricate an empty bucket or a `0` metric)
 *
 * These live in `web/lib` so the dashboard (gross-trend chart) and `/historical`
 * (Phase 4 segment trend, region rollups, gross histogram, etc.) can share a single
 * implementation. Date parsing is UTC-anchored so `YYYY-MM-DD` date-only input never
 * drifts across the runner's local timezone.
 */

// ── primitives ─────────────────────────────────────────────────────────────────

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

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** UTC `YYYY-MM` of a `saleDate` value, or `null` if the input is unparseable. */
function monthOf(saleDate: string | null | undefined): string | null {
  if (typeof saleDate !== "string" || saleDate.length === 0) return null;
  // A bare `YYYY-MM-DD` is anchored to UTC midnight so we don't drift across the
  // runner's local-timezone boundary. Any other ISO form is parsed as-is.
  const iso = DATE_ONLY_RE.test(saleDate) ? `${saleDate}T00:00:00Z` : saleDate;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = String(d.getUTCFullYear()).padStart(4, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
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

// ── comparison aggregates (MMR Lab) ────────────────────────────────────────────

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

// ── monthly bucketers ──────────────────────────────────────────────────────────

export type GrossMonthBucket = {
  /** `"YYYY-MM"` (UTC). */
  month: string;
  /** Mean `grossProfit` across the bucketed rows. */
  avgGross: number;
  /** Number of rows averaged into this bucket. */
  count: number;
};

/**
 * Bucket `/app/historical-sales` rows into monthly mean-gross-profit datapoints,
 * sorted ascending by `month`. A row is included only when `saleDate` parses to a
 * valid UTC date AND `grossProfit` is a finite number — `null`/`undefined`/`NaN`/
 * strings drop the row entirely (never coerced to `0`).
 */
export function bucketGrossByMonth(
  rows: ReadonlyArray<HistoricalSale>,
): GrossMonthBucket[] {
  const sums = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    if (typeof row.grossProfit !== "number" || !Number.isFinite(row.grossProfit)) continue;
    const month = monthOf(row.saleDate);
    if (!month) continue;
    const existing = sums.get(month);
    if (existing) {
      existing.total += row.grossProfit;
      existing.count += 1;
    } else {
      sums.set(month, { total: row.grossProfit, count: 1 });
    }
  }
  const buckets: GrossMonthBucket[] = [];
  for (const [month, { total, count }] of sums) {
    buckets.push({ month, avgGross: total / count, count });
  }
  return buckets.sort(byMonthAsc);
}

export type CountMonthBucket = {
  month: string;
  count: number;
};

/**
 * Bucket row counts by `YYYY-MM`. A row is counted when its `saleDate` parses;
 * metric fields are irrelevant. Sorted ascending.
 */
export function bucketCountByMonth(
  rows: ReadonlyArray<HistoricalSale>,
): CountMonthBucket[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const month = monthOf(row.saleDate);
    if (!month) continue;
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return Array.from(counts, ([month, count]) => ({ month, count })).sort(byMonthAsc);
}

export type AvgSalePriceMonthBucket = {
  month: string;
  avgSalePrice: number;
  count: number;
};

/**
 * Bucket `salePrice` means by `YYYY-MM`. Same skip rules as `bucketGrossByMonth`:
 * a row needs a parseable `saleDate` AND a finite `salePrice` to contribute.
 */
export function bucketAvgSalePriceByMonth(
  rows: ReadonlyArray<HistoricalSale>,
): AvgSalePriceMonthBucket[] {
  const sums = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    if (typeof row.salePrice !== "number" || !Number.isFinite(row.salePrice)) continue;
    const month = monthOf(row.saleDate);
    if (!month) continue;
    const existing = sums.get(month);
    if (existing) {
      existing.total += row.salePrice;
      existing.count += 1;
    } else {
      sums.set(month, { total: row.salePrice, count: 1 });
    }
  }
  const buckets: AvgSalePriceMonthBucket[] = [];
  for (const [month, { total, count }] of sums) {
    buckets.push({ month, avgSalePrice: total / count, count });
  }
  return buckets.sort(byMonthAsc);
}

function byMonthAsc(a: { month: string }, b: { month: string }): number {
  return a.month < b.month ? -1 : a.month > b.month ? 1 : 0;
}

// ── segment rollup ─────────────────────────────────────────────────────────────

export type SegmentRollup = {
  segment: string;
  count: number;
  avgGross: number | null;
  medianGross: number | null;
};

/**
 * Group rows by an operator-chosen key (`"make" | "model" | "year" | "buyer"`) and
 * compute count + mean/median gross profit per group. Sorted by `count` descending
 * (stable for ties — original insertion order).
 *
 * Rows with a null/blank/non-string group key are placed into a single `"(unknown)"`
 * bucket so they remain visible to the operator instead of silently dropped. Metric
 * nullability still applies: a row contributes `avgGross`/`medianGross` only when
 * `grossProfit` is finite.
 */
export function segmentRollup(
  rows: ReadonlyArray<HistoricalSale>,
  by: "make" | "model" | "year" | "buyer",
): SegmentRollup[] {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const segment = groupKey(row, by);
    const grosses = groups.get(segment) ?? [];
    if (typeof row.grossProfit === "number" && Number.isFinite(row.grossProfit)) {
      grosses.push(row.grossProfit);
    }
    if (!groups.has(segment)) groups.set(segment, grosses);
  }
  // Re-walk to count totals (including rows that contributed no finite gross).
  const counts = new Map<string, number>();
  for (const row of rows) {
    const segment = groupKey(row, by);
    counts.set(segment, (counts.get(segment) ?? 0) + 1);
  }
  const out: SegmentRollup[] = [];
  for (const [segment, grosses] of groups) {
    out.push({
      segment,
      count: counts.get(segment) ?? 0,
      avgGross: mean(grosses),
      medianGross: median(grosses),
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

function groupKey(row: HistoricalSale, by: "make" | "model" | "year" | "buyer"): string {
  const raw = row[by];
  if (by === "year") {
    return typeof raw === "number" && Number.isFinite(raw) ? String(raw) : "(unknown)";
  }
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "(unknown)";
}

// ── histogram ──────────────────────────────────────────────────────────────────

export type HistogramBucket = {
  /** Lower edge (inclusive). */
  lo: number;
  /** Upper edge (exclusive, except the final bucket which is inclusive). */
  hi: number;
  count: number;
};

/**
 * Build a fixed-edge histogram over a numeric series. Edges must be a strictly
 * increasing array of finite numbers; `edges.length` produces `edges.length - 1`
 * buckets. A value `v` lands in bucket `i` iff `edges[i] ≤ v < edges[i+1]`, with the
 * final bucket inclusive on both ends so the global max is never dropped.
 *
 * `null` / `undefined` / non-finite numbers are skipped — empty input or input with
 * no finite values returns the buckets with `count: 0` (the shape is preserved so
 * the chart can render its category axis honestly).
 */
export function histogramBuckets(
  values: ReadonlyArray<number | null | undefined>,
  edges: ReadonlyArray<number>,
): HistogramBucket[] {
  if (edges.length < 2) return [];
  for (let i = 1; i < edges.length; i += 1) {
    if (!(edges[i]! > edges[i - 1]!)) return [];
  }
  const counts = new Array<number>(edges.length - 1).fill(0);
  for (const v of values) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    if (v < edges[0]! || v > edges[edges.length - 1]!) continue;
    let placed = false;
    for (let i = 0; i < edges.length - 2; i += 1) {
      if (v >= edges[i]! && v < edges[i + 1]!) {
        counts[i]! += 1;
        placed = true;
        break;
      }
    }
    if (!placed) {
      counts[counts.length - 1]! += 1;
    }
  }
  const out: HistogramBucket[] = [];
  for (let i = 0; i < edges.length - 1; i += 1) {
    out.push({ lo: edges[i]!, hi: edges[i + 1]!, count: counts[i]! });
  }
  return out;
}
