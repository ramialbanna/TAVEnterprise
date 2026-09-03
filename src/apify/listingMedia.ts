/**
 * Item 62 — extract marketplace photo URLs from Apify / Facebook payload shapes.
 * Pure helper shared by payloadAdapter (ingest) and tests.
 */

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

/**
 * Facebook `primaryImage` URLs carry `&ctp=s261x260` (thumbnail crop).
 * Strip only `ctp` — `stp` is part of the signed URL and must stay.
 * Verified: the same signed link then returns 1536×1536. See docs/NEXT_STEPS.md §73.
 */
export function upgradeFacebookListingPhotoUrl(url: string): string {
  if (!/[?&]ctp=/i.test(url)) return url;
  return url.replace(/([?&])ctp=[^&]*&/i, "$1").replace(/[?&]ctp=[^&]*$/i, "");
}

/** Full-res URLs for the detail mirror. Strips `ctp` and dedupes. */
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

function pushUrl(urls: string[], seen: Set<string>, raw: string | undefined): void {
  if (!raw || !isHttpUrl(raw)) return;
  const url = upgradeFacebookListingPhotoUrl(raw);
  if (seen.has(url)) return;
  seen.add(url);
  urls.push(url);
}

/** One full-res HTTPS photo for the seller-type vision call. */
export const SELLER_CLASSIFY_MAX_IMAGES = 1;

export function selectSellerClassifyImageUrls(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const raw of images) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed.startsWith("https://")) continue;
    const url = upgradeFacebookListingPhotoUrl(trimmed);
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= SELLER_CLASSIFY_MAX_IMAGES) break;
  }
  return urls;
}

function collectFromUnknownMediaEntry(
  entry: unknown,
  urls: string[],
  seen: Set<string>,
): void {
  if (typeof entry === "string") {
    pushUrl(urls, seen, readString(entry));
    return;
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
  const rec = entry as Record<string, unknown>;
  pushUrl(urls, seen, readString(rec.url));
  pushUrl(urls, seen, readString(rec.uri));
  pushUrl(urls, seen, readString(rec.image_url));
  const image = rec.image;
  if (image && typeof image === "object" && !Array.isArray(image)) {
    pushUrl(urls, seen, readString((image as { uri?: unknown }).uri));
    pushUrl(urls, seen, readString((image as { url?: unknown }).url));
  }
}

function collectFromMediaArray(value: unknown, urls: string[], seen: Set<string>): void {
  if (!Array.isArray(value)) return;
  for (const entry of value) collectFromUnknownMediaEntry(entry, urls, seen);
}

/**
 * Deduped gallery URLs in stable order — primary/thumbnail first when present.
 */
export function extractListingImageUrls(item: unknown): string[] {
  if (!item || typeof item !== "object" || Array.isArray(item)) return [];
  const rec = item as Record<string, unknown>;
  const urls: string[] = [];
  const seen = new Set<string>();

  pushUrl(urls, seen, readString(rec.primaryImage));

  const primaryPhoto = rec.primary_listing_photo;
  if (primaryPhoto && typeof primaryPhoto === "object" && !Array.isArray(primaryPhoto)) {
    const image = (primaryPhoto as { image?: unknown }).image;
    if (image && typeof image === "object" && !Array.isArray(image)) {
      pushUrl(urls, seen, readString((image as { uri?: unknown }).uri));
    }
  }

  const existing = rec.images;
  if (Array.isArray(existing)) collectFromMediaArray(existing, urls, seen);

  const eld = rec.extraListingData;
  if (eld && typeof eld === "object" && !Array.isArray(eld)) {
    const detail = eld as Record<string, unknown>;
    pushUrl(urls, seen, readString(detail.primaryImage));
    collectFromMediaArray(detail.images, urls, seen);
  }

  collectFromMediaArray(rec.extraListingMedia, urls, seen);

  return urls;
}
