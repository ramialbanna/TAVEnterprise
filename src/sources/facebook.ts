import type { AdapterResult, NormalizedListingInput, RegionKey } from "../types/domain";

export type AdapterContext = {
  region: RegionKey;
  scrapedAt: string;
  sourceRunId: string;
};

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

// ── Make data ─────────────────────────────────────────────────────────────────

const MAKE_ALIASES: Record<string, string> = {
  "chevy": "chevrolet",
  "chev": "chevrolet",
  "vw": "volkswagen",
  "mercedes": "mercedes-benz",
  "benz": "mercedes-benz",
  "dodge ram": "ram",
};

// Multi-word makes listed before single-word so bigram matching runs first.
const CANONICAL_MAKES: readonly string[] = [
  "alfa romeo", "land rover", "mercedes-benz", "rolls-royce",
  "acura", "audi", "bmw", "buick", "cadillac", "chevrolet", "chrysler",
  "dodge", "ferrari", "fiat", "ford", "genesis", "gmc", "honda",
  "hyundai", "infiniti", "jaguar", "jeep", "kia", "lexus", "lincoln",
  "lucid", "maserati", "mazda", "mini", "mitsubishi", "nissan",
  "polestar", "porsche", "ram", "rivian", "subaru", "tesla",
  "toyota", "volkswagen", "volvo",
];

// Checked only at the START of the post-make remainder string.
const KNOWN_MODELS: readonly string[] = [
  "f-150", "f-250", "f-350", "f-450",
  "1500", "2500", "3500",
  "cx-5", "cx-9", "cx-30", "cx-50",
  "cr-v", "hr-v",
  "3-series", "5-series", "7-series",
  "c-class", "e-class", "s-class", "g-class", "a-class",
  "model 3", "model s", "model x", "model y",
  "r1t", "r1s",
  "rx350", "rx450h", "es350", "is300", "gx460",
  "500e",
];

// Single-word trims act as stop tokens during generic model extraction.
const KNOWN_TRIMS: readonly string[] = [
  "ex-l", "big horn", "laramie longhorn", "road warrior", "king ranch",
  "sport", "se", "sel", "le", "xle", "xse",
  "ex", "lx", "dx", "sx", "limited", "premium",
  "xlt", "lariat", "laramie", "rebel", "platinum",
  "slt", "denali", "at4",
  "touring", "base", "luxury", "signature",
  "tradesman",
];

const TRIM_STOP_SET: ReadonlySet<string> = new Set(
  KNOWN_TRIMS.filter(t => !t.includes(" ")),
);

const MODEL_STOP_RE =
  /\b(miles?|mi|km|clean|great|excellent|good|nice|runs?|asking|obo|firm|negotiable|priced)\b/i;

// ── Parsing helpers ───────────────────────────────────────────────────────────

function normaliseWs(s: string): string {
  // Replace Unicode dashes and non-breaking spaces with ASCII space.
  return s.replace(/[\u00a0\u2013\u2014]/g, " ").replace(/\s+/g, " ").trim();
}

function stripPricePatterns(s: string): string {
  return s.replace(/\$[\d,]+(?:\.\d+)?/g, " ");
}

function extractYear(title: string): number | undefined {
  const stripped = stripPricePatterns(title);

  // Extract any plausible 4-digit year (1900–2099), validate range in caller.
  const m4 = stripped.match(/\b(19\d{2}|20\d{2})\b/);
  const g4 = m4?.[1];
  if (g4 !== undefined) return parseInt(g4, 10);

  // Apostrophe shorthand: '19 → 2019, '95 → 1995.
  const m2 = stripped.match(/'(\d{2})\b/);
  const g2 = m2?.[1];
  if (g2 !== undefined) {
    const d = parseInt(g2, 10);
    return d <= 35 ? 2000 + d : 1900 + d;
  }

  return undefined;
}

function extractMake(
  title: string,
  year: number,
): { make: string; rest: string } | undefined {
  // Remove year token(s) so they don't interfere with make matching.
  const withoutYear = title
    .replace(new RegExp(`\\b${year}\\b`), "")
    .replace(/'\d{2}\b/g, "")
    .trim();
  const lower = withoutYear.toLowerCase();

  // Multi-word aliases first ("dodge ram" → "ram").
  for (const [alias, canonical] of Object.entries(MAKE_ALIASES)) {
    if (!alias.includes(" ")) continue;
    if (!lower.includes(alias)) continue;
    const idx = lower.indexOf(alias);
    return { make: canonical, rest: lower.slice(idx + alias.length).trim() };
  }

  // Single-word aliases ("chevy" → "chevrolet").
  for (const [alias, canonical] of Object.entries(MAKE_ALIASES)) {
    if (alias.includes(" ")) continue;
    const re = new RegExp(`\\b${alias}\\b`, "i");
    const idx = lower.search(re);
    if (idx === -1) continue;
    return { make: canonical, rest: lower.slice(idx + alias.length).trim() };
  }

  // Canonical makes (multi-word first by list order).
  for (const make of CANONICAL_MAKES) {
    if (!lower.includes(make)) continue;
    const idx = lower.indexOf(make);
    return { make, rest: lower.slice(idx + make.length).trim() };
  }

  return undefined;
}

function extractModel(
  rest: string,
): { model: string; remaining: string } | undefined {
  const lower = rest.toLowerCase().trim();

  // Known models matched only at the START of the remainder.
  for (const km of KNOWN_MODELS) {
    if (lower === km || lower.startsWith(km + " ") || lower.startsWith(km + ",")) {
      return { model: km, remaining: lower.slice(km.length).trim() };
    }
  }

  // Generic tokenisation — stop at trim words, mileage, punctuation.
  const tokens = lower.split(/\s+/);
  const modelTokens: string[] = [];

  for (const tok of tokens) {
    if (!tok) continue;
    if (MODEL_STOP_RE.test(tok)) break;
    if (/^[,|/]/.test(tok)) break;
    if (/^\d{5,}$/.test(tok)) break;    // bare 5-digit mileage
    if (/^\d+k$/i.test(tok)) break;     // "82k"
    if (TRIM_STOP_SET.has(tok)) break;  // trim token signals end of model
    modelTokens.push(tok);
    if (modelTokens.length === 2) break;
  }

  if (modelTokens.length === 0) return undefined;

  const model = modelTokens.join(" ");
  const remaining = lower.slice(model.length).trim();
  return { model, remaining };
}

function extractTrim(remaining: string): string | undefined {
  const lower = remaining.toLowerCase().trim();

  // Multi-word trims first.
  for (const t of KNOWN_TRIMS) {
    if (t.includes(" ") && (lower === t || lower.startsWith(t + " "))) return t;
  }
  for (const t of KNOWN_TRIMS) {
    if (!t.includes(" ") && new RegExp(`^${t}\\b`, "i").test(lower)) return t;
  }

  return undefined;
}

function parsePrice(
  raw: unknown,
): { price: number } | { price: undefined } | { invalid: true } {
  if (raw === undefined || raw === null || raw === "") return { price: undefined };

  const s = String(raw).trim().toLowerCase();
  // Explicit "free" is invalid (zero-value intent), not missing.
  if (s === "free") return { invalid: true };
  // "Message for price" / "make offer" = seller omitted price intentionally.
  if (s.startsWith("message") || s.startsWith("make offer")) {
    return { price: undefined };
  }

  const cleaned = s.replace(/[$,\s]/g, "").replace(/\.00$/, "");

  // "18.5k" → 18500.
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

function parseMileage(
  item: Record<string, unknown>,
  title: string,
): number | undefined {
  const raw =
    item["mileage"] ?? item["miles"] ?? item["odometer"] ?? item["Mileage"];

  const parseNum = (s: string): number | undefined => {
    const c = s.replace(/,/g, "").trim().toLowerCase();
    const km = c.match(/^(\d+(?:\.\d+)?)k/);
    const kg = km?.[1];
    if (kg !== undefined) {
      const n = Math.round(parseFloat(kg) * 1000);
      return n >= 0 && n <= 500_000 ? n : undefined;
    }
    const pm = c.match(/^(\d+)/);
    const pg = pm?.[1];
    if (pg !== undefined) {
      const n = parseInt(pg, 10);
      return n >= 0 && n <= 500_000 ? n : undefined;
    }
    return undefined;
  };

  if (raw !== undefined && raw !== null) {
    const result = parseNum(String(raw));
    if (result !== undefined) return result;
  }

  // Fallback: scan title.
  const m = title.match(
    /\b(\d{1,3}(?:,\d{3})*|\d+(?:\.\d+)?k)\s*(?:miles?|mi|km)\b/i,
  );
  const mg = m?.[1];
  if (mg !== undefined) return parseNum(mg);

  return undefined;
}

function extractUrl(item: Record<string, unknown>): string | undefined {
  for (const key of ["url", "listingUrl", "listing_url", "marketplaceUrl", "link"]) {
    const v = item[key];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return undefined;
}

function extractSourceListingId(item: Record<string, unknown>): string | undefined {
  for (const key of ["id", "listingId", "listing_id", "fbId", "itemId"]) {
    const v = item[key];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return undefined;
}

// ── Public adapter ────────────────────────────────────────────────────────────

export function parseFacebookItem(item: unknown, ctx: AdapterContext): AdapterResult {
  try {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return fail("adapter_error", { received: typeof item });
    }

    const rec = item as Record<string, unknown>;

    const url = extractUrl(rec);
    if (!url) return fail("missing_identifier");

    const rawTitle = rec["title"];
    if (rawTitle === undefined || rawTitle === null || rawTitle === "") {
      return fail("missing_title");
    }
    if (typeof rawTitle !== "string") return fail("missing_title");
    const title = normaliseWs(rawTitle);
    if (title.length < 6) return fail("title_too_short");

    const year = extractYear(title);
    if (year === undefined) return fail("missing_ymm");
    if (year < 1990 || year > 2035) return fail("invalid_year");

    const makeResult = extractMake(title, year);
    if (!makeResult) return fail("missing_ymm");
    const { make, rest } = makeResult;

    const modelResult = extractModel(rest);
    if (!modelResult) return fail("missing_ymm");
    const { model, remaining } = modelResult;

    const priceRaw =
      rec["price"] ?? rec["Price"] ?? rec["listing_price"] ?? rec["listingPrice"];
    const priceResult = parsePrice(priceRaw);
    if ("invalid" in priceResult) return fail("invalid_price", { raw: priceRaw });

    const mileage = parseMileage(rec, title);
    const trim = extractTrim(remaining);
    const sourceListingId = extractSourceListingId(rec);

    const listing: NormalizedListingInput = {
      source: "facebook",
      url,
      title,
      scrapedAt: ctx.scrapedAt,
      sourceRunId: ctx.sourceRunId,
      region: ctx.region,
      year,
      make,
      model,
      ...(trim !== undefined && { trim }),
      ...(priceResult.price !== undefined && { price: priceResult.price }),
      ...(mileage !== undefined && { mileage }),
      ...(sourceListingId !== undefined && { sourceListingId }),
    };

    return { ok: true, listing };
  } catch (err) {
    return fail("adapter_error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
