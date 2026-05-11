import type { NormalizedListingInput, BuyBoxRule, BuyBoxMatch } from "../types/domain";

function ruleMatches(listing: NormalizedListingInput, rule: BuyBoxRule): boolean {
  if (rule.yearMin !== null && (listing.year ?? 0) < rule.yearMin) return false;
  if (rule.yearMax !== null && (listing.year ?? 9999) > rule.yearMax) return false;
  if (rule.maxMileage !== null && (listing.mileage ?? Infinity) > rule.maxMileage) return false;
  if (rule.minMileage !== null && (listing.mileage ?? 0) < rule.minMileage) return false;
  if (rule.regions !== null && listing.region && !rule.regions.includes(listing.region)) return false;
  if (rule.sources !== null && !rule.sources.includes(listing.source)) return false;
  if (rule.make !== null) {
    const makes = rule.make.split(",").map(m => m.trim().toLowerCase());
    if (listing.make && !makes.includes(listing.make.toLowerCase())) return false;
  }
  return true;
}

function computeScore(
  listing: NormalizedListingInput,
  rule: BuyBoxRule,
  mmrValue: number | undefined,
): number {
  let score = 50;

  if (rule.targetPricePctOfMmr !== null && mmrValue && listing.price) {
    const actualPct = (listing.price / mmrValue) * 100;
    const target = Number(rule.targetPricePctOfMmr);
    if (actualPct <= target) score += 30;
    else if (actualPct <= target + 5) score += 15;
    else if (actualPct <= target + 10) score += 5;
    else score -= 10;
  }

  if (rule.maxMileage !== null && listing.mileage !== undefined) {
    const pct = listing.mileage / rule.maxMileage;
    if (pct < 0.5) score += 20;
    else if (pct < 0.75) score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

export function matchBuyBox(
  listing: NormalizedListingInput,
  rules: BuyBoxRule[],
  mmrValue?: number,
): BuyBoxMatch | null {
  const sorted = [...rules]
    .filter(r => r.isActive)
    .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));

  for (const rule of sorted) {
    if (!ruleMatches(listing, rule)) continue;
    return {
      ruleId: rule.ruleId,
      ruleVersion: rule.version,
      ruleDbId: rule.id,
      score: computeScore(listing, rule, mmrValue),
    };
  }
  return null;
}
