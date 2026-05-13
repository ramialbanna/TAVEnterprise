import type { BarChartDatum } from "@/components/charts";

/**
 * Pure projection of `outcomes.value.byRegion` rows (passed through verbatim by the
 * Worker from `tav.v_outcome_summary`) into `BarChartDatum[]` for a single metric.
 *
 * Each row is shaped as `Record<string, unknown>` (RawRowSchema) — so the picker is
 * deliberately defensive:
 *   - The region label must be a non-empty string; rows missing `region` are skipped.
 *   - The value must be a finite number (any column listed in `valueKeys` — the first
 *     present wins). A `null`, `undefined`, NaN, string, or otherwise non-finite cell
 *     skips the row entirely — it is NEVER coerced to `0`.
 *   - The `sell_through_rate` column is intentionally ignored upstream and never
 *     surfaced here (TAV product decision Round 5).
 *
 * Unknown / additive columns are tolerated; the function reads only what it needs.
 */
export function normalizeByRegion(
  rows: Array<Record<string, unknown>>,
  valueKeys: readonly string[],
): BarChartDatum[] {
  const out: BarChartDatum[] = [];
  for (const row of rows) {
    const region = pickString(row, "region");
    if (!region) continue;
    const value = pickFirstFinite(row, valueKeys);
    if (value === null) continue;
    out.push({ label: region, value });
  }
  return out;
}

function pickString(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickFirstFinite(row: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/** Field name candidates for the gross-profit metric in a byRegion row. */
export const GROSS_VALUE_KEYS = ["avg_gross_profit"] as const;

/** Field name candidates for the hold-days metric in a byRegion row. */
export const HOLD_DAYS_VALUE_KEYS = ["avg_hold_days"] as const;
