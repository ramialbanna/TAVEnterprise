/**
 * Authoritative MMR cache-key derivation.
 *
 * Format (see docs/INTELLIGENCE_CONTRACTS.md §A):
 *   - VIN:  vin:${normalizedVin}      where normalizedVin = vin.trim().toUpperCase()
 *   - YMM:  ymm:${year}:${makeLower}:${modelLower}:${trimLower ?? 'base'}:${mileageBucket}
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
  mileage: number;
}

/** Build the VIN-namespaced cache key. */
export function deriveVinCacheKey(vin: string): string {
  return `vin:${vin.trim().toUpperCase()}`;
}

/** Build the YMM-namespaced cache key. */
export function deriveYmmCacheKey(args: YmmCacheKeyArgs): string {
  const makePart  = normalizeToken(args.make);
  const modelPart = normalizeToken(args.model);
  const trimPart  =
    args.trim === undefined || args.trim === null || args.trim.trim().length === 0
      ? "base"
      : normalizeToken(args.trim);
  const bucket = mileageBucket(args.mileage);

  return `ymm:${args.year}:${makePart}:${modelPart}:${trimPart}:${bucket}`;
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
