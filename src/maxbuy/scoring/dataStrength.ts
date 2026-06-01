import type { DataStrength } from "./types";

const HIGH_EFFECTIVE_N = 30;
const MEDIUM_EFFECTIVE_N = 15;

export function dataStrengthFromEffectiveN(effectiveN: number): DataStrength {
  if (effectiveN >= HIGH_EFFECTIVE_N) return "high";
  if (effectiveN >= MEDIUM_EFFECTIVE_N) return "medium";
  return "low";
}

export function capVerdictForDataStrength<T extends string | null>(
  verdict: T,
  strength: DataStrength,
): T | "REVIEW" {
  if (verdict == null) return verdict;
  if (strength === "low" && (verdict === "STRONG_BUY" || verdict === "BUY")) {
    return "REVIEW";
  }
  return verdict;
}
