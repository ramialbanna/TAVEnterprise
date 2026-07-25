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

type ListingIdentityRow = {
  year: number | string;
  make: string;
  model: string;
  trim: string | null;
  region: string | null;
};

type ValuationIdentityRow = {
  lookup_make: string | null;
  lookup_model: string | null;
  lookup_trim: string | null;
};

/** Item 59 — prefer Cox tokens from latest MMR hit over parsed listing trim. */
export function mergeListingWithValuationIdentity(
  listing: ListingIdentityRow,
  valuation: ValuationIdentityRow | null | undefined,
  fallbackRegion?: string,
): VehicleContext {
  const listingTrim = listing.trim?.trim() || null;
  const coxMake = valuation?.lookup_make?.trim() || null;
  const coxModel = valuation?.lookup_model?.trim() || null;
  const coxTrim = valuation?.lookup_trim?.trim() || null;

  return {
    year: Number(listing.year),
    make: (coxMake ?? String(listing.make)).toLowerCase(),
    model: (coxModel ?? String(listing.model)).toLowerCase(),
    trim: (coxTrim ?? listingTrim ?? "base").toLowerCase(),
    region: String(listing.region ?? fallbackRegion ?? "unknown").toLowerCase(),
    cotCity: null,
    cotState: null,
  };
}

async function fetchLatestValuationIdentity(
  db: SupabaseClient,
  normalizedListingId: string,
): Promise<ValuationIdentityRow | null> {
  const { data, error } = await db
    .from("valuation_snapshots")
    .select("lookup_make, lookup_model, lookup_trim")
    .eq("normalized_listing_id", normalizedListingId)
    .not("mmr_value", "is", null)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ValuationIdentityRow | null) ?? null;
}

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
      const valuation = await fetchLatestValuationIdentity(db, input.normalizedListingId);
      return mergeListingWithValuationIdentity(
        data as ListingIdentityRow,
        valuation,
        input.region,
      );
    }
  }

  if (input.vin) {
    const { data: listing, error: listingError } = await db
      .from("normalized_listings")
      .select("id, year, make, model, trim, region")
      .eq("vin", input.vin)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (listingError) throw listingError;
    if (listing?.year && listing.make && listing.model) {
      const listingId = listing.id as string;
      const valuation = await fetchLatestValuationIdentity(db, listingId);
      return mergeListingWithValuationIdentity(
        listing as ListingIdentityRow,
        valuation,
        input.region,
      );
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
