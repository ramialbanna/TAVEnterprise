import type { SupabaseClient } from "./supabase";

export interface InsertAttributionInput {
  leadId: string;
  ruleId?: string | null;
  ruleVersion?: number | null;
  ruleScore?: number | null;
  segmentScore?: number | null;
  demandScore?: number | null;
  hybridScore: number;
  components: Record<string, unknown>;
}

// Returns the inserted row id.
export async function insertBuyBoxScoreAttribution(
  db: SupabaseClient,
  input: InsertAttributionInput,
): Promise<string> {
  const { data, error } = await db
    .from("buy_box_score_attributions")
    .insert({
      lead_id: input.leadId,
      rule_id: input.ruleId ?? null,
      rule_version: input.ruleVersion ?? null,
      rule_score: input.ruleScore ?? null,
      segment_score: input.segmentScore ?? null,
      demand_score: input.demandScore ?? null,
      hybrid_score: input.hybridScore,
      components: input.components,
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data) throw new Error("insertBuyBoxScoreAttribution: no row returned");
  return data.id as string;
}
