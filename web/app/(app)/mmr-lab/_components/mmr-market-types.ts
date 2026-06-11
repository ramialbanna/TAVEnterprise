/** Zone C2/C3 market context from POST /app/mmr/vin|ymm (Phase 4). */

export type MmrHistoricalSlot = {
  price: number | null;
  avgMileage: number | null;
};

export type MmrHistoricalAverages = {
  past30Days: MmrHistoricalSlot | null;
  sixMonthsAgo: MmrHistoricalSlot | null;
  lastYear: MmrHistoricalSlot | null;
};

export type MmrProjectedAverage = {
  price: number | null;
  avgMileage: number | null;
};

export type MmrTransaction = {
  date: string | null;
  price: number | null;
  odometer: number | null;
  grade: string | null;
  evbh: number | null;
  engineTrans: string | null;
  exteriorColor: string | null;
  type: string | null;
  region: string | null;
  auction: string | null;
};

export type MmrMarketContext = {
  historicalAverages: MmrHistoricalAverages | null;
  projectedAverage: MmrProjectedAverage | null;
  transactions: MmrTransaction[];
};

export function marketContextFromMmrResult(result: {
  historicalAverages?: MmrHistoricalAverages | null;
  projectedAverage?: MmrProjectedAverage | null;
  transactions?: MmrTransaction[];
}): MmrMarketContext {
  return {
    historicalAverages: result.historicalAverages ?? null,
    projectedAverage: result.projectedAverage ?? null,
    transactions: result.transactions ?? [],
  };
}

export function hasHistoricalData(ctx: MmrMarketContext): boolean {
  const h = ctx.historicalAverages;
  if (!h) return false;
  return Boolean(h.past30Days || h.sixMonthsAgo || h.lastYear);
}

export function hasProjectedData(ctx: MmrMarketContext): boolean {
  return ctx.projectedAverage !== null && ctx.projectedAverage.price !== null;
}
