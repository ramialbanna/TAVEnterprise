import type { HistoricalSalesFilter } from "@/lib/app-api/client";
import type { HistoricalSale } from "@/lib/app-api/schemas";

/**
 * Pure filter helpers for `/historical`.
 *
 * The historical-sales filter state is split into two layers:
 *   - **Server-side** — passed to `listHistoricalSales` (`year`, `make`, `model`,
 *     `since`, `limit`). These are the documented API params; nothing else may be
 *     sent.
 *   - **Client-side** — applied in-memory over the returned rows. v1 supports
 *     `trim` (case-insensitive exact), `vinPresent` ("any" | "present" | "missing"),
 *     and a `[grossMin, grossMax]` range. None of these are valid API params.
 *
 * Everything here is null-safe: a missing client filter is a no-op, never coerced to
 * a wide range or empty-string match. `sellThroughRate` is never touched.
 */

export type VinPresence = "any" | "present" | "missing";

export type FilterState = {
  /** Server: row cap. Default 100 (matches the dashboard). */
  limit: number;
  /** Server: ISO date — only sales on/after this date. `null` → omitted. */
  since: string | null;
  /** Server: year filter. `null` → omitted. */
  year: number | null;
  /** Server: make filter. `null`/blank → omitted. */
  make: string | null;
  /** Server: model filter. `null`/blank → omitted. */
  model: string | null;
  /** Client: trim filter (case-insensitive exact match). `null`/blank → no filter. */
  trim: string | null;
  /** Client: VIN presence filter. `"any"` → no filter. */
  vinPresent: VinPresence;
  /** Client: gross-profit lower bound (inclusive). `null` → no lower bound. */
  grossMin: number | null;
  /** Client: gross-profit upper bound (inclusive). `null` → no upper bound. */
  grossMax: number | null;
};

export const DEFAULT_FILTER_LIMIT = 100;

export const INITIAL_FILTER: FilterState = {
  limit: DEFAULT_FILTER_LIMIT,
  since: null,
  year: null,
  make: null,
  model: null,
  trim: null,
  vinPresent: "any",
  grossMin: null,
  grossMax: null,
};

/** Server-side filter slice. Strips client-only fields. */
export function serverFilter(state: FilterState): HistoricalSalesFilter {
  const out: HistoricalSalesFilter = { limit: state.limit };
  if (state.year !== null) out.year = state.year;
  if (state.make !== null && state.make.length > 0) out.make = state.make;
  if (state.model !== null && state.model.length > 0) out.model = state.model;
  if (state.since !== null && state.since.length > 0) out.since = state.since;
  return out;
}

/**
 * Apply the in-memory filters over a row set. Returns a new array — never mutates
 * the input. `grossMin`/`grossMax` filters drop rows whose `grossProfit` is null/
 * non-finite (no fabricated zero comparison).
 */
export function applyClientFilters(
  rows: ReadonlyArray<HistoricalSale>,
  state: Pick<FilterState, "trim" | "vinPresent" | "grossMin" | "grossMax">,
): HistoricalSale[] {
  const trimLower = state.trim && state.trim.trim().length > 0 ? state.trim.trim().toLowerCase() : null;
  const grossMin = state.grossMin;
  const grossMax = state.grossMax;
  const vinPresent = state.vinPresent;

  return rows.filter((row) => {
    if (trimLower !== null) {
      const rowTrim = (row.trim ?? "").toLowerCase();
      if (rowTrim !== trimLower) return false;
    }
    if (vinPresent === "present" && (row.vin === null || row.vin === undefined || row.vin === ""))
      return false;
    if (vinPresent === "missing" && !(row.vin === null || row.vin === undefined || row.vin === ""))
      return false;
    if (grossMin !== null || grossMax !== null) {
      if (typeof row.grossProfit !== "number" || !Number.isFinite(row.grossProfit)) return false;
      if (grossMin !== null && row.grossProfit < grossMin) return false;
      if (grossMax !== null && row.grossProfit > grossMax) return false;
    }
    return true;
  });
}

/** Distinct, sorted `make` values from a row set (skips blank/non-string). */
export function distinctMakes(rows: ReadonlyArray<HistoricalSale>): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (typeof row.make === "string" && row.make.trim().length > 0) seen.add(row.make.trim());
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

/**
 * Distinct, sorted `model` values, optionally scoped to a single `make`. When `make`
 * is supplied, only rows whose `make` matches contribute. Otherwise every row's
 * model is collected.
 */
export function distinctModels(
  rows: ReadonlyArray<HistoricalSale>,
  make: string | null = null,
): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (make !== null && row.make !== make) continue;
    if (typeof row.model === "string" && row.model.trim().length > 0) seen.add(row.model.trim());
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

/**
 * Active-filter chip descriptors — one entry per filter that is "on". Empty when
 * the state matches `INITIAL_FILTER`. Useful for the summary line.
 */
export type FilterChip = { key: string; label: string };

export function activeFilterChips(state: FilterState): FilterChip[] {
  const chips: FilterChip[] = [];
  if (state.year !== null) chips.push({ key: "year", label: `year: ${state.year}` });
  if (state.make !== null) chips.push({ key: "make", label: `make: ${state.make}` });
  if (state.model !== null) chips.push({ key: "model", label: `model: ${state.model}` });
  if (state.since !== null) chips.push({ key: "since", label: `since: ${state.since}` });
  if (state.trim !== null && state.trim.trim().length > 0)
    chips.push({ key: "trim", label: `trim: ${state.trim}` });
  if (state.vinPresent !== "any")
    chips.push({ key: "vinPresent", label: `VIN: ${state.vinPresent}` });
  if (state.grossMin !== null) chips.push({ key: "grossMin", label: `gross ≥ $${state.grossMin}` });
  if (state.grossMax !== null) chips.push({ key: "grossMax", label: `gross ≤ $${state.grossMax}` });
  return chips;
}
