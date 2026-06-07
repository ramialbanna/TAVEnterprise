import type { SupabaseClient } from "../../persistence/supabase";
import type { SegmentKey } from "../scoring/types";

export type TavHistoricalSummary = {
  nUnits: number;
  avgBuy: number | null;
  avgSale: number | null;
  avgGross: number | null;
  avgRecon: number | null;
  avgDaysToSale: number | null;
  outcomeDistribution: Record<string, number>;
};

export async function fetchHistoricalSummary(
  db: SupabaseClient,
  segment: SegmentKey,
): Promise<TavHistoricalSummary> {
  const { data, error } = await db
    .from("purchase_outcomes")
    .select("price_paid, sale_price, gross_profit, recon_cost, hold_days")
    .eq("year", segment.year)
    .ilike("make", segment.make)
    .ilike("model", segment.model)
    .not("sale_date", "is", null)
    .limit(500);

  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) {
    return {
      nUnits: 0,
      avgBuy: null,
      avgSale: null,
      avgGross: null,
      avgRecon: null,
      avgDaysToSale: null,
      outcomeDistribution: {},
    };
  }

  const avg = (values: number[]): number | null => {
    if (values.length === 0) return null;
    return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
  };

  const buys = rows.map((r) => Number(r.price_paid)).filter((v) => Number.isFinite(v));
  const sales = rows.map((r) => Number(r.sale_price)).filter((v) => Number.isFinite(v));
  const grosses = rows.map((r) => Number(r.gross_profit)).filter((v) => Number.isFinite(v));
  const recons = rows.map((r) => Number(r.recon_cost)).filter((v) => Number.isFinite(v));
  const days = rows.map((r) => Number(r.hold_days)).filter((v) => Number.isFinite(v));

  const outcomeDistribution: Record<string, number> = { sold: rows.length };

  return {
    nUnits: rows.length,
    avgBuy: avg(buys),
    avgSale: avg(sales),
    avgGross: avg(grosses),
    avgRecon: avg(recons),
    avgDaysToSale: avg(days),
    outcomeDistribution,
  };
}

export type VehicleContext = {
  year: number;
  make: string;
  model: string;
  trim: string;
  region: string;
  cotCity: string | null;
  cotState: string | null;
};

export async function resolveVehicleContext(
  db: SupabaseClient,
  input: {
    /** Optional — when absent, VIN-based DB lookups are skipped. */
    vin?: string;
    region?: string;
    normalizedListingId?: string;
  },
  vinModelYear: number | null,
): Promise<VehicleContext | null> {
  if (input.normalizedListingId) {
    const { data, error } = await db
      .from("normalized_listings")
      .select("year, make, model, trim, region")
      .eq("id", input.normalizedListingId)
      .maybeSingle();
    if (error) throw error;
    if (data?.year && data.make && data.model) {
      return {
        year: Number(data.year),
        make: String(data.make).toLowerCase(),
        model: String(data.model).toLowerCase(),
        trim: String(data.trim ?? "base").toLowerCase(),
        region: String(data.region ?? input.region ?? "unknown").toLowerCase(),
        cotCity: null,
        cotState: null,
      };
    }
  }

  if (input.vin) {
    const { data: listing, error: listingError } = await db
      .from("normalized_listings")
      .select("year, make, model, trim, region")
      .eq("vin", input.vin)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (listingError) throw listingError;
    if (listing?.year && listing.make && listing.model) {
      return {
        year: Number(listing.year),
        make: String(listing.make).toLowerCase(),
        model: String(listing.model).toLowerCase(),
        trim: String(listing.trim ?? "base").toLowerCase(),
        region: String(listing.region ?? input.region ?? "unknown").toLowerCase(),
        cotCity: null,
        cotState: null,
      };
    }

    const { data: outcome, error: outcomeError } = await db
      .from("purchase_outcomes")
      .select("year, make, model, trim, region, cot_city, cot_state")
      .eq("vin", input.vin)
      .order("sale_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (outcomeError) throw outcomeError;

    if (outcome?.year && outcome.make && outcome.model) {
      return {
        year: Number(outcome.year),
        make: String(outcome.make).toLowerCase(),
        model: String(outcome.model).toLowerCase(),
        trim: String(outcome.trim ?? "base").toLowerCase(),
        region: String(outcome.region ?? input.region ?? "unknown").toLowerCase(),
        cotCity: outcome.cot_city ? String(outcome.cot_city).toLowerCase() : null,
        cotState: outcome.cot_state ? String(outcome.cot_state).toLowerCase() : null,
      };
    }
  }

  if (vinModelYear != null && input.region) {
    return {
      year: vinModelYear,
      make: "unknown",
      model: "unknown",
      trim: "base",
      region: input.region.toLowerCase(),
      cotCity: null,
      cotState: null,
    };
  }

  return null;
}
