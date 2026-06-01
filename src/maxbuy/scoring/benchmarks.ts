import type {
  ExpenseBenchmark,
  PricingBenchmark,
  ResolvedBenchmarks,
  SegmentKey,
  TransportBenchmark,
} from "./types";

export type PricingBenchmarkRow = PricingBenchmark & Partial<SegmentKey>;
export type TransportBenchmarkRow = TransportBenchmark & {
  cotCity?: string | null;
  cotState?: string | null;
  region?: string | null;
};
export type ExpenseBenchmarkRow = ExpenseBenchmark & Partial<SegmentKey>;

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function pricingMatches(row: PricingBenchmarkRow, segment: SegmentKey, resolution: PricingBenchmark["resolution"]): boolean {
  if (row.resolution !== resolution) return false;
  if (resolution === "global") return true;
  if (resolution === "mm") {
    return norm(row.make ?? "") === norm(segment.make)
      && norm(row.model ?? "") === norm(segment.model);
  }
  if (resolution === "ymm") {
    return row.year === segment.year
      && norm(row.make ?? "") === norm(segment.make)
      && norm(row.model ?? "") === norm(segment.model)
      && norm(row.region ?? "") === norm(segment.region);
  }
  return row.year === segment.year
    && norm(row.make ?? "") === norm(segment.make)
    && norm(row.model ?? "") === norm(segment.model)
    && norm(row.trim ?? "") === norm(segment.trim)
    && norm(row.region ?? "") === norm(segment.region)
    && norm(row.mileageBand ?? "") === norm(segment.mileageBand);
}

function expenseMatches(row: ExpenseBenchmarkRow, segment: SegmentKey, resolution: ExpenseBenchmark["resolution"]): boolean {
  if (row.resolution !== resolution) return false;
  if (resolution === "global") return true;
  if (resolution === "ymm") {
    return row.year === segment.year
      && norm(row.make ?? "") === norm(segment.make)
      && norm(row.model ?? "") === norm(segment.model)
      && norm(row.region ?? "") === norm(segment.region);
  }
  return row.year === segment.year
    && norm(row.make ?? "") === norm(segment.make)
    && norm(row.model ?? "") === norm(segment.model)
    && norm(row.trim ?? "") === norm(segment.trim)
    && norm(row.region ?? "") === norm(segment.region)
    && norm(row.mileageBand ?? "") === norm(segment.mileageBand);
}

export function pickPricingBenchmark(
  rows: PricingBenchmarkRow[],
  segment: SegmentKey,
): PricingBenchmark {
  for (const resolution of ["exact", "ymm", "mm", "global"] as const) {
    const hit = rows.find((row) => pricingMatches(row, segment, resolution));
    if (hit) return hit;
  }
  return {
    resolution: "global",
    effectiveN: 0,
    weightedSalePrice: null,
    weightedSalePctMmr: null,
  };
}

export function pickTransportBenchmark(
  rows: TransportBenchmarkRow[],
  segment: SegmentKey,
  cotCity?: string | null,
  cotState?: string | null,
): TransportBenchmark {
  const city = cotCity?.trim() || null;
  const state = cotState?.trim() || null;

  const cityHit = rows.find(
    (row) => row.resolution === "city"
      && norm(row.cotCity ?? "") === norm(city ?? "")
      && norm(row.cotState ?? "") === norm(state ?? ""),
  );
  if (cityHit) return cityHit;

  const regionHit = rows.find(
    (row) => row.resolution === "region"
      && norm(row.region ?? "") === norm(segment.region),
  );
  if (regionHit) return regionHit;

  const globalHit = rows.find((row) => row.resolution === "global");
  return globalHit ?? {
    resolution: "global",
    effectiveN: 0,
    weightedTransportCost: 0,
  };
}

export function pickExpenseBenchmark(
  rows: ExpenseBenchmarkRow[],
  segment: SegmentKey,
): ExpenseBenchmark {
  for (const resolution of ["exact", "ymm", "global"] as const) {
    const hit = rows.find((row) => expenseMatches(row, segment, resolution));
    if (hit) return hit;
  }
  return {
    resolution: "global",
    effectiveN: 0,
    weightedExpenseTotal: 0,
  };
}

export function resolveBenchmarks(
  pricingRows: PricingBenchmarkRow[],
  transportRows: TransportBenchmarkRow[],
  expenseRows: ExpenseBenchmarkRow[],
  segment: SegmentKey,
  cotCity?: string | null,
  cotState?: string | null,
): ResolvedBenchmarks {
  return {
    pricing: pickPricingBenchmark(pricingRows, segment),
    transport: pickTransportBenchmark(transportRows, segment, cotCity, cotState),
    expense: pickExpenseBenchmark(expenseRows, segment),
  };
}

export function expectedSalePrice(
  mmrValue: number | null,
  pricing: PricingBenchmark,
): number {
  if (mmrValue != null && mmrValue > 0 && pricing.weightedSalePctMmr != null) {
    return Math.round(mmrValue * pricing.weightedSalePctMmr);
  }
  if (pricing.weightedSalePrice != null) {
    return Math.round(pricing.weightedSalePrice);
  }
  return 0;
}

export function recommendedMaxBuy(
  expectedSale: number,
  transport: number,
  expenses: number,
  targetNetGross: number,
): number {
  return Math.max(0, Math.round(expectedSale - transport - expenses - targetNetGross));
}
