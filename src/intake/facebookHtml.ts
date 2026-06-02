/** Decode common HTML entities in meta tag content and JSON string literals. */
export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(parseInt(dec, 10)));
}

export type FacebookHtmlExtract = {
  title?: string;
  price?: number;
  mileage?: number;
  vin?: string;
};

function readMetaContent(html: string, property: string): string | undefined {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const forward = new RegExp(
    `<meta\\s+property="${escaped}"\\s+content="([^"]*)"`,
    "i",
  );
  const reverse = new RegExp(
    `<meta\\s+content="([^"]*)"\\s+property="${escaped}"`,
    "i",
  );
  const hit = html.match(forward)?.[1] ?? html.match(reverse)?.[1];
  return hit ? decodeHtmlEntities(hit.trim()) : undefined;
}

function readJsonStringField(html: string, field: string): string | undefined {
  const re = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "i");
  const hit = html.match(re)?.[1];
  if (!hit) return undefined;
  return decodeHtmlEntities(hit.replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim());
}

function readJsonNumberField(html: string, field: string): number | undefined {
  const re = new RegExp(`"${field}"\\s*:\\s*(\\d+)`, "i");
  const hit = html.match(re)?.[1];
  if (!hit) return undefined;
  const n = Number(hit);
  return Number.isFinite(n) ? n : undefined;
}

function parsePriceAmount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[$,\s]/g, "").replace(/\.00$/, "");
  const kMatch = cleaned.match(/^(\d+(?:\.\d+)?)k$/i);
  if (kMatch) {
    const n = Math.round(parseFloat(kMatch[1]!) * 1000);
    return n >= 500 && n <= 500_000 ? n : undefined;
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 500 || n > 500_000) return undefined;
  return Math.round(n);
}

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

function normalizeVin(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const candidate = raw.trim().toUpperCase();
  return VIN_REGEX.test(candidate) ? candidate : undefined;
}

/**
 * Best-effort extraction from a Facebook Marketplace HTML document.
 * Pure — no network I/O.
 */
export function extractFacebookListingFromHtml(html: string): FacebookHtmlExtract {
  const result: FacebookHtmlExtract = {};

  const ogTitle = readMetaContent(html, "og:title");
  if (ogTitle) result.title = ogTitle;

  const metaPrice = readMetaContent(html, "product:price:amount");
  result.price =
    parsePriceAmount(metaPrice) ??
    parsePriceAmount(readJsonStringField(html, "formatted_price")) ??
    parsePriceAmount(
      html.match(/"listing_price"\s*:\s*\{[^}]*"amount"\s*:\s*"([^"]+)"/i)?.[1],
    ) ??
    parsePriceAmount(html.match(/"listing_price"\s*:\s*\{[^}]*"amount"\s*:\s*(\d+)/i)?.[1]);

  result.mileage =
    readJsonNumberField(html, "mileage") ??
    readJsonNumberField(html, "odometer");

  const odometerBlock = html.match(
    /"vehicle_odometer_data"\s*:\s*\{[^}]*"value"\s*:\s*(\d+)/i,
  )?.[1];
  if (odometerBlock) {
    const n = Number(odometerBlock);
    if (Number.isFinite(n) && n >= 0 && n <= 2_000_000) result.mileage = n;
  }

  result.vin =
    normalizeVin(readJsonStringField(html, "vin")) ??
    normalizeVin(readJsonStringField(html, "VIN"));

  const listingTitle = readJsonStringField(html, "marketplace_listing_title");
  if (listingTitle && (!result.title || listingTitle.length > result.title.length)) {
    result.title = listingTitle;
  }

  if (!result.title) {
    const docTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    if (docTitle) result.title = decodeHtmlEntities(docTitle.trim());
  }

  return result;
}
