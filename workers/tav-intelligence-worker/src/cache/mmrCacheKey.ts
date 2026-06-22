/**
 * Authoritative MMR cache-key derivation.
 *
 * Format (see docs/03-api/intelligence-contracts.md §A):
 *   - VIN:  vin:${normalizedVin}      where normalizedVin = vin.trim().toUpperCase()
 *   - YMM:  ymm:${year}:${makeLower}:${modelLower}:${trimLower ?? 'base'}[:${mileageBucket}]
 *
 * Mileage is bucketed to the nearest 5,000 to maximize cache reuse and align
 * with MMR's own internal rounding tolerance. A bucket of 0 is valid — it
 * represents "negligibly used" (mileage ≤ ~2,500 after rounding).
 *
 * Pure function. No I/O.
 */

export interface YmmCacheKeyArgs {
  year:    number;
  make:    string;
  model:   string;
  trim?:   string | null;
  /** Bucketed into the key when supplied; omitted for no-odometer lookups. */
  mileage?: number;
  /** When true, use the raw mileage integer instead of the 5,000-mile bucket. */
  exact?:  boolean;
}

/**
 * Build the VIN-namespaced cache key.
 *
 * When `exact` is false (default), mileage is rounded to the nearest 5,000
 * so that estimated/inferred odometer values share cache entries.
 * When `exact` is true, the raw mileage integer is used so that every
 * distinct user-entered odometer value gets its own entry and returns
 * the precise Cox adjustment for that exact mileage.
 */
export function deriveVinCacheKey(vin: string, mileage?: number, exact = false): string {
  const normalized = vin.trim().toUpperCase();
  if (typeof mileage === "number" && Number.isFinite(mileage) && mileage >= 0) {
    const key = exact ? mileage : mileageBucket(mileage);
    return `vin:${normalized}:${key}`;
  }
  return `vin:${normalized}`;
}

/**
 * Build the YMM-namespaced cache key.
 * `args.exact` mirrors the same semantics as `deriveVinCacheKey`'s `exact` param.
 */
export function deriveYmmCacheKey(args: YmmCacheKeyArgs): string {
  const makePart  = normalizeToken(args.make);
  const modelPart = normalizeToken(args.model);
  const trimPart  =
    args.trim === undefined || args.trim === null || args.trim.trim().length === 0
      ? "base"
      : normalizeToken(args.trim);
  const base = `ymm:${args.year}:${makePart}:${modelPart}:${trimPart}`;
  if (typeof args.mileage === "number" && Number.isFinite(args.mileage) && args.mileage >= 0) {
    const key = args.exact ? args.mileage : mileageBucket(args.mileage);
    return `${base}:${key}`;
  }
  return base;
}

/** Round mileage to the nearest 5,000 (half-up, per Math.round). */
export function mileageBucket(mileage: number): number {
  return Math.round(mileage / 5_000) * 5_000;
}

/**
 * Normalize a free-text token: trim, lowercase, collapse internal whitespace
 * to a single underscore, strip non-alphanumeric except underscore and hyphen.
 *
 * Mirrors `deriveSegmentKey`'s normalizer to keep the two contracts consistent.
 */
function normalizeToken(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 _-]/gi, "")
    .toLowerCase()
    .replace(/ /g, "_");
}
