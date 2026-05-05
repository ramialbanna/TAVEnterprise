import type { SupabaseClient } from "./supabase";
import type { ParsedOutcomeRow, PurchaseOutcome } from "../types/domain";

export interface UpsertPurchaseOutcomeInput {
  leadId?: string | null;
  vehicleCandidateId?: string | null;
  data: ParsedOutcomeRow;
  importBatchId?: string;
}

export async function upsertPurchaseOutcome(
  db: SupabaseClient,
  input: UpsertPurchaseOutcomeInput,
): Promise<{ id: string; isDuplicate: boolean }> {
  const { leadId, vehicleCandidateId, data, importBatchId } = input;

  // Check for duplicate via import_fingerprint
  const { data: existing, error: selectErr } = await db
    .from("purchase_outcomes")
    .select("id")
    .eq("import_fingerprint", data.importFingerprint)
    .maybeSingle();

  if (selectErr) throw selectErr;

  if (existing) {
    return { id: existing.id as string, isDuplicate: true };
  }

  const { data: inserted, error: insertErr } = await db
    .from("purchase_outcomes")
    .insert({
      lead_id: leadId ?? null,
      vehicle_candidate_id: vehicleCandidateId ?? null,
      vin: data.vin ?? null,
      year: data.year ?? null,
      make: data.make ?? null,
      model: data.model ?? null,
      mileage: data.mileage ?? null,
      source: data.source ?? null,
      region: data.region ?? null,
      price_paid: data.pricePaid,
      sale_price: data.salePrice ?? null,
      gross_profit: data.grossProfit ?? null,
      hold_days: data.holdDays ?? null,
      condition_grade_raw: data.conditionGradeRaw ?? null,
      condition_grade_normalized: data.conditionGradeNormalized,
      purchase_channel: data.purchaseChannel ?? null,
      selling_channel: data.sellingChannel ?? null,
      transport_cost: data.transportCost ?? null,
      auction_fee: data.auctionFee ?? null,
      misc_overhead: data.miscOverhead ?? null,
      week_label: data.weekLabel ?? null,
      buyer_id: data.buyerId ?? null,
      import_batch_id: importBatchId ?? null,
      import_fingerprint: data.importFingerprint,
    })
    .select("id")
    .single();

  if (insertErr) throw insertErr;
  if (!inserted) throw new Error("upsertPurchaseOutcome: no row returned");
  return { id: inserted.id as string, isDuplicate: false };
}

// Returns avg_gross_margin_pct for a vehicle segment (year/make/model/mileage bucket).
// Used by computeSegmentProfitScore. Returns null if no outcomes exist for segment.
export async function getSegmentAvgMarginPct(
  db: SupabaseClient,
  params: { year?: number; make?: string; model?: string; mileageBucket?: number },
): Promise<number | null> {
  let query = db.from("v_segment_profit").select("avg_gross_margin_pct");

  if (params.year != null) {
    query = query.eq("year", params.year);
  }
  if (params.make != null) {
    query = query.eq("make", params.make);
  }
  if (params.model != null) {
    query = query.eq("model", params.model);
  }
  if (params.mileageBucket != null) {
    query = query.eq("mileage_bucket", params.mileageBucket);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as { avg_gross_margin_pct: number | null };
  return row.avg_gross_margin_pct ?? null;
}

export type { PurchaseOutcome };
