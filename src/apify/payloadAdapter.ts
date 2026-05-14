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

  // ── Detail-mode fields (fetchDetailedItems: true) ─────────────────────────
  // When the Apify task config enables fetchDetailedItems, raidr-api populates
  // extraListingData with structured per-listing detail (mileage, VIN,
  // make/model/trim, description, exact location). When the flag is off these
  // fields are absent / null; the basic-mode mappings above cover what's
  // available from the search-results-only payload.
  const eld = rec.extraListingData;
  if (eld && typeof eld === "object" && !Array.isArray(eld)) {
    const detail = eld as Record<string, unknown>;

    // mileage — vehicle_odometer_data.{unit, value}. Only MILES unit; KM
    // ignored so we never silently misreport a 100,000 km listing as 100,000
    // mi against `tav.buy_box_rules.max_mileage`.
    if (typeof rec.mileage !== "number") {
      const odo = detail.vehicle_odometer_data;
      if (odo && typeof odo === "object" && !Array.isArray(odo)) {
        const o = odo as { unit?: unknown; value?: unknown };
        if (o.unit === "MILES" && typeof o.value === "number" && Number.isFinite(o.value) && o.value >= 0) {
          out.mileage = o.value;
        }
      }
    }

    // VIN — vehicle_identification_number. Validate against the same 17-char
    // standard VIN regex the Facebook adapter uses; uppercase it.
    if (readString(rec.vin) === undefined && readString(rec.VIN) === undefined && readString(rec.Vin) === undefined) {
      const vinRaw = readString(detail.vehicle_identification_number);
      if (vinRaw !== undefined) {
        const upper = vinRaw.toUpperCase();
        if (VIN_REGEX.test(upper)) out.vin = upper;
      }
    }

    // make / model / trim — preserved on the output for downstream tooling.
    // The Facebook adapter still re-parses these from the title; this PR
    // does not change adapter rejection semantics. Future work can teach
    // the adapter (or a normalization layer) to prefer these canonical
    // FB-supplied strings when present.
    if (readString(rec.make) === undefined) {
      const mk = readString(detail.vehicle_make_display_name);
      if (mk) out.make = mk;
    }
    if (readString(rec.model) === undefined) {
      const md = readString(detail.vehicle_model_display_name);
      if (md) out.model = md;
    }
    if (readString(rec.trim) === undefined) {
      const tm = readString(detail.vehicle_trim_display_name);
      if (tm) out.trim = tm;
    }

    // description — sellers commonly include mileage / condition / VIN in the
    // free-text description. Preserve it for future title-style fallback work.
    if (readString(rec.description) === undefined) {
      const desc = readString(detail.description);
      if (desc) out.description = desc;
    }

    // city / state — extraListingData.location is flat ({city, state, …}).
    if (readString(rec.city) === undefined || readString(rec.state) === undefined) {
      const loc = detail.location;
      if (loc && typeof loc === "object" && !Array.isArray(loc)) {
        const l = loc as Record<string, unknown>;
        if (readString(rec.city) === undefined) {
          const city = readString(l.city);
          if (city) out.city = city;
        }
        if (readString(rec.state) === undefined) {
          const state = readString(l.state);
          if (state) out.state = state;
        }
      }
    }
  }

  // Basic-mode city/state fallback — top-level `location.reverse_geocode`
  // structure is what the search-results-only payload provides.
  if (readString(rec.city) === undefined && readString(out.city as unknown) === undefined) {
    const topLoc = rec.location;
    if (topLoc && typeof topLoc === "object" && !Array.isArray(topLoc)) {
      const rg = (topLoc as { reverse_geocode?: unknown }).reverse_geocode;
      if (rg && typeof rg === "object" && !Array.isArray(rg)) {
        const r = rg as Record<string, unknown>;
        const city = readString(r.city);
        if (city) out.city = city;
        const state = readString(r.state);
        if (state) out.state = state;
      }
    }
  }

  // ── Subtitle mileage fallback (basic mode only) ───────────────────────────
  // Basic-mode dataset items frequently carry mileage in the rendered subtitle
  // (e.g. "64K miles", "129K miles · Dealership"). Used ONLY when extraListing-
  // Data is absent — detail-mode items have a structured odometer field with
  // an explicit unit, and trusting the subtitle when detail data is present
  // risks reporting kilometres as miles.
  const detailModeOdometerPresent =
    eld && typeof eld === "object" && !Array.isArray(eld) &&
    (eld as Record<string, unknown>).vehicle_odometer_data !== undefined;
  if (typeof out.mileage !== "number" && !detailModeOdometerPresent) {
    const fromSub = extractMileageFromSubtitles(rec.custom_sub_titles_with_rendering_flags);
    if (fromSub !== undefined) out.mileage = fromSub;
  }

  return out;
}

interface SubtitleEntry {
  subtitle?: unknown;
}

function extractMileageFromSubtitles(value: unknown): number | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const entry of value as SubtitleEntry[]) {
    const text = readString(entry?.subtitle);
    if (!text) continue;
    const parsed = parseSubtitleMileage(text);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
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
