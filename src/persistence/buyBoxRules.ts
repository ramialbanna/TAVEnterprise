import type { BuyBoxRule } from "../types/domain";
import type { SupabaseClient } from "./supabase";

export async function fetchActiveBuyBoxRules(db: SupabaseClient): Promise<BuyBoxRule[]> {
  const { data, error } = await db
    .from("buy_box_rules")
    .select("*")
    .eq("is_active", true)
    .order("priority_score", { ascending: false });

  if (error) throw error;
  if (!data) return [];

  return (data as Array<Record<string, unknown>>).map(row => ({
    id: row["id"] as string,
    ruleId: row["rule_id"] as string,
    version: row["version"] as number,
    make: (row["make"] as string | null) ?? null,
    model: (row["model"] as string | null) ?? null,
    yearMin: (row["year_min"] as number | null) ?? null,
    yearMax: (row["year_max"] as number | null) ?? null,
    maxMileage: (row["max_mileage"] as number | null) ?? null,
    minMileage: (row["min_mileage"] as number | null) ?? null,
    targetPricePctOfMmr: row["target_price_pct_of_mmr"] !== null
      ? Number(row["target_price_pct_of_mmr"])
      : null,
    regions: (row["regions"] as string[] | null) ?? null,
    sources: (row["sources"] as string[] | null) ?? null,
    priorityScore: (row["priority_score"] as number | null) ?? null,
    isActive: row["is_active"] as boolean,
  }));
}
