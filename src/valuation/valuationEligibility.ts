/**
 * Item 72 — the oldest model year worth spending a valuation on at ingest.
 *
 * Mirrors `SCRAPER_REVIEW_MIN_YEAR` (src/persistence/opportunities.ts): the
 * Unprocessed Leads tab already hides 2010-and-older inventory, so a buyer can
 * never act on a price we fetch for it. Valuing it anyway spends a catalog
 * cascade plus a Manheim round-trip per listing and drags the MMR hit-rate
 * denominator down (~20% hit on that cohort vs ~63% on tree-covered years).
 *
 * Kept as a separate constant rather than importing the persistence module so
 * the ingest hot path does not pull in the opportunities query layer;
 * `valuationEligibility.test.ts` asserts the two stay equal.
 */
export const VALUATION_MIN_YEAR = 2011;

/**
 * True when a listing is too old to be worth valuing. VIN lookups are exempt —
 * callers check `vin` first, since the VIN path never touches the catalog and a
 * closer who pastes a VIN is asking for that specific number.
 */
export function isYearBelowValuationFloor(year: number | undefined | null): boolean {
  return year !== undefined && year !== null && year < VALUATION_MIN_YEAR;
}
