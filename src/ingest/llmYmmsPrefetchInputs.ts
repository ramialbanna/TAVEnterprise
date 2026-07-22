import { extractLlmListingTextFromIngestItem } from "../llm/listingTextContext";
import { parseFacebookItem, type AdapterContext } from "../sources/facebook";
import type { LlmYmmsResolutionInput } from "../valuation/resolveListingWithLLM";

/**
 * Item 57 §6 / item 60 — pure pre-pass: which batch indices need a prefetched
 * Claude Y/M/M/S call (Facebook, no VIN, year/make/model present).
 */
export function buildLlmYmmsPrefetchInputs(
  items: readonly unknown[],
  source: string,
  adapterCtx: AdapterContext,
): Map<number, LlmYmmsResolutionInput> {
  const inputs = new Map<number, LlmYmmsResolutionInput>();
  if (source !== "facebook") return inputs;

  items.forEach((item, i) => {
    const parsed = parseFacebookItem(item, adapterCtx);
    if (!parsed.ok) return;
    const { listing } = parsed;
    if (listing.vin) return;
    if (listing.year === undefined || !listing.make || !listing.model) return;

    const textContext = extractLlmListingTextFromIngestItem(item);

    inputs.set(i, {
      year: listing.year,
      make: listing.make,
      model: listing.model,
      trim: listing.trim,
      title: listing.title,
      price: listing.price,
      ...textContext,
    });
  });

  return inputs;
}
