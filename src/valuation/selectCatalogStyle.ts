import {
  expandSportUtilitySignals,
  isCatalogSeriesNumber,
  styleHasWholeToken,
} from "./catalogStyleTokens";

export interface CatalogStyleSelectionInput {
  styles: readonly string[];
  title?: string | null;
  trim?: string | null;
  /** Item 64 — seller body text when title is sparse. */
  description?: string | null;
}

export interface CatalogStyleSelection {
  style: string;
  matchedSignals: string[];
  isEstimated: boolean;
}

const SIGNALS: readonly string[] = [
  "Standard Range",
  "Extended Range",
  "Long Range",
  "Performance",
  "Regular Cab",
  "Standard Cab",
  "Extended Cab",
  "Double Cab",
  "Crew Cab",
  "Quad Cab",
  "Mega Cab",
  "SuperCrew",
  "SuperCab",
  "King Cab",
  "Long Bed",
  "Short Bed",
  "High Country",
  "King Ranch",
  "Big Horn",
  "TRD Off-Road",
  "TRD Sport",
  "TRD Pro",
  "Pro-4X",
  "Tradesman",
  "Trailhawk",
  "Laramie",
  "Lariat",
  "Longhorn",
  "Platinum",
  "Limited",
  "Rubicon",
  "Sahara",
  "Denali",
  "Rebel",
  "Sport",
  "Touring",
  "Luxury",
  "Premium",
  "RST",
  "SR5",
  "XLT",
  "XSE",
  "SLT",
  "SLE",
  "SEL",
  "EX-L",
  "XL",
  "LT",
  "LS",
  "LE",
  "SE",
  "EX",
  "LX",
  "Sedan",
  "SUV",
  "Sport Utility",
  "Crossover",
  "Coupe",
  "Hatchback",
  "Pickup",
  "Pickup Truck",
  "Minivan",
  "Station Wagon",
  "Wagon",
  "Convertible",
  "Roadster",
];

const HIGH_VALUE_SIGNALS = new Set([
  "STANDARD RANGE",
  "EXTENDED RANGE",
  "LONG RANGE",
  "PERFORMANCE",
  "REGULAR CAB",
  "STANDARD CAB",
  "EXTENDED CAB",
  "DOUBLE CAB",
  "CREW CAB",
  "QUAD CAB",
  "MEGA CAB",
  "SUPERCREW",
  "SUPERCAB",
  "KING CAB",
  "HIGH COUNTRY",
  "KING RANCH",
  "BIG HORN",
  "TRD OFF ROAD",
  "TRD SPORT",
  "TRD PRO",
  "PRO 4X",
]);

function normalizeToken(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  return new RegExp(`(?:^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: |$)`).test(haystack);
}

function collectSignals(
  title?: string | null,
  trim?: string | null,
  description?: string | null,
): string[] {
  const evidence = normalizeToken([title, trim, description].filter(Boolean).join(" "));
  const signals: string[] = [];
  const explicitTrim = normalizeToken(trim ?? "");
  if (explicitTrim) {
    signals.push(explicitTrim);
    for (const token of explicitTrim.split(" ")) {
      if (token && !signals.includes(token)) signals.push(token);
    }
  }

  for (const signal of SIGNALS) {
    const normalized = normalizeToken(signal);
    if (!normalized || signals.includes(normalized)) continue;
    if (hasPhrase(evidence, normalized)) signals.push(normalized);
  }

  for (const token of evidence.split(" ")) {
    if (isCatalogSeriesNumber(token) && !signals.includes(token)) signals.push(token);
  }

  return expandSportUtilitySignals(signals);
}

function unmatchedStyleTokenCount(style: string, evidence: string): number {
  const ev = new Set(normalizeToken(evidence).split(" ").filter(Boolean));
  if (ev.has("SPORT") && ev.has("UTILITY")) ev.add("SUV");
  let extra = 0;
  for (const token of normalizeToken(style).split(" ")) {
    if (token.length <= 1) continue;
    if (!ev.has(token)) extra += 1;
  }
  return extra;
}

function leftoverTrimHits(
  styles: readonly string[],
  trim?: string | null,
): string[] {
  const tokens = normalizeToken(trim ?? "")
    .split(" ")
    .filter((token) => token.length >= 2);
  if (tokens.length === 0) return [];
  return styles.filter((style) => tokens.some((token) => styleHasWholeToken(style, token)));
}

function scoreStyle(style: string, signals: readonly string[]): { score: number; matched: string[] } {
  const normalizedStyle = normalizeToken(style);
  let score = 0;
  const matched: string[] = [];

  for (const signal of signals) {
    if (!hasPhrase(normalizedStyle, signal)) continue;
    matched.push(signal);
    score +=
      HIGH_VALUE_SIGNALS.has(signal) || isCatalogSeriesNumber(signal)
        ? 6
        : signal.length <= 3
          ? 4
          : 3;
  }

  return { score, matched };
}

/**
 * Selects a Cox catalog style using listing evidence when possible. If no
 * single style can be proven, falls back to the first catalog option and marks
 * it estimated. Manheim's own UI presents that ordered style list; the caller
 * must surface the estimate marker instead of treating it as source truth.
 */
export function selectCatalogStyleForListing(
  input: CatalogStyleSelectionInput,
): CatalogStyleSelection | null {
  const styles = input.styles.filter((style) => style.trim().length > 0);
  if (styles.length === 0) return null;

  const signals = collectSignals(input.title, input.trim, input.description);
  if (signals.length === 0) {
    return { style: styles[0]!, matchedSignals: [], isEstimated: true };
  }

  const listingSeries = signals.filter(isCatalogSeriesNumber);
  const eligible =
    listingSeries.length === 0
      ? styles
      : styles.filter((style) => listingSeries.some((n) => styleHasWholeToken(style, n)));
  const pool = eligible.length > 0 ? eligible : styles;

  const evidence = [input.title, input.trim, input.description].filter(Boolean).join(" ");
  const scored = pool
    .map((style) => ({
      style,
      ...scoreStyle(style, signals),
      extra: unmatchedStyleTokenCount(style, evidence),
    }))
    .filter((row) => row.score >= 6)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.matched.length - a.matched.length ||
        a.extra - b.extra,
    );

  if (scored.length === 0) {
    const leftoverHits = leftoverTrimHits(pool, input.trim);
    if (leftoverHits.length > 0) {
      leftoverHits.sort((a, b) => unmatchedStyleTokenCount(a, evidence) - unmatchedStyleTokenCount(b, evidence));
      return {
        style: leftoverHits[0]!,
        matchedSignals: [],
        isEstimated: leftoverHits.length > 1,
      };
    }
    if (listingSeries.length > 0 && eligible.length > 0) {
      return {
        style: eligible[0]!,
        matchedSignals: listingSeries,
        isEstimated: eligible.length > 1,
      };
    }
    return { style: styles[0]!, matchedSignals: [], isEstimated: true };
  }
  const [best, second] = scored;
  if (!best) return null;
  if (
    second &&
    second.score === best.score &&
    second.matched.length === best.matched.length &&
    second.extra === best.extra
  ) {
    return { style: best.style, matchedSignals: best.matched, isEstimated: true };
  }
  return { style: best.style, matchedSignals: best.matched, isEstimated: false };
}

/** Rank Cox styles by title/trim evidence without picking a fallback style. */
export function rankCatalogStylesForListing(
  input: CatalogStyleSelectionInput,
): Array<{ style: string; score: number; matched: string[] }> {
  const styles = input.styles.filter((style) => style.trim().length > 0);
  if (styles.length === 0) return [];

  const signals = collectSignals(input.title, input.trim, input.description);
  if (signals.length === 0) return [];

  return styles
    .map((style) => ({ style, ...scoreStyle(style, signals) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.matched.length - a.matched.length);
}
