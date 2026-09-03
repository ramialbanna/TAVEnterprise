/**
 * Ineligible title brands. Buyers do not want salvage / rebuilt inventory,
 * even from a private party. Independent of the dealer filter.
 */

export type SalvageOrRebuiltMatch = {
  kind: "salvage" | "rebuilt";
  matched: string;
};

const NEGATED_TITLE_BRAND =
  /\b(?:no|not|never|isn'?t|without)\s+(?:a\s+)?(?:salvage|rebuilt|reconstructed)(?:\s+titles?)?\b/i;

const SALVAGE_TITLE =
  /\b(?:salvage|flood)\s+titles?\b|\btitles?\s*(?:is|are|:)?\s*(?:salvage|flood)\b|\btitulo\s+salvage\b/i;

const REBUILT_TITLE =
  /\brebuilt\s+titles?\b|\breconstructed\s+titles?\b|\btitles?\s*(?:is|are|:)?\s*(?:rebuilt|reconstructed)\b|\btitulo\s+reconstruid/i;

function firstMatch(re: RegExp, text: string): string | null {
  const match = text.match(re);
  return match?.[0]?.trim() || null;
}

export function matchSalvageOrRebuiltTitle(text: string): SalvageOrRebuiltMatch | null {
  const haystack = text.trim();
  if (!haystack) return null;
  if (NEGATED_TITLE_BRAND.test(haystack)) return null;

  const salvage = firstMatch(SALVAGE_TITLE, haystack);
  if (salvage) return { kind: "salvage", matched: salvage };

  const rebuilt = firstMatch(REBUILT_TITLE, haystack);
  if (rebuilt) return { kind: "rebuilt", matched: rebuilt };

  return null;
}

export function listingHasSalvageOrRebuiltTitle(input: {
  title?: string | null;
  description?: string | null;
}): SalvageOrRebuiltMatch | null {
  return matchSalvageOrRebuiltTitle([input.title, input.description].filter(Boolean).join("\n"));
}
