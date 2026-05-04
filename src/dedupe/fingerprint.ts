import type { NormalizedListingInput } from "../types/domain";

function mileageBucket(miles: number): string {
  if (miles >= 100_000) return "100k+";
  if (miles >= 75_000) return "75k-100k";
  if (miles >= 50_000) return "50k-75k";
  if (miles >= 25_000) return "25k-50k";
  return "0-25k";
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function computeIdentityKey(listing: NormalizedListingInput): string {
  if (listing.vin) {
    return `vin:${listing.vin.toUpperCase().trim()}`;
  }
  const year = listing.year ?? 0;
  const make = listing.make ? slugify(listing.make) : "unknown";
  const model = listing.model ? slugify(listing.model) : "unknown";
  const region = listing.region ?? "unknown";
  const bucket = listing.mileage !== undefined ? mileageBucket(listing.mileage) : "unknown";
  return `ymm:${year}:${make}:${model}:${region}:${bucket}`;
}
