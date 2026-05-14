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

interface RaidrApiListingPrice {
  amount?: unknown;
  amount_with_offset_in_currency?: unknown;
  formatted_amount?: unknown;
}

interface RaidrApiSeller {
  name?: unknown;
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
  const formatted = readString(lp.formatted_amount);
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
    const fromCustom = readString(rec.custom_title);
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
    const extracted = extractPrice(rec.listing_price);
    if (extracted !== undefined) out.price = extracted;
  }

  // sellerName — adapter recognises sellerName / seller_name / seller; raidr-api
  // emits nested marketplace_listing_seller.name.
  if (
    readString(rec.sellerName) === undefined &&
    readString(rec.seller_name) === undefined &&
    readString(rec.seller) === undefined
  ) {
    const seller = rec.marketplace_listing_seller;
    if (seller && typeof seller === "object" && !Array.isArray(seller)) {
      const name = readString((seller as RaidrApiSeller).name);
      if (name) out.sellerName = name;
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

  return out;
}
