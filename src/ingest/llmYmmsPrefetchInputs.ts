import {
  extractLlmListingTextFromIngestItem,
  mergeLlmListingTextContext,
} from "../llm/listingTextContext";
import { parseFacebookItem, type AdapterContext } from "../sources/facebook";
import { parseCraigslistItem } from "../sources/craigslist";
import { isYearBelowValuationFloor } from "../valuation/valuationEligibility";
import type { NormalizedListingInput } from "../types/domain";
import type { LlmYmmsResolutionInput } from "../valuation/resolveListingWithLLM";
import {
  isBlockedSeller,
  type BlockedSellerLookup,
} from "../persistence/blockedSellers";

/** Item 60 — build Claude Y/M/M/S input from raw ingest item + parsed listing. */
export function buildLlmYmmsResolutionInput(
  item: unknown,
  listing: NormalizedListingInput,
): LlmYmmsResolutionInput {
  const textContext = mergeLlmListingTextContext(
    extractLlmListingTextFromIngestItem(item),
    listing,
  );

  return {
    year: listing.year!,
    make: listing.make!,
    model: listing.model!,
    trim: listing.trim,
    title: listing.title,
    price: listing.price,
    ...textContext,
  };
}

/**
 * Item 57 §6 / item 60 / item 67 — pure pre-pass: which batch indices need a
 * prefetched Claude Y/M/M/S call (Facebook or Craigslist, no VIN, Y/M/M present).
 */
export function buildLlmYmmsPrefetchInputs(
  items: readonly unknown[],
  source: string,
  adapterCtx: AdapterContext,
  blockedSellerLookup?: BlockedSellerLookup | null,
): Map<number, LlmYmmsResolutionInput> {
  const inputs = new Map<number, LlmYmmsResolutionInput>();
  if (source !== "facebook" && source !== "craigslist") return inputs;

  items.forEach((item, i) => {
    const parsed =
      source === "craigslist"
        ? parseCraigslistItem(item, adapterCtx)
        : parseFacebookItem(item, adapterCtx);
    if (!parsed.ok) return;
    const { listing } = parsed;
    if (
      blockedSellerLookup &&
      isBlockedSeller(blockedSellerLookup, listing.sellerUrl, listing.sellerName)
    ) {
      return;
    }
    if (listing.vin) return;
    if (listing.year === undefined || !listing.make || !listing.model) return;
    if (isYearBelowValuationFloor(listing.year)) return;

    inputs.set(i, buildLlmYmmsResolutionInput(item, listing));
  });

  return inputs;
}
