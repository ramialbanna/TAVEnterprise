import type { SupabaseClient } from "./supabase";
import type { MarketDemandIndex } from "../types/domain";

export interface UpsertDemandIndexInput {
  region: string;
  segmentKey?: string | null;
  purchaseCount: number;
  avgHoldDays?: number | null;
  sellThroughRate?: number | null;
  demandScore: number;
  weekLabel: string;
}

export async function upsertMarketDemandIndex(
  db: SupabaseClient,
  input: UpsertDemandIndexInput,
): Promise<MarketDemandIndex> {
  const { data, error } = await db
    .from("market_demand_index")
    .upsert(
      {
        region: input.region,
        segment_key: input.segmentKey ?? null,
        purchase_count: input.purchaseCount,
        avg_hold_days: input.avgHoldDays ?? null,
        sell_through_rate: input.sellThroughRate ?? null,
        demand_score: input.demandScore,
        week_label: input.weekLabel,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "region,segment_key,week_label" },
    )
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error("upsertMarketDemandIndex: no row returned");
  return mapDemandIndex(data);
}

// Returns the most recent demandScore for this region (+ optional segment),
// or null if no rows exist. Orders by week_label DESC LIMIT 1.
export async function getDemandScoreForRegion(
  db: SupabaseClient,
  region: string,
  segmentKey?: string | null,
): Promise<number | null> {
  let query = db
    .from("market_demand_index")
    .select("demand_score")
    .eq("region", region)
    .order("week_label", { ascending: false })
    .limit(1);

  if (segmentKey != null) {
    query = query.eq("segment_key", segmentKey);
  } else {
    query = query.is("segment_key", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as { demand_score: number };
  return row.demand_score;
}

function mapDemandIndex(row: Record<string, unknown>): MarketDemandIndex {
  return {
    id: row.id as string,
    region: row.region as string,
    segmentKey: (row.segment_key as string | null) ?? null,
    purchaseCount: row.purchase_count as number,
    avgHoldDays: (row.avg_hold_days as number | null) ?? null,
    sellThroughRate: (row.sell_through_rate as number | null) ?? null,
    demandScore: row.demand_score as number,
    weekLabel: row.week_label as string,
    computedAt: row.computed_at as string,
    createdAt: row.created_at as string,
  };
}
