import type { SourceName, LeadGrade } from "../types/domain";

// ── Region score ──────────────────────────────────────────────────────────────
// Dallas and Houston are TAV's primary markets (largest Texas metros).
// Austin and San Antonio are active secondary markets.
// Unknown/missing region is penalised — cannot target buyers correctly.

const PRIMARY_REGIONS = new Set(["dallas_tx", "houston_tx"]);
const SECONDARY_REGIONS = new Set(["austin_tx", "san_antonio_tx"]);

export function computeRegionScore(region: string | undefined): number {
  if (!region) return 50;
  if (PRIMARY_REGIONS.has(region)) return 100;
  if (SECONDARY_REGIONS.has(region)) return 75;
  return 50;
}

// ── Score components ──────────────────────────────────────────────────────────
// Weights: deal 35% · buyBox 25% · freshness 20% · region 10% · sourceConf 10%

export interface ScoreComponents {
  dealScore: number;
  buyBoxScore: number;
  freshnessScore: number;
  regionScore: number;
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
  const { dealScore, buyBoxScore, freshnessScore, regionScore, sourceConfidenceScore } = components;
  const finalScore = Math.round(
    dealScore            * 0.35 +
    buyBoxScore          * 0.25 +
    freshnessScore       * 0.20 +
    regionScore          * 0.10 +
    sourceConfidenceScore * 0.10,
  );
  const grade: LeadGrade =
    finalScore >= 85 ? "excellent" :
    finalScore >= 70 ? "good" :
    finalScore >= 55 ? "fair" :
    "pass";
  return { finalScore, grade };
}
