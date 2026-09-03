import type { NormalizedListingInput } from "../types/domain";
import { parseFacebookItem, type AdapterContext } from "../sources/facebook";

export type StoredSeller = {
  listingId?: string | null;
  sellerUrl: string | null;
  sellerName: string | null;
};

/**
 * Item 74 — payload seller wins per field; empty Facebook slots reuse the
 * row we already enriched. A name-only payload must not drop a stored profile
 * URL. Facebook cards stay off the buyer sheet until a seller URL exists
 * (2026-08-31 lock, tightened 2026-08-31: no fail-open onto Opportunities).
 */
export function resolveListingSeller(
  payload: { sellerUrl?: string | null; sellerName?: string | null },
  stored?: StoredSeller | null,
): StoredSeller {
  const payloadUrl = payload.sellerUrl?.trim() || null;
  const payloadName = payload.sellerName?.trim() || null;
  const storedUrl = stored?.sellerUrl?.trim() || null;
  const storedName = stored?.sellerName?.trim() || null;
  return {
    sellerUrl: payloadUrl || storedUrl,
    sellerName: payloadName || storedName,
  };
}

/** Mutate listing seller fields so blocked-seller + §71 + upsert all see the same identity. */
export function applyResolvedSeller<T extends { sellerUrl?: string; sellerName?: string }>(
  listing: T,
  stored?: StoredSeller | null,
): T {
  const resolved = resolveListingSeller(listing, stored);
  if (resolved.sellerUrl) listing.sellerUrl = resolved.sellerUrl;
  else delete listing.sellerUrl;
  if (resolved.sellerName) listing.sellerName = resolved.sellerName;
  else delete listing.sellerName;
  return listing;
}

export function collectFacebookListingUrls(
  items: readonly unknown[],
  adapterCtx: AdapterContext,
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const parsed = parseFacebookItem(item, adapterCtx);
    if (!parsed.ok) continue;
    const url = parsed.listing.url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export function storedSellerForListing(
  listing: Pick<NormalizedListingInput, "url">,
  storedSellersByUrl?: ReadonlyMap<string, StoredSeller> | null,
): StoredSeller | null {
  if (!storedSellersByUrl) return null;
  return storedSellersByUrl.get(listing.url) ?? null;
}
