/**
 * Map an e-commerce/automotive-scraper (schema.org Car) dataset item into the
 * flat Craigslist shape that src/sources/craigslist.ts expects.
 *
 * Item 67 Phase 0 — the Apify actor emits nested schema.org fields
 * (`name`, `brand.name`, `vehicleModelDate`, `offers.price`, …). The TAV
 * Craigslist adapter (item 63) expects flat keys (`title`, `make`, `year`,
 * `priceUsd`, …). Without this bridge, webhook/eval cannot score listings.
 *
 * Non-destructive: preserves every original key and only fills missing flat
 * aliases the Craigslist adapter reads.
 */

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned) return undefined;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function readYear(value: unknown): number | undefined {
  const n = readFiniteNumber(value);
  if (n === undefined) return undefined;
  const year = Math.round(n);
  if (year >= 1900 && year <= 2099) return year;
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function extractBrandName(brand: unknown): string | undefined {
  const direct = readString(brand);
  if (direct) return direct;
  const rec = asRecord(brand);
  return rec ? readString(rec.name) : undefined;
}

function extractOfferPrice(offers: unknown): number | undefined {
  const rec = asRecord(offers);
  if (!rec) return undefined;
  return readFiniteNumber(rec.price);
}

function extractMileage(value: unknown): number | undefined {
  const direct = readFiniteNumber(value);
  if (direct !== undefined && direct >= 0 && direct <= 500_000) return Math.round(direct);

  const rec = asRecord(value);
  if (!rec) return undefined;
  const n = readFiniteNumber(rec.value);
  if (n === undefined || n < 0 || n > 500_000) return undefined;
  return Math.round(n);
}

function extractVin(value: unknown): string | undefined {
  const raw = readString(value);
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  return VIN_REGEX.test(upper) ? upper : undefined;
}

function extractImages(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const urls = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return urls.length > 0 ? urls : undefined;
}

function extractPostedAt(value: unknown): string | undefined {
  const raw = readString(value);
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

function extractCityState(
  ap: Record<string, unknown> | undefined,
  itemLocation: unknown,
): { city?: string; state?: string } {
  const cityFromAp = ap ? readString(ap.city) ?? readString(ap.geoPlacename) : undefined;
  const stateFromAp = ap ? readString(ap.state) ?? readString(ap.addressRegion) : undefined;
  if (cityFromAp || stateFromAp) {
    return {
      ...(cityFromAp && { city: cityFromAp }),
      ...(stateFromAp && {
        state: stateFromAp.length === 2 ? stateFromAp.toUpperCase() : stateFromAp,
      }),
    };
  }

  const place = asRecord(itemLocation);
  const address = place ? asRecord(place.address) : undefined;
  if (!address) return {};
  const city = readString(address.addressLocality);
  const stateRaw = readString(address.addressRegion);
  return {
    ...(city && { city }),
    ...(stateRaw && { state: stateRaw.length === 2 ? stateRaw.toUpperCase() : stateRaw }),
  };
}

function preferCraigslistUrl(
  rec: Record<string, unknown>,
  ap: Record<string, unknown> | undefined,
): string | undefined {
  // Prefer the classic /{id}.html URL so extractSourceListingId can recover the
  // numeric posting id from the path when source_listing_id is absent.
  const requested = ap ? readString(ap.requestedUrl) : undefined;
  if (requested) return requested;
  const canonical = ap ? readString(ap.canonicalUrl) : undefined;
  if (canonical) return canonical;
  return (
    readString(rec.url) ??
    readString(rec.listingUrl) ??
    readString(rec.listing_url) ??
    readString(rec.link)
  );
}

function hasScalarPrice(rec: Record<string, unknown>): boolean {
  return (
    readFiniteNumber(rec.price) !== undefined ||
    readFiniteNumber(rec.priceUsd) !== undefined ||
    readFiniteNumber(rec.price_usd) !== undefined
  );
}

function hasMileageField(rec: Record<string, unknown>): boolean {
  return (
    typeof rec.mileage === "number" ||
    typeof rec.miles === "number" ||
    typeof rec.odometer === "number"
  );
}

function hasSourceListingId(rec: Record<string, unknown>): boolean {
  return (
    readString(rec.source_listing_id) !== undefined ||
    readString(rec.sourceListingId) !== undefined ||
    readString(rec.postId) !== undefined ||
    readString(rec.post_id) !== undefined ||
    typeof rec.id === "string" ||
    typeof rec.id === "number"
  );
}

/**
 * Idempotent. Items that already have flat Craigslist-adapter fields keep
 * them; only absent fields are filled from schema.org / additionalProperties.
 *
 * Returns the item unchanged when not an object — downstream adapter code
 * rejects it with its existing error path.
 */
export function mapAutomotiveScraperItem(item: unknown): unknown {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const rec = item as Record<string, unknown>;
  const ap = asRecord(rec.additionalProperties);
  const out: Record<string, unknown> = { ...rec };

  const preferredUrl = preferCraigslistUrl(rec, ap);
  if (preferredUrl) {
    // Prefer classic requestedUrl when present so posting id is recoverable.
    if (ap && readString(ap.requestedUrl)) {
      out.url = preferredUrl;
    } else if (
      readString(rec.url) === undefined &&
      readString(rec.listingUrl) === undefined &&
      readString(rec.listing_url) === undefined &&
      readString(rec.link) === undefined
    ) {
      out.url = preferredUrl;
    }
  }

  if (readString(rec.title) === undefined && readString(rec.Title) === undefined) {
    const title = readString(rec.name) ?? (ap ? readString(ap.postingTitle) : undefined);
    if (title) out.title = title;
  }

  if (readFiniteNumber(rec.year) === undefined) {
    const year = (ap ? readYear(ap.year) : undefined) ?? readYear(rec.vehicleModelDate);
    if (year !== undefined) out.year = year;
  }

  if (readString(rec.make) === undefined) {
    const make =
      extractBrandName(rec.brand) ??
      (ap ? readString(ap.make) ?? readString(ap.makeName) : undefined);
    if (make) out.make = make;
  }

  if (readString(rec.model) === undefined) {
    const model = ap ? readString(ap.model) ?? readString(ap.modelName) : undefined;
    if (model) out.model = model;
  }

  if (readString(rec.trim) === undefined && ap) {
    const trim = readString(ap.trim) ?? readString(ap.trimName);
    if (trim) out.trim = trim;
  }

  if (!hasScalarPrice(rec)) {
    const price =
      extractOfferPrice(rec.offers) ?? (ap ? readFiniteNumber(ap.price) : undefined);
    if (price !== undefined) out.priceUsd = price;
  }

  if (!hasMileageField(rec)) {
    const mileage =
      extractMileage(rec.mileageFromOdometer) ??
      (ap ? extractMileage(ap.mileage) ?? extractMileage(ap.odometer) : undefined);
    if (mileage !== undefined) out.mileage = mileage;
  }

  if (
    readString(rec.vin) === undefined &&
    readString(rec.VIN) === undefined &&
    readString(rec.Vin) === undefined
  ) {
    const vin =
      extractVin(rec.vehicleIdentificationNumber) ??
      (ap ? extractVin(ap.vin) : undefined);
    if (vin) out.vin = vin;
  }

  // Adapter reads body_text OR description; copy schema.org description to
  // body_text for Craigslist contract parity when body_text is absent.
  if (readString(rec.body_text) === undefined) {
    const desc = readString(rec.description);
    if (desc) out.body_text = desc;
  }

  if (
    readString(rec.posted_at) === undefined &&
    readString(rec.postedAt) === undefined &&
    readString(rec.listedAt) === undefined
  ) {
    const posted =
      extractPostedAt(rec.datePosted) ??
      (ap ? extractPostedAt(ap.postedDate) ?? extractPostedAt(ap.postedDateUtc) : undefined);
    if (posted) out.posted_at = posted;
  }

  const hasImages =
    (Array.isArray(rec.images) && rec.images.length > 0) ||
    (Array.isArray(rec.imageUrls) && rec.imageUrls.length > 0);
  if (!hasImages) {
    const images =
      extractImages(rec.image) ?? (ap ? extractImages(ap.images) : undefined);
    if (images) out.images = images;
  }

  if (!hasSourceListingId(rec) && ap) {
    const postingId = ap.postingId;
    if (typeof postingId === "number" && Number.isFinite(postingId)) {
      out.source_listing_id = String(postingId);
    } else if (typeof postingId === "string" && postingId.trim()) {
      out.source_listing_id = postingId.trim();
    }
  }

  if (readString(rec.city) === undefined || readString(rec.state) === undefined) {
    const { city, state } = extractCityState(ap, rec.itemLocation);
    if (readString(rec.city) === undefined && city) out.city = city;
    if (readString(rec.state) === undefined && state) out.state = state;
  }

  if (
    readString(rec.seller_name) === undefined &&
    readString(rec.sellerName) === undefined &&
    readString(rec.seller) === undefined
  ) {
    const offers = asRecord(rec.offers);
    const seller = offers ? asRecord(offers.seller) : undefined;
    const sellerName = seller ? readString(seller.name) : undefined;
    if (sellerName) {
      out.seller_name = sellerName;
    } else if (ap) {
      const sellerType = readString(ap.sellerType);
      if (sellerType) out.seller_name = sellerType;
    }
  }

  // Help Craigslist attribute-based mileage / ymm fallbacks when flat fields
  // are sparse: mirror attributesByLabel into `attributes` if absent.
  if (!asRecord(rec.attributes) && ap) {
    const byLabel = asRecord(ap.attributesByLabel);
    if (byLabel) out.attributes = { ...byLabel };
  }

  return out;
}
