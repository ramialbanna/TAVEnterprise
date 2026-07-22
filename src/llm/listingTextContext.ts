/**
 * Item 60 — extract seller text and structured hints from a raw ingest item
 * (Apify-mapped or flat) for the Claude Y/M/M/S prompt. Pure, no I/O.
 */

export const LLM_LISTING_TEXT_MAX_CHARS = 2000;

export type LlmListingTextContext = {
  description?: string;
  condition?: string;
  /** Actual odometer from the listing payload only — never estimated (item 54). */
  listingMileage?: number;
  location?: string;
};

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function capText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

/**
 * Reads description, condition, mileage, and location from fields the Facebook
 * adapter and `mapRaidrApiItem()` already populate (including nested
 * `extraListingData` when detail fetch is on).
 */
export function extractLlmListingTextFromIngestItem(item: unknown): LlmListingTextContext {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    return {};
  }

  const rec = item as Record<string, unknown>;
  const out: LlmListingTextContext = {};

  let description = readString(rec.description);
  let condition = readString(rec.condition);
  let city = readString(rec.city);
  let state = readString(rec.state);

  const extra = rec.extraListingData;
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    const detail = extra as Record<string, unknown>;
    description ??= readString(detail.description);
    condition ??= readString(detail.condition);

    if (!city || !state) {
      const loc = detail.location;
      if (loc && typeof loc === "object" && !Array.isArray(loc)) {
        const locRec = loc as Record<string, unknown>;
        city ??= readString(locRec.city);
        state ??= readString(locRec.state);
      }
    }
  }

  if (description) {
    out.description = capText(description, LLM_LISTING_TEXT_MAX_CHARS);
  }
  if (condition) {
    out.condition = capText(condition, 200);
  }

  if (typeof rec.mileage === "number" && Number.isFinite(rec.mileage) && rec.mileage >= 0) {
    out.listingMileage = rec.mileage;
  }

  if (city && state) out.location = `${city}, ${state}`;
  else if (city) out.location = city;
  else if (state) out.location = state;

  return out;
}
