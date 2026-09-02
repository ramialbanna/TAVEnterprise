/**
 * Keep in sync with `src/apify/listingMedia.ts`.
 * Facebook `primaryImage` URLs carry `&ctp=s261x260` (thumbnail crop).
 * Strip only `ctp` — `stp` is part of the signed URL and must stay.
 */

export function upgradeFacebookListingPhotoUrl(url: string): string {
  if (!/[?&]ctp=/i.test(url)) return url;
  return url.replace(/([?&])ctp=[^&]*&/i, "$1").replace(/[?&]ctp=[^&]*$/i, "");
}

export function listingMirrorPhotoUrls(urls: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const url = upgradeFacebookListingPhotoUrl(trimmed);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
