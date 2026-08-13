import type { AdapterResult, NormalizedListingInput } from "../types/domain";
import { parseFacebookItem, type AdapterContext } from "./facebook";

export type { AdapterContext };

type AdapterReasonCode =
  | "missing_identifier"
  | "missing_title"
  | "title_too_short"
  | "missing_ymm"
  | "invalid_year"
  | "invalid_price"
  | "adapter_error";

function fail(reason: AdapterReasonCode, details?: unknown): AdapterResult {
  return { ok: false, reason, details };
}

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

function normaliseWs(s: string): string {
  return s
    .replace(/[\u00a0\u2013\u2014]/g, " ")
    .replace(/\+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readLowerString(value: unknown): string | undefined {
  const s = readString(value);
  return s !== undefined ? s.toLowerCase() : undefined;
}

function readAttributes(rec: Record<string, unknown>): Record<string, unknown> | undefined {
  const raw = rec.attributes;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return undefined;
}

function parseIntegerField(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.round(value);
    return n >= 0 ? n : undefined;
  }
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/,/g, "").trim().toLowerCase();
  const km = cleaned.match(/^(\d+(?:\.\d+)?)\s*k\b/);
  if (km?.[1] !== undefined) {
    return Math.round(parseFloat(km[1]) * 1000);
  }
  const digits = cleaned.match(/^(\d+)/);
  if (digits?.[1] === undefined) return undefined;
  const n = parseInt(digits[1], 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function parseYearField(value: unknown): number | undefined {
  const n = parseIntegerField(value);
  if (n === undefined) return undefined;
  if (n >= 1900 && n <= 2099) return n;
  return undefined;
}

function extractUrl(rec: Record<string, unknown>): string | undefined {
  for (const key of ["url", "listingUrl", "listing_url", "link"]) {
    const v = rec[key];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return undefined;
}

function extractSourceListingId(rec: Record<string, unknown>, url: string): string | undefined {
  for (const key of ["source_listing_id", "sourceListingId", "postId", "post_id", "id"]) {
    const v = rec[key];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  const fromUrl = url.match(/\/(\d+)\.html(?:\?|$)/i);
  return fromUrl?.[1];
}

function extractVin(rec: Record<string, unknown>): string | undefined {
  for (const key of ["vin", "VIN", "Vin"]) {
    const raw = rec[key];
    if (typeof raw !== "string") continue;
    const candidate = raw.trim().toUpperCase();
    if (VIN_REGEX.test(candidate)) return candidate;
  }
  return undefined;
}

function extractImages(rec: Record<string, unknown>): string[] | undefined {
  for (const key of ["images", "imageUrls", "image_urls"]) {
    const raw = rec[key];
    if (!Array.isArray(raw)) continue;
    const urls = raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    if (urls.length > 0) return urls;
  }
  return undefined;
}

function extractDescription(rec: Record<string, unknown>): string | undefined {
  return readString(rec.body_text) ?? readString(rec.description);
}

function extractPostedAt(rec: Record<string, unknown>): string | undefined {
  for (const key of ["posted_at", "postedAt", "listedAt"]) {
    const raw = rec[key];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const ms = Date.parse(trimmed);
    if (!Number.isFinite(ms)) continue;
    return new Date(ms).toISOString();
  }
  return undefined;
}

function extractStateCode(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return trimmed;
}

function stripLocationParens(raw: string): string {
  return raw.replace(/^\((.*)\)$/, "$1").trim();
}

function extractCityState(
  rec: Record<string, unknown>,
): { city?: string; state?: string } {
  const city = readString(rec.city);
  const stateRaw = readString(rec.state);
  if (city || stateRaw) {
    return {
      ...(city && { city }),
      ...(stateRaw && { state: extractStateCode(stateRaw) }),
    };
  }

  const location = readString(rec.location) ?? readString(rec.location_raw);
  if (!location) return {};

  const stripped = stripLocationParens(location);
  const parts = stripped.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const statePart = parts[parts.length - 1]!;
    const cityPart = parts.slice(0, -1).join(", ");
    if (/^[A-Za-z]{2}$/.test(statePart)) {
      return { city: cityPart, state: statePart.toUpperCase() };
    }
  }

  return { city: stripped };
}

function extractStructuredYmm(
  rec: Record<string, unknown>,
  attrs: Record<string, unknown> | undefined,
): { year?: number; make?: string; model?: string; trim?: string } {
  const year = parseYearField(rec.year) ?? (attrs ? parseYearField(attrs.year) : undefined);
  const make = readLowerString(rec.make) ?? (attrs ? readLowerString(attrs.make) : undefined);
  const model = readLowerString(rec.model) ?? (attrs ? readLowerString(attrs.model) : undefined);
  const trim = readLowerString(rec.trim);

  return {
    ...(year !== undefined && { year }),
    ...(make !== undefined && { make }),
    ...(model !== undefined && { model }),
    ...(trim !== undefined && { trim }),
  };
}

function extractMileage(
  rec: Record<string, unknown>,
  attrs: Record<string, unknown> | undefined,
  title: string,
): number | undefined {
  const direct =
    parseIntegerField(rec.mileage) ??
    parseIntegerField(rec.miles) ??
    parseIntegerField(rec.odometer);
  if (direct !== undefined && direct <= 500_000) return direct;

  if (attrs) {
    const fromAttrs =
      parseIntegerField(attrs.odometer) ??
      parseIntegerField(attrs.mileage);
    if (fromAttrs !== undefined && fromAttrs <= 500_000) return fromAttrs;
  }

  // Reuse Facebook title/body mileage heuristics without duplicating logic.
  const fb = parseFacebookItem({ url: "https://craigslist.org/0.html", title }, {
    region: "dallas_tx",
    scrapedAt: new Date(0).toISOString(),
    sourceRunId: "ymm-fallback",
  });
  if (fb.ok && fb.listing.mileage !== undefined) return fb.listing.mileage;
  return undefined;
}

function extractPriceRaw(rec: Record<string, unknown>): unknown {
  if (rec.price !== undefined && rec.price !== null && rec.price !== "") return rec.price;
  if (rec.priceUsd !== undefined && rec.priceUsd !== null) return rec.priceUsd;
  if (rec.price_usd !== undefined && rec.price_usd !== null) return rec.price_usd;
  if (rec.price_raw !== undefined && rec.price_raw !== null && rec.price_raw !== "") return rec.price_raw;
  return undefined;
}

/**
 * Parse listing price without requiring a successful Facebook title/YMM probe.
 * Mirrors src/sources/facebook.ts `parsePrice` so structured-YMM Craigslist
 * rows (item 67 automotive-scraper) keep priceUsd when title parse fails.
 */
function parseListingPrice(
  raw: unknown,
): { price: number } | { price: undefined } | { invalid: true } {
  if (raw === undefined || raw === null || raw === "") return { price: undefined };

  const s = String(raw).trim().toLowerCase();
  if (s === "free") return { invalid: true };
  if (s.startsWith("message") || s.startsWith("make offer")) {
    return { price: undefined };
  }

  const cleaned = s.replace(/[$,\s]/g, "").replace(/\.00$/, "");
  const km = cleaned.match(/^(\d+(?:\.\d+)?)k$/);
  const kg = km?.[1];
  if (kg !== undefined) {
    const n = Math.round(parseFloat(kg) * 1000);
    if (n < 500 || n > 500_000) return { invalid: true };
    return { price: n };
  }

  const n = parseFloat(cleaned);
  if (isNaN(n) || n <= 0) return { invalid: true };
  if (n < 500 || n > 500_000) return { invalid: true };
  return { price: Math.round(n) };
}

const KNOWN_CRAIGSLIST_FIELDS: ReadonlySet<string> = new Set([
  "url", "listingUrl", "listing_url", "link",
  "source_listing_id", "sourceListingId", "postId", "post_id", "id",
  "title", "Title",
  "price", "priceUsd", "price_usd", "price_raw", "Price",
  "year", "make", "model", "trim",
  "mileage", "miles", "odometer", "Mileage",
  "vin", "VIN", "Vin",
  "city", "state", "location", "location_raw",
  "posted_at", "postedAt", "posted_at_raw", "listedAt", "updatedAt",
  "seller_name", "sellerName", "seller", "seller_type", "sellerType",
  "body_text", "description",
  "images", "imageUrls", "image_urls", "hasImages",
  "attributes", "scrape_meta",
  "region", "categorySlug", "categoryLabel", "subcategorySlug", "subcategoryLabel",
  "latitude", "longitude", "currency",
  "contactObfuscated", "phoneNumbers", "emails", "replyToken",
  "isDeleted", "scrapedAt",
]);

export type SchemaDriftEvent = {
  event_type: "unexpected_field";
  field_path: string;
  sample_value: unknown;
};

export function detectCraigslistDrift(item: Record<string, unknown>): SchemaDriftEvent[] {
  const events: SchemaDriftEvent[] = [];
  for (const key of Object.keys(item)) {
    if (!KNOWN_CRAIGSLIST_FIELDS.has(key)) {
      events.push({ event_type: "unexpected_field", field_path: key, sample_value: item[key] });
    }
  }
  return events;
}

export function parseCraigslistItem(item: unknown, ctx: AdapterContext): AdapterResult {
  try {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return fail("adapter_error", { received: typeof item });
    }

    const rec = item as Record<string, unknown>;

    if (rec.isDeleted === true) {
      return fail("adapter_error", { isDeleted: true });
    }

    const url = extractUrl(rec);
    if (!url) return fail("missing_identifier");

    const rawTitle = rec.title ?? rec.Title;
    if (rawTitle === undefined || rawTitle === null || rawTitle === "") {
      return fail("missing_title");
    }
    if (typeof rawTitle !== "string") return fail("missing_title");
    const title = normaliseWs(rawTitle);
    if (title.length < 6) return fail("title_too_short");

    const attrs = readAttributes(rec);
    let { year, make, model, trim } = extractStructuredYmm(rec, attrs);

    const priceRaw = extractPriceRaw(rec);
    let price: number | undefined;
    if (priceRaw !== undefined) {
      const priceResult = parseListingPrice(priceRaw);
      if ("invalid" in priceResult) {
        return fail("invalid_price", { raw: priceRaw });
      }
      if (priceResult.price !== undefined) price = priceResult.price;
    }

    if (year === undefined || !make || !model) {
      const fbYmm = parseFacebookItem({ url, title, ...(priceRaw !== undefined && { price: priceRaw }) }, ctx);
      if (!fbYmm.ok) {
        if (fbYmm.reason === "invalid_price") return fail("invalid_price", { raw: priceRaw });
        if (fbYmm.reason === "invalid_year") return fail("invalid_year");
        return fail("missing_ymm");
      }
      year ??= fbYmm.listing.year;
      make ??= fbYmm.listing.make;
      model ??= fbYmm.listing.model;
      trim ??= fbYmm.listing.trim;
      price ??= fbYmm.listing.price;
    } else {
      const fbTrim = parseFacebookItem({ url, title, ...(priceRaw !== undefined && { price: priceRaw }) }, ctx);
      if (fbTrim.ok) {
        trim ??= fbTrim.listing.trim;
        price ??= fbTrim.listing.price;
      }
    }

    if (year === undefined || !make || !model) return fail("missing_ymm");
    if (year < 2000 || year > 2035) return fail("invalid_year");

    const mileage = extractMileage(rec, attrs, title);
    const sourceListingId = extractSourceListingId(rec, url);
    const vin = extractVin(rec);
    const postedAt = extractPostedAt(rec);
    const sellerName = readString(rec.seller_name) ?? readString(rec.sellerName) ?? readString(rec.seller);
    const description = extractDescription(rec);
    const { city, state } = extractCityState(rec);
    const images = extractImages(rec);

    const listing: NormalizedListingInput = {
      source: "craigslist",
      url,
      title,
      scrapedAt: ctx.scrapedAt,
      sourceRunId: ctx.sourceRunId,
      region: ctx.region,
      year,
      make,
      model,
      ...(trim !== undefined && { trim }),
      ...(price !== undefined && { price }),
      ...(mileage !== undefined && { mileage }),
      ...(sourceListingId !== undefined && { sourceListingId }),
      ...(vin !== undefined && { vin }),
      ...(postedAt !== undefined && { postedAt }),
      ...(sellerName !== undefined && { sellerName }),
      ...(description !== undefined && { description }),
      ...(city !== undefined && { city }),
      ...(state !== undefined && { state }),
      ...(images !== undefined && { images }),
    };

    return { ok: true, listing };
  } catch (err) {
    return fail("adapter_error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
