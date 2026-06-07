export type BenchmarkResolution = "exact" | "ymm" | "mm" | "global";
export type TransportResolution = "city" | "region" | "global";
export type DataStrength = "low" | "medium" | "high";
export type MaxbuyVerdict = "STRONG_BUY" | "BUY" | "REVIEW" | "PASS";
export type DisplayState = "deal_fit" | "vehicle_fit";

export type SegmentKey = {
  year: number;
  make: string;
  model: string;
  trim: string;
  region: string;
  mileageBand: string;
};

export type PricingBenchmark = {
  resolution: BenchmarkResolution;
  effectiveN: number;
  weightedSalePrice: number | null;
  weightedSalePctMmr: number | null;
};

export type TransportBenchmark = {
  resolution: TransportResolution;
  effectiveN: number;
  weightedTransportCost: number;
};

export type ExpenseBenchmark = {
  resolution: BenchmarkResolution;
  effectiveN: number;
  weightedExpenseTotal: number;
};

export type ResolvedBenchmarks = {
  pricing: PricingBenchmark;
  transport: TransportBenchmark;
  expense: ExpenseBenchmark;
};

export type MmrProvenance = {
  value: number | null;
  method: "vin" | "ymm" | null;
  source: string | null;
  cacheAgeSeconds: number | null;
  missingReason: string | null;
  observedAt: string | null;
};

export type ScoreMaxBuyInput = {
  segment: SegmentKey;
  mmr: MmrProvenance;
  askingPrice: number | null;
  mileageEstimated: boolean;
  benchmarks: ResolvedBenchmarks;
  targetNetGross: number;
  hardGate: string | null;
  cotCity?: string | null;
  cotState?: string | null;
  /** True when no VIN was supplied (OPEN-5 YMM-only path). Caps verdict at REVIEW. */
  vinAbsent?: boolean;
};

export type ScoreMaxBuyResult = {
  displayState: DisplayState;
  verdict: MaxbuyVerdict | null;
  expectedSalePrice: number;
  expectedTransport: number;
  expectedExpenses: number;
  expectedNetGross: number | null;
  recommendedMaxBuy: number;
  deltaToAsk: number | null;
  dataStrength: DataStrength;
  reasonCodes: string[];
  estimatedBadges: string[];
  hardGateTriggered: string | null;
  featureVector: Record<string, unknown>;
};
