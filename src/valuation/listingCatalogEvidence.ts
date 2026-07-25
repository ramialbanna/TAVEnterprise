/**
 * Item 64 — combine listing text fields used for Cox catalog style/variant scoring.
 */

export type ListingCatalogEvidenceInput = {
  title?: string | null;
  trim?: string | null;
  description?: string | null;
};

/** Title + trim + description for offline/live catalog matchers. */
export function buildListingCatalogEvidenceText(input: ListingCatalogEvidenceInput): string {
  return [input.title, input.trim, input.description].filter(Boolean).join(" ").trim();
}
