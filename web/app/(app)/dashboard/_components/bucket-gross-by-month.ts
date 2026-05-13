import type { HistoricalSale } from "@/lib/app-api/schemas";

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
 * sorted ascending by `month`.
 *
 *   - A row is included only when `saleDate` parses to a valid UTC date **and**
 *     `grossProfit` is a finite number. `null`/`undefined`/`NaN`/strings drop the row
 *     entirely — they are NEVER coerced to `0`.
 *   - The bucket key is the UTC `YYYY-MM` of `saleDate`. We use UTC explicitly so a
 *     date-only `YYYY-MM-DD` value (anchored to UTC midnight by the API) doesn't
 *     shift months in the runner's local timezone.
 *   - Result is sorted lexicographically (which is also chronologically for `YYYY-MM`).
 *
 * Phase 4 will reuse this helper for the segment-trend chart, so it intentionally lives
 * outside the section component and is fully unit-tested.
 */
export function bucketGrossByMonth(rows: HistoricalSale[]): GrossMonthBucket[] {
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
  buckets.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  return buckets;
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
