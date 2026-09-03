/**
 * Item 71 Phase 0 — zero-token dealer detection from listing text + seller name.
 *
 * High precision over recall: a private-party false positive hides a real car
 * from buyers. Weak signals (CARFAX, "financing") never auto-reject on their
 * own. Strong signals (dealership, auto group, stock #, "we finance") do.
 */

export type SellerType = "dealer" | "private_party" | "curbstoner_suspected" | "unknown";

export type SellerClassification = {
  sellerType: SellerType;
  confidence: number;
  reasoning: string;
  signals: string[];
  source: "heuristic" | "llm";
};

export type SellerClassifyInput = {
  title?: string | null;
  description?: string | null;
  sellerName?: string | null;
  /** Listing photo URLs. Heuristics ignore these; the Haiku vision path uses them. */
  images?: string[] | null;
};

export const DEALER_AUTO_REJECT_CONFIDENCE = 0.85;

type WeightedSignal = { id: string; weight: "strong" | "medium" | "weak" };

const STRONG_PATTERNS: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: "dealership", re: /\bdealerships?\b/i },
  { id: "auto_group", re: /\bauto\s+group\b/i },
  { id: "auto_sales", re: /\bauto\s+sales\b/i },
  { id: "licensed_dealer", re: /\blicensed\s+dealers?\b/i },
  { id: "used_car_dealer", re: /\bused\s+car\s+dealers?\b/i },
  { id: "we_finance", re: /\bwe\s+finance\b/i },
  { id: "bad_credit", re: /\bbad\s+credit\b/i },
  { id: "in_house_financing", re: /\bin[-\s]?house\s+financ/i },
  { id: "stock_number", re: /\bstock\s*(?:#|no\.?|number)\b/i },
  { id: "visit_our_lot", re: /\bvisit\s+our\s+lot\b/i },
  { id: "our_inventory", re: /\bour\s+inventory\b/i },
  { id: "over_n_vehicles", re: /\bover\s+\d{2,}\s+(?:vehicles|cars|trucks)\b/i },
  { id: "down_payment", re: /\bdown\s+payments?\b|\benganche\b/i },
  { id: "bhph", re: /\bbhph\b/i },
  { id: "this_vehicle_for_sale_by", re: /\bthis vehicle is for sale by\b/i },
  { id: "for_sale_by_business", re: /\bfor sale by\b(?!\s+owner).{0,80}\b(?:llc|l\.l\.c\.|inc\.?|incorporated|motors|cars|auto)\b/i },
  { id: "cars_llc", re: /\b(?:cars|auto|motors|automotive)\s+llc\b/i },
  { id: "financing_available", re: /\bfinanc(?:ing|e)\s+available\b|\bfinanciamiento\b/i },
  { id: "all_credit", re: /\ball credit\b|\bno social\b|\bitin\b/i },
];

const MEDIUM_PATTERNS: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: "business_suffix", re: /\b(?:llc|l\.l\.c\.|inc\.?|incorporated)\b/i },
  { id: "motors_name", re: /\bmotors\b/i },
  { id: "automotive", re: /\bautomotive\b/i },
  { id: "car_lot", re: /\bcar\s+lot\b/i },
  { id: "apply_now", re: /\bapply\s+now\b/i },
  { id: "buy_here_pay_here", re: /\bbuy\s+here\s+pay\s+here\b/i },
];

const WEAK_PATTERNS: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: "carfax", re: /\bcarfax\b/i },
  { id: "financing", re: /\bfinanc(?:e|ing|ial)\b/i },
  { id: "warranty", re: /\bwarrant(?:y|ies)\b/i },
  { id: "inventory", re: /\binventory\b/i },
  { id: "multiple_vehicles", re: /\b(?:other\s+(?:cars|vehicles|trucks)|more\s+vehicles|we\s+have\s+more)\b/i },
];

function haystack(input: SellerClassifyInput): string {
  return [input.sellerName, input.title, input.description].filter(Boolean).join(" \n ");
}

function collectSignals(text: string): WeightedSignal[] {
  const hits: WeightedSignal[] = [];
  const seen = new Set<string>();
  const push = (id: string, weight: WeightedSignal["weight"]) => {
    if (seen.has(id)) return;
    seen.add(id);
    hits.push({ id, weight });
  };
  for (const { id, re } of STRONG_PATTERNS) {
    if (re.test(text)) push(id, "strong");
  }
  for (const { id, re } of MEDIUM_PATTERNS) {
    if (re.test(text)) push(id, "medium");
  }
  for (const { id, re } of WEAK_PATTERNS) {
    if (re.test(text)) push(id, "weak");
  }
  return hits;
}

function confidenceFromSignals(hits: WeightedSignal[]): number {
  const strong = hits.filter((h) => h.weight === "strong").length;
  const medium = hits.filter((h) => h.weight === "medium").length;
  const weak = hits.filter((h) => h.weight === "weak").length;
  if (strong >= 1) return 0.92;
  if (medium >= 2) return 0.88;
  if (medium === 1 && weak >= 1) return 0.86;
  if (medium === 1) return 0.55;
  if (weak >= 2) return 0.45;
  if (weak === 1) return 0.3;
  return 0;
}

function reasoningFromSignals(hits: WeightedSignal[]): string {
  if (hits.length === 0) return "No dealer language in title, description, or seller name.";
  return `Dealer signals: ${hits.map((h) => h.id).join(", ")}.`;
}

export function classifyListingSellerHeuristic(input: SellerClassifyInput): SellerClassification {
  const hits = collectSignals(haystack(input));
  const confidence = confidenceFromSignals(hits);
  if (hits.length === 0) {
    return {
      sellerType: "unknown",
      confidence: 0,
      reasoning: reasoningFromSignals(hits),
      signals: [],
      source: "heuristic",
    };
  }
  return {
    sellerType: "dealer",
    confidence,
    reasoning: reasoningFromSignals(hits),
    signals: hits.map((h) => h.id),
    source: "heuristic",
  };
}

export function shouldAutoRejectDealer(classification: SellerClassification): boolean {
  return (
    classification.sellerType === "dealer" &&
    classification.confidence >= DEALER_AUTO_REJECT_CONFIDENCE
  );
}
