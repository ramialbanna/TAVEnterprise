import type { NormalizedListingInput, ScoredLead } from "../types/domain";
import type { SupabaseClient } from "./supabase";

export interface LeadInput {
  normalizedListingId: string;
  vehicleCandidateId?: string;
  listing: NormalizedListingInput;
  scored: ScoredLead;
  mmrValue?: number;
  matchedRuleDbId?: string;
  scoreComponents?: Record<string, unknown>;
}

export async function upsertLead(
  db: SupabaseClient,
  input: LeadInput,
): Promise<{ id: string; created: boolean }> {
  const { normalizedListingId, vehicleCandidateId, listing, scored, mmrValue, matchedRuleDbId, scoreComponents } = input;

  // Check for existing lead (normalized_listing_id is UNIQUE on leads)
  const { data: existing, error: selectErr } = await db
    .from("leads")
    .select("id, status")
    .eq("normalized_listing_id", normalizedListingId)
    .maybeSingle();

  if (selectErr) throw selectErr;

  if (existing) {
    // Update scores but don't overwrite active workflow state
    const { error: updateErr } = await db
      .from("leads")
      .update({
        deal_score: scored.dealScore,
        buy_box_score: scored.buyBoxScore,
        freshness_score: scored.freshnessScore,
        source_confidence_score: scored.sourceConfidenceScore,
        final_score: scored.finalScore,
        grade: scored.grade,
        reason_codes: scored.reasonCodes,
        mmr_value: mmrValue ?? null,
        valuation_confidence: scored.valuationConfidence ?? "none",
        score_components: scoreComponents ?? null,
      })
      .eq("id", existing.id);
    if (updateErr) throw updateErr;
    return { id: existing.id as string, created: false };
  }

  const { data: inserted, error: insertErr } = await db
    .from("leads")
    .insert({
      normalized_listing_id: normalizedListingId,
      vehicle_candidate_id: vehicleCandidateId ?? null,
      source: listing.source,
      region: listing.region ?? null,
      year: listing.year ?? null,
      make: listing.make ?? null,
      model: listing.model ?? null,
      trim: listing.trim ?? null,
      price: listing.price ?? null,
      mileage: listing.mileage ?? null,
      vin: listing.vin ?? null,
      listing_url: listing.url,
      title: listing.title,
      status: "new",
      grade: scored.grade,
      deal_score: scored.dealScore,
      buy_box_score: scored.buyBoxScore,
      freshness_score: scored.freshnessScore,
      region_score: scored.regionScore,
      source_confidence_score: scored.sourceConfidenceScore,
      final_score: scored.finalScore,
      reason_codes: scored.reasonCodes,
      matched_buy_box_rule_id: matchedRuleDbId ?? null,
      matched_rule_version: scored.matchedRuleVersion ?? null,
      valuation_confidence: scored.valuationConfidence ?? "none",
      mmr_value: mmrValue ?? null,
      score_components: scoreComponents ?? null,
    })
    .select("id")
    .single();

  if (insertErr) throw insertErr;
  if (!inserted) throw new Error("upsertLead: no row returned");
  return { id: inserted.id as string, created: true };
}
