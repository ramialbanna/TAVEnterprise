/**
 * Item 72 action 6 — listing-text hygiene shared by Facebook (and Craigslist
 * title fallback). Cab/bed and years are evidence, not Cox model/trim tokens.
 */

/** Longest first so "crew cab" wins over "crew". */
export const CAB_BED_PHRASES: readonly string[] = [
  "extended cab",
  "regular cab",
  "double cab",
  "super crew",
  "super cab",
  "crew cab",
  "quad cab",
  "mega cab",
  "king cab",
  "short bed",
  "long bed",
  "supercrew",
  "supercab",
];

const CAB_BED_TOKEN_STOP: ReadonlySet<string> = new Set([
  "crew",
  "cab",
  "double",
  "regular",
  "supercrew",
  "supercab",
  "quad",
  "mega",
  "bed",
]);

export function isYearToken(token: string): boolean {
  return /^(19|20)\d{2}$/.test(token);
}

/** Engine displacement like `2.5` / `5.0` — not a model token (`altima 2.5`). */
export function isDisplacementToken(token: string): boolean {
  return /^\d+\.\d+$/.test(token);
}

export function isCabOrBedStopToken(token: string): boolean {
  const t = token.toLowerCase();
  if (CAB_BED_TOKEN_STOP.has(t)) return true;
  if (t === "short" || t === "long") return true;
  return false;
}

/** True when the whole string is only cab/bed (e.g. structured trim `SuperCrew`). */
export function isCabOrBedOnly(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return CAB_BED_PHRASES.includes(normalized) || CAB_BED_TOKEN_STOP.has(normalized);
}

export function stripLeadingCabBed(remaining: string): string {
  let s = remaining.toLowerCase().replace(/\s+/g, " ").trim();
  let changed = true;
  while (changed && s) {
    changed = false;
    for (const phrase of CAB_BED_PHRASES) {
      if (s === phrase || s.startsWith(`${phrase} `)) {
        s = s.slice(phrase.length).trim();
        changed = true;
        break;
      }
    }
  }
  return s;
}
