export interface CatalogStyleSelectionInput {
  styles: readonly string[];
  title?: string | null;
  trim?: string | null;
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

function collectSignals(title?: string | null, trim?: string | null): string[] {
  const evidence = normalizeToken([title, trim].filter(Boolean).join(" "));
  const signals: string[] = [];
  const explicitTrim = normalizeToken(trim ?? "");
  if (explicitTrim) signals.push(explicitTrim);

  for (const signal of SIGNALS) {
    const normalized = normalizeToken(signal);
    if (!normalized || signals.includes(normalized)) continue;
    if (hasPhrase(evidence, normalized)) signals.push(normalized);
  }
  return signals;
}

function scoreStyle(style: string, signals: readonly string[]): { score: number; matched: string[] } {
  const normalizedStyle = normalizeToken(style);
  let score = 0;
  const matched: string[] = [];

  for (const signal of signals) {
    if (!hasPhrase(normalizedStyle, signal)) continue;
    matched.push(signal);
    score += HIGH_VALUE_SIGNALS.has(signal) ? 6 : signal.length <= 3 ? 4 : 3;
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

  const signals = collectSignals(input.title, input.trim);
  if (signals.length === 0) {
    return { style: styles[0]!, matchedSignals: [], isEstimated: true };
  }

  const scored = styles
    .map((style) => ({ style, ...scoreStyle(style, signals) }))
    .filter((row) => row.score >= 6)
    .sort((a, b) => b.score - a.score || b.matched.length - a.matched.length);

  if (scored.length === 0) {
    return { style: styles[0]!, matchedSignals: [], isEstimated: true };
  }
  const [best, second] = scored;
  if (!best) return null;
  if (second && second.score === best.score && second.matched.length === best.matched.length) {
    return { style: styles[0]!, matchedSignals: best.matched, isEstimated: true };
  }
  return { style: best.style, matchedSignals: best.matched, isEstimated: false };
}
