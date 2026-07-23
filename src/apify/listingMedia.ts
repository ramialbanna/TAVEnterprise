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

function pushUrl(urls: string[], seen: Set<string>, raw: string | undefined): void {
  if (!raw || !isHttpUrl(raw) || seen.has(raw)) return;
  seen.add(raw);
  urls.push(raw);
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
