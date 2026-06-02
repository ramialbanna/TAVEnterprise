import { detectListingSource, normalizeListingUrl } from "../manual/listingSource";
import { parseFacebookItem, type AdapterContext } from "../sources/facebook";
import type { SourceName } from "../types/domain";
import { extractFacebookListingFromHtml } from "./facebookHtml";

export type ParsedListingFields = {
  listingUrl: string;
  source: SourceName;
  title?: string;
  year?: number;
  make?: string;
  model?: string;
  style?: string;
  price?: number;
  mileage?: number;
  vin?: string;
  warnings: string[];
};

export type ParseListingUrlSuccess = {
  ok: true;
  data: ParsedListingFields;
};

export type ParseListingUrlFailure = {
  ok: false;
  error:
    | "invalid_listing_url"
    | "unsupported_source"
    | "fetch_failed"
    | "fetch_timeout"
    | "parse_failed";
  warnings: string[];
  supportedSources?: SourceName[];
};

export type ParseListingUrlResult = ParseListingUrlSuccess | ParseListingUrlFailure;

export type ParseListingDeps = {
  fetch: typeof fetch;
  now?: () => string;
};

const PARSE_FETCH_TIMEOUT_MS = 8_000;
const PARSE_USER_AGENT =
  "Mozilla/5.0 (compatible; TAV-AIP/1.0; +https://texasautovalue.com)";

const SUPPORTED_PARSE_SOURCES: SourceName[] = ["facebook"];

const INTAKE_ADAPTER_CTX: AdapterContext = {
  region: "dallas_tx",
  scrapedAt: "1970-01-01T00:00:00.000Z",
  sourceRunId: "00000000-0000-0000-0000-000000000000",
};

function hasUsefulFields(data: ParsedListingFields): boolean {
  return (
    Boolean(data.title?.trim()) ||
    (data.year !== undefined && Boolean(data.make) && Boolean(data.model)) ||
    data.price !== undefined ||
    data.mileage !== undefined ||
    Boolean(data.vin)
  );
}

function mapAdapterListing(
  listingUrl: string,
  listing: {
    title: string;
    year?: number;
    make?: string;
    model?: string;
    trim?: string;
    price?: number;
    mileage?: number;
    vin?: string;
  },
  warnings: string[],
): ParsedListingFields {
  return {
    listingUrl,
    source: "facebook",
    title: listing.title,
    year: listing.year,
    make: listing.make,
    model: listing.model,
    style: listing.trim,
    price: listing.price,
    mileage: listing.mileage,
    vin: listing.vin,
    warnings,
  };
}

function mergePartialFields(
  listingUrl: string,
  htmlExtract: ReturnType<typeof extractFacebookListingFromHtml>,
  warnings: string[],
): ParsedListingFields {
  return {
    listingUrl,
    source: "facebook",
    title: htmlExtract.title,
    price: htmlExtract.price,
    mileage: htmlExtract.mileage,
    vin: htmlExtract.vin,
    warnings,
  };
}

async function fetchListingHtml(
  listingUrl: string,
  deps: ParseListingDeps,
): Promise<{ ok: true; html: string } | { ok: false; error: "fetch_failed" | "fetch_timeout" }> {
  try {
    const response = await deps.fetch(listingUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": PARSE_USER_AGENT,
      },
      signal: AbortSignal.timeout(PARSE_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) return { ok: false, error: "fetch_failed" };

    const html = await response.text();
    if (!html.trim()) return { ok: false, error: "fetch_failed" };
    return { ok: true, html };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { ok: false, error: "fetch_timeout" };
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "fetch_timeout" };
    }
    return { ok: false, error: "fetch_failed" };
  }
}

/**
 * Server-side listing URL parse (Facebook v1). Does not write to the database.
 */
export async function parseListingUrl(
  listingUrlRaw: string,
  deps: ParseListingDeps = { fetch: globalThis.fetch.bind(globalThis) },
): Promise<ParseListingUrlResult> {
  let listingUrl: string;
  try {
    listingUrl = normalizeListingUrl(listingUrlRaw);
  } catch {
    return { ok: false, error: "invalid_listing_url", warnings: [] };
  }

  const source = detectListingSource(listingUrl);
  if (!source || !SUPPORTED_PARSE_SOURCES.includes(source)) {
    return {
      ok: false,
      error: "unsupported_source",
      warnings: [],
      supportedSources: SUPPORTED_PARSE_SOURCES,
    };
  }

  const fetched = await fetchListingHtml(listingUrl, deps);
  if (!fetched.ok) {
    return { ok: false, error: fetched.error, warnings: [] };
  }

  const htmlExtract = extractFacebookListingFromHtml(fetched.html);
  const warnings: string[] = [];

  if (!listingUrl.includes("/marketplace/")) {
    warnings.push("not_marketplace_url");
  }

  const adapterItem: Record<string, unknown> = {
    url: listingUrl,
    title: htmlExtract.title,
    price: htmlExtract.price,
    mileage: htmlExtract.mileage,
    vin: htmlExtract.vin,
  };

  const adapterResult = parseFacebookItem(adapterItem, {
    ...INTAKE_ADAPTER_CTX,
    scrapedAt: deps.now?.() ?? new Date().toISOString(),
  });

  if (adapterResult.ok) {
    if (htmlExtract.price !== undefined && adapterResult.listing.price === undefined) {
      warnings.push("price_from_html_only");
    }
    if (htmlExtract.mileage !== undefined && adapterResult.listing.mileage === undefined) {
      warnings.push("mileage_from_html_only");
    }
    const data = mapAdapterListing(listingUrl, adapterResult.listing, warnings);
    return { ok: true, data };
  }

  warnings.push(adapterResult.reason);
  const partial = mergePartialFields(listingUrl, htmlExtract, warnings);
  if (hasUsefulFields(partial)) {
    return { ok: true, data: partial };
  }

  return { ok: false, error: "parse_failed", warnings };
}
