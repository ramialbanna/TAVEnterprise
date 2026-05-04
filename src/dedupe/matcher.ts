import type { NormalizedListingInput, ValuationConfidence } from "../types/domain";

export interface SimilarityResult {
  score: number;
  confidence: ValuationConfidence;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function computeSimilarity(
  a: NormalizedListingInput,
  b: NormalizedListingInput,
): SimilarityResult {
  let score = 0;

  if (a.year !== undefined && b.year !== undefined && a.year === b.year) score += 0.30;
  if (a.make && b.make && slugify(a.make) === slugify(b.make)) score += 0.20;
  if (a.model && b.model && slugify(a.model) === slugify(b.model)) score += 0.20;

  if (
    a.mileage !== undefined && b.mileage !== undefined &&
    a.mileage > 0 && b.mileage > 0
  ) {
    const diff = Math.abs(a.mileage - b.mileage);
    const avg = (a.mileage + b.mileage) / 2;
    if (diff / avg <= 0.10) score += 0.15;
  }

  if (a.region && b.region && a.region === b.region) score += 0.10;

  if (
    a.price !== undefined && b.price !== undefined &&
    a.price > 0 && b.price > 0
  ) {
    const diff = Math.abs(a.price - b.price);
    const avg = (a.price + b.price) / 2;
    if (diff / avg <= 0.15) score += 0.05;
  }

  const confidence: ValuationConfidence =
    score >= 0.85 ? "high" :
    score >= 0.70 ? "medium" :
    score >= 0.50 ? "low" :
    "none";

  return { score, confidence };
}
