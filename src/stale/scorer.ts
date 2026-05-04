import type { FreshnessStatus } from "../types/domain";

export interface StaleResult {
  score: number;
  status: FreshnessStatus;
}

const THRESHOLDS = { aging: 3, stale_suspected: 7, stale_confirmed: 14 } as const;

export function computeStaleScore(lastSeenAt: Date, now: Date = new Date()): StaleResult {
  const age = (now.getTime() - lastSeenAt.getTime()) / 86_400_000;

  if (age < THRESHOLDS.aging) {
    return {
      score: Math.round((age / THRESHOLDS.aging) * 25),
      status: age < 1 ? "new" : "active",
    };
  }
  if (age < THRESHOLDS.stale_suspected) {
    const pct = (age - THRESHOLDS.aging) / (THRESHOLDS.stale_suspected - THRESHOLDS.aging);
    return { score: Math.round(25 + pct * 25), status: "aging" };
  }
  if (age < THRESHOLDS.stale_confirmed) {
    const pct = (age - THRESHOLDS.stale_suspected) / (THRESHOLDS.stale_confirmed - THRESHOLDS.stale_suspected);
    return { score: Math.round(50 + pct * 25), status: "stale_suspected" };
  }
  return {
    score: Math.min(100, Math.round(75 + ((age - 14) / 16) * 25)),
    status: "stale_confirmed",
  };
}
