import type { SourceName } from "../types/domain";
import { SOURCE_NAMES } from "../validate";

const SOURCE_HOST_PATTERNS: Array<{ source: SourceName; pattern: RegExp }> = [
  { source: "facebook", pattern: /(?:^|\.)facebook\.com$|(?:^|\.)fb\.com$/i },
  { source: "craigslist", pattern: /(?:^|\.)craigslist\.org$/i },
  { source: "autotrader", pattern: /(?:^|\.)autotrader\.com$/i },
  { source: "cars_com", pattern: /(?:^|\.)cars\.com$/i },
  { source: "offerup", pattern: /(?:^|\.)offerup\.com$/i },
];

/**
 * Normalize a listing URL for storage/dedupe: trim, drop fragment, lowercase host.
 */
export function normalizeListingUrl(raw: string): string {
  const trimmed = raw.trim();
  const url = new URL(trimmed);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  return url.toString();
}

/** Infer marketplace source from the listing URL host. */
export function detectListingSource(listingUrl: string): SourceName | null {
  let host: string;
  try {
    host = new URL(listingUrl).hostname.toLowerCase();
  } catch {
    return null;
  }

  for (const { source, pattern } of SOURCE_HOST_PATTERNS) {
    if (pattern.test(host)) return source;
  }
  return null;
}

export function isKnownSourceName(value: string): value is SourceName {
  return (SOURCE_NAMES as readonly string[]).includes(value);
}

/** Build a display title from optional vehicle facts or fall back to the URL. */
export function buildManualListingTitle(input: {
  listingUrl: string;
  year?: number;
  make?: string;
  model?: string;
}): string {
  const parts = [input.year, input.make, input.model]
    .filter((v): v is string | number => v !== undefined && v !== "")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  if (parts.length >= 2) return parts.join(" ");

  try {
    return new URL(input.listingUrl).hostname;
  } catch {
    return "Manual submission";
  }
}
