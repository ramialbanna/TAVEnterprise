import { extractListingImageUrls } from "./listingMedia";
import { isBodyStyleOnly, readScraperVehicle } from "./scraperVehicle";

/**
 * Map a raidr-api/facebook-marketplace-vehicle-scraper dataset item into the
 * flat shape that src/sources/facebook.ts expects.
 *
 * The rented Apify actor emits Facebook GraphQL-style nested fields
 * (`marketplace_listing_title`, `listing_price.amount`, `listing_date_ms`,
 * etc.). The TAV Facebook adapter was designed against a flatter v1 shape
 * (`url`, `title`, `price`, …). Without translation, every dataset item
 * rejects at the adapter's `extractUrl` gate with `missing_identifier`,
 * because raidr-api does not emit any `url`-aliased field.
 *
 * This module is intentionally non-destructive: it preserves every original
 * key on the item (so `detectFacebookDrift` can still observe upstream
 * fields) and only adds / overrides the flat keys the adapter reads. Items
 * that already conform to the v1 shape pass through unchanged on those
 * specific fields.
 */

const FB_MARKETPLACE_ITEM_URL_PREFIX = "https://www.facebook.com/marketplace/item/";

// 17-char standard VIN (alphanumeric, excluding I/O/Q per ISO 3779). Mirrors
// the regex in src/sources/facebook.ts so detail-mode VINs follow the same
// validation contract.
const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

interface RaidrApiListingPrice {
  amount?: unknown;
  amount_with_offset_in_currency?: unknown;
  amount_with_offset?: unknown;
  formatted_amount?: unknown;
  // custom-vehicle-scraper uses `formatted` instead of `formatted_amount`
  formatted?: unknown;
}

interface RaidrApiSeller {
  name?: unknown;
  id?: unknown;
  url?: unknown;
  profile_url?: unknown;
}

const FB_MARKETPLACE_PROFILE_URL_PREFIX = "https://www.facebook.com/marketplace/profile/";

function marketplaceProfileUrlFromSellerId(id: unknown): string | undefined {
  const raw = readString(id) ?? (typeof id === "number" && Number.isFinite(id) ? String(id) : undefined);
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  return `${FB_MARKETPLACE_PROFILE_URL_PREFIX}${raw}`;
}

function marketplaceProfileUrlFromUnknown(value: unknown): string | undefined {
  const raw = readString(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!/facebook\.com$/i.test(url.hostname) && url.hostname !== "fb.com") return undefined;
    if (!/\/marketplace\/profile\/\d+\/?$/i.test(url.pathname)) return undefined;
    return `${FB_MARKETPLACE_PROFILE_URL_PREFIX}${url.pathname.match(/\/marketplace\/profile\/(\d+)/i)?.[1]}`;
  } catch {
    return undefined;
  }
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function constructMarketplaceUrl(id: unknown): string | undefined {
  const idStr = readString(id);
  if (!idStr) return undefined;
  return `${FB_MARKETPLACE_ITEM_URL_PREFIX}${encodeURIComponent(idStr)}/`;
}

function extractPrice(listingPrice: unknown): string | undefined {
  if (!listingPrice || typeof listingPrice !== "object") return undefined;
  const lp = listingPrice as RaidrApiListingPrice;
  // Prefer the numeric amount (string-encoded) — adapter's parsePrice strips
  // any currency/comma formatting downstream.
  const amount = readString(lp.amount);
  if (amount !== undefined) return amount;
  const formattedAmount = readString(lp.formatted_amount);
  if (formattedAmount !== undefined) return formattedAmount;
  const formatted = readString(lp.formatted);
  if (formatted !== undefined) return formatted;
  return undefined;
}

function postedAtFromListingDateMs(value: unknown): string | undefined {
  // raidr-api ships epoch milliseconds. Sanity-check: must be a finite
  // positive integer within a plausible range (post-2010, pre-2100).
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const year = date.getUTCFullYear();
  if (year < 2010 || year > 2100) return undefined;
  return date.toISOString();
}

/**
 * Idempotent. Items that already have flat-shape fields keep them; only
 * absent fields are filled from raidr-api equivalents.
 *
 * Returns the item unchanged when not an object — downstream Zod / adapter
 * code will reject it with its existing error path.
 */
export function mapRaidrApiItem(item: unknown): unknown {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const rec = item as Record<string, unknown>;

  const out: Record<string, unknown> = { ...rec };

  // url — only construct if every flat URL alias is absent and item.id exists.
  const hasUrl =
    readString(rec.url) !== undefined ||
    readString(rec.listingUrl) !== undefined ||
    readString(rec.listing_url) !== undefined ||
    readString(rec.marketplaceUrl) !== undefined ||
    readString(rec.link) !== undefined;
  if (!hasUrl) {
    const constructed = constructMarketplaceUrl(rec.id);
    if (constructed) out.url = constructed;
  }

  // title — fall back through raidr-api aliases when adapter alias missing.
  if (readString(rec.title) === undefined && readString(rec.Title) === undefined) {
    const fromMarketplace = readString(rec.marketplace_listing_title);
    const fromCustom = readString(rec.custom_title) ?? readString(rec.customTitle);
    const title = fromMarketplace ?? fromCustom;
    if (title) out.title = title;
  }

  // price — adapter already aliases listing_price/listingPrice, but raidr-api
  // wraps the value in a nested object. Extract scalar.
  const adapterPriceAliases = [rec.price, rec.Price, rec.listing_price, rec.listingPrice];
  const adapterPriceIsScalar = adapterPriceAliases.some(
    (v) => typeof v === "string" || typeof v === "number",
  );
  if (!adapterPriceIsScalar) {
    const extracted =
      extractPrice(rec.listing_price) ??
      extractPrice(rec.listingPrice) ??
      extractPrice(rec.price) ??
      extractPrice(rec.Price);
    if (extracted !== undefined) out.price = extracted;
  }

  // sellerName / sellerUrl — raidr-api emits nested marketplace_listing_seller
  // { id, name }. Detail-mode puts the same object on extraListingData.seller
  // (old) or details.seller (build 0.0.6). Numeric `id` is the Marketplace
  // profile we persist as sellerUrl. A pfbid token is not a profile URL.
  const sellerCandidates: unknown[] = [rec.marketplace_listing_seller];
  const detailForSeller = rec.details ?? rec.extraListingData;
  if (detailForSeller && typeof detailForSeller === "object" && !Array.isArray(detailForSeller)) {
    sellerCandidates.push((detailForSeller as Record<string, unknown>).seller);
  }
  sellerCandidates.push(rec.seller);

  if (
    readString(rec.sellerName) === undefined &&
    readString(rec.seller_name) === undefined &&
    readString(rec.seller) === undefined
  ) {
    for (const seller of sellerCandidates) {
      if (!seller || typeof seller !== "object" || Array.isArray(seller)) continue;
      const name = readString((seller as RaidrApiSeller).name);
      if (name) {
        out.sellerName = name;
        break;
      }
    }
  }

  if (readString(rec.sellerUrl) === undefined && readString(rec.seller_url) === undefined) {
    for (const seller of sellerCandidates) {
      if (!seller || typeof seller !== "object" || Array.isArray(seller)) continue;
      const s = seller as RaidrApiSeller;
      const fromUrl =
        marketplaceProfileUrlFromUnknown(s.url) ?? marketplaceProfileUrlFromUnknown(s.profile_url);
      if (fromUrl) {
        out.sellerUrl = fromUrl;
        break;
      }
      const fromId = marketplaceProfileUrlFromSellerId(s.id);
      if (fromId) {
        out.sellerUrl = fromId;
        break;
      }
    }
  }

  // postedAt — adapter recognises postedAt / posted_at / listedAt; raidr-api
  // emits listing_date_ms (epoch ms) and listing_date (epoch s).
  if (
    readString(rec.postedAt) === undefined &&
    readString(rec.posted_at) === undefined &&
    readString(rec.listedAt) === undefined
  ) {
    const fromMs = postedAtFromListingDateMs(rec.listing_date_ms);
    if (fromMs) out.postedAt = fromMs;
    else if (typeof rec.listing_date === "number") {
      const fromSec = postedAtFromListingDateMs(rec.listing_date * 1000);
      if (fromSec) out.postedAt = fromSec;
    }
  }

  // ── Detail-mode fields (fetchDetailedItems: true) ─────────────────────────
  // Old actor: extraListingData.vehicle_*_display_name.
  // Build 0.0.6: details.vehicle.{makeDisplayName, odometer, sellerType, …}.
  // Both are read by readScraperVehicle. A body-style trim ("Sport Utility 4D")
  // is not stored — it is not a Cox style. Year still comes from the title.
  const scraped = readScraperVehicle(rec);

  if (typeof rec.mileage !== "number" && scraped.mileage !== undefined) {
    out.mileage = scraped.mileage;
  }

  if (readString(rec.vin) === undefined && readString(rec.VIN) === undefined && readString(rec.Vin) === undefined) {
    if (scraped.vin) {
      const upper = scraped.vin.toUpperCase();
      if (VIN_REGEX.test(upper)) out.vin = upper;
    }
  }

  if (readString(rec.make) === undefined && scraped.make) out.make = scraped.make;
  if (readString(rec.model) === undefined && scraped.model) out.model = scraped.model;
  if (readString(rec.trim) === undefined && scraped.trim && !isBodyStyleOnly(scraped.trim)) {
    const cleaned = cleanTrim(scraped.trim);
    if (cleaned && !isBodyStyleOnly(cleaned)) out.trim = cleaned;
  }

  if (readString(rec.description) === undefined && scraped.description) {
    out.description = scraped.description;
  }
  if (readString(rec.condition) === undefined && scraped.condition) {
    out.condition = scraped.condition;
  }
  if (readString(rec.city) === undefined && scraped.city) out.city = scraped.city;
  if (readString(rec.state) === undefined && scraped.state) out.state = scraped.state;

  // Basic-mode city/state fallback — facebook-marketplace-vehicle-scraper emits
  // `location.reverse_geocode`; custom-vehicle-scraper emits flat
  // `location.{city,state,displayName}`.
  if (readString(rec.city) === undefined && readString(out.city as unknown) === undefined) {
    const topLoc = rec.location;
    if (topLoc && typeof topLoc === "object" && !Array.isArray(topLoc)) {
      const loc = topLoc as Record<string, unknown>;
      const flatCity = readString(loc.city);
      if (flatCity) out.city = flatCity;
      const flatState = readString(loc.state);
      if (flatState) out.state = flatState;

      if (readString(out.city as unknown) === undefined) {
        const rg = loc.reverse_geocode;
        if (rg && typeof rg === "object" && !Array.isArray(rg)) {
          const r = rg as Record<string, unknown>;
          const city = readString(r.city);
          if (city) out.city = city;
          const state = readString(r.state);
          if (state) out.state = state;
        }
      }
    }
  }

  // ── Subtitle mileage fallback ─────────────────────────────────────────────
  // "64K miles" on custom_sub_titles_with_rendering_flags (old) or subtitles
  // (build 0.0.6). Skipped when a structured odometer is present, including a
  // non-miles unit, so a kilometre listing is not stored as miles.
  if (typeof out.mileage !== "number" && !scraped.odometerPresent) {
    const fromSub =
      extractMileageFromSubtitles(rec.subtitles) ??
      extractMileageFromSubtitles(rec.custom_sub_titles_with_rendering_flags);
    if (fromSub !== undefined) out.mileage = fromSub;
  }

  // Item 62 — gallery URLs for normalized_listings.images (FB CDN; may expire).
  const gallery = extractListingImageUrls(out);
  if (gallery.length > 0) out.images = gallery;

  return out;
}

interface SubtitleEntry {
  subtitle?: unknown;
}

function extractMileageFromSubtitles(value: unknown): number | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const entry of value as Array<SubtitleEntry | string>) {
    const text = typeof entry === "string" ? readString(entry) : readString(entry?.subtitle);
    if (!text) continue;
    const parsed = parseSubtitleMileage(text);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

/**
 * Cox MMR 1.4 YMMT requires `bodyname` (trim) as a bare canonical token
 * ("LT", "Lariat", "Denali"). raidr-api's `vehicle_trim_display_name` is
 * verbose — typically "<trim> <body words> <door tag> <bed length>" — and
 * a verbatim hand-off causes Cox 404s. cleanTrim strips trailing body /
 * configuration words and dimensional suffixes greedily until the string
 * stabilises, preserving the leading trim string itself.
 *
 * Returns the original input when stripping would yield an empty string.
 */
const BODY_WORDS: readonly string[] = [
  // 2-word forms first (greedy match)
  "Sport Utility", "Crew Cab", "Mega Cab", "Double Cab", "Quad Cab",
  "Cargo Van", "Passenger Van", "Regular Cab",
  "SuperCrew", "SuperCab",
  // single-word body styles
  "Pickup", "Sedan", "Coupe", "Hatchback", "Convertible", "Van", "Wagon",
  "SUV", "Truck", "Minivan", "Crossover", "Roadster",
];

export function cleanTrim(raw: string): string {
  const original = raw.trim();
  if (original.length === 0) return original;

  let t = original;

  // 1. Strip trailing bed/cargo length: "5 ft", "6 1/3 ft", "8 ft.", etc.
  t = t.replace(/\s+\d+(?:\s+\d+\/\d+)?\s*ft\.?$/i, "").trim();

  // 2. Iteratively strip door tags ("4D", "2D") and body words from the end.
  //    Two passes through the loop are typically enough; cap to defend
  //    against pathological inputs.
  for (let i = 0; i < 8; i++) {
    let changed = false;

    const afterDoor = t.replace(/\s+\d+D$/, "").trim();
    if (afterDoor !== t && afterDoor.length > 0) {
      t = afterDoor;
      changed = true;
    }

    for (const word of BODY_WORDS) {
      const re = new RegExp(`\\s+${word.replace(/\s+/g, "\\s+")}$`, "i");
      const stripped = t.replace(re, "").trim();
      if (stripped !== t && stripped.length > 0) {
        t = stripped;
        changed = true;
        break;
      }
    }

    if (!changed) break;
  }

  return t.length > 0 ? t : original;
}

function parseSubtitleMileage(text: string): number | undefined {
  // "64K miles", "129K miles · Dealership", "84k Miles", "2,500 miles"
  const kMatch = text.match(/(\d+(?:\.\d+)?)\s*[kK]\s*miles?\b/);
  if (kMatch) {
    const n = parseFloat(kMatch[1]!);
    if (Number.isFinite(n) && n >= 0) return Math.round(n * 1000);
  }
  const plain = text.match(/(\d{1,3}(?:,\d{3})+|\d{1,7})\s*miles?\b/i);
  if (plain) {
    const n = parseInt(plain[1]!.replace(/,/g, ""), 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}
