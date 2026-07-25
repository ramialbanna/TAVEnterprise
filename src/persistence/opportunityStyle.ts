/**
 * Item 59 — resolve buyer-facing style (Cox series) for opportunities.
 * Prefer parsed listing trim; fall back to latest ingest MMR `lookup_trim`.
 */
export function resolveOpportunityStyle(
  listingTrim: string | null | undefined,
  valuationLookupTrim: string | null | undefined,
): string | null {
  const trimmedListing = listingTrim?.trim();
  if (trimmedListing) return trimmedListing;
  const trimmedValuation = valuationLookupTrim?.trim();
  return trimmedValuation ?? null;
}
