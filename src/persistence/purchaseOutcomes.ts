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

  // Single upsert with ON CONFLICT DO NOTHING on import_fingerprint.
  // Returns the row if inserted, null if the fingerprint already exists.
  // This halves subrequest count vs. SELECT + INSERT (important for bulk imports
  // which are subject to Cloudflare's per-invocation subrequest limit).
  const { data: inserted, error } = await db
    .from("purchase_outcomes")
    .upsert(
      {
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
        closer_id: data.closerId ?? null,
        cot_city: data.cotCity ?? null,
        cot_state: data.cotState ?? null,
        import_batch_id: importBatchId ?? null,
        import_fingerprint: data.importFingerprint,
      },
      { onConflict: "import_fingerprint", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (error) throw error;

  if (!inserted) {
    // Conflict was ignored — row already exists. Fetch its id for the caller.
    const { data: existing, error: fetchErr } = await db
      .from("purchase_outcomes")
      .select("id")
      .eq("import_fingerprint", data.importFingerprint)
      .single();
    if (fetchErr) throw fetchErr;
    return { id: existing!.id as string, isDuplicate: true };
  }

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
