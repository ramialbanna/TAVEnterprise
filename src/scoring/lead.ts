import type { SourceName, LeadGrade } from "../types/domain";

export interface ScoreComponents {
  dealScore: number;
  buyBoxScore: number;
  freshnessScore: number;
  sourceConfidenceScore: number;
}

export function computeFreshnessScore(staleScore: number): number {
  return Math.max(0, 100 - staleScore);
}

export function computeSourceConfidenceScore(source: SourceName): number {
  const scores: Record<SourceName, number> = {
    autotrader: 90,
    cars_com: 85,
    craigslist: 70,
    facebook: 65,
    offerup: 60,
  };
  return scores[source] ?? 50;
}

export function computeFinalScore(components: ScoreComponents): { finalScore: number; grade: LeadGrade } {
  const { dealScore, buyBoxScore, freshnessScore, sourceConfidenceScore } = components;
  const finalScore = Math.round(
    dealScore * 0.40 +
    buyBoxScore * 0.30 +
    freshnessScore * 0.20 +
    sourceConfidenceScore * 0.10,
  );
  const grade: LeadGrade =
    finalScore >= 85 ? "excellent" :
    finalScore >= 70 ? "good" :
    finalScore >= 55 ? "fair" :
    "pass";
  return { finalScore, grade };
}
