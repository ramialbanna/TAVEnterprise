import type { SupabaseClient } from "./supabase";

/**
 * One row of tav.historical_sales (migration 0025) in domain-friendly camelCase.
 * `grossProfit` is a STORED generated column in Postgres; it is read-only here.
 * There is no shared `HistoricalSale` type elsewhere (the intelligence layer only
 * has the CSV *input* shape `SalesCsvRowSchema`), so this is the canonical row type.
 */
export interface HistoricalSale {
  id: string;
  vin: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  buyer: string | null;
  buyerUserId: string | null;
  acquisitionDate: string | null;
  saleDate: string;
  acquisitionCost: number | null;
  salePrice: number;
  transportCost: number | null;
  reconCost: number | null;
  auctionFees: number | null;
  grossProfit: number | null;
  sourceFileName: string | null;
  uploadBatchId: string | null;
  createdAt: string;
}

/**
 * Filters for {@link listHistoricalSales}. All optional; `make`/`model`/`year`
 * are exact-match (v1). `since` is an ISO date string applied as `sale_date >=`.
 * `limit` is expected to be pre-validated/clamped by the caller.
 */
export interface HistoricalSalesFilter {
  limit?: number;
  year?: number;
  make?: string;
  model?: string;
  since?: string;
}

const DEFAULT_LIMIT = 20;

/**
 * List historical sales, newest sale first.
 *
 * Mirrors the style of {@link import("./importBatches").listImportBatches}:
 * builds a Supabase query, throws the PostgREST error on failure (callers wrap
 * and translate), maps snake_case rows to {@link HistoricalSale}.
 */
export async function listHistoricalSales(
  db: SupabaseClient,
  filter: HistoricalSalesFilter = {},
): Promise<HistoricalSale[]> {
  // Filters (.eq/.gte) must precede transforms (.order/.limit) in postgrest-js.
  let filtered = db.from("historical_sales").select("*");
  if (filter.year !== undefined) filtered = filtered.eq("year", filter.year);
  if (filter.make !== undefined) filtered = filtered.eq("make", filter.make);
  if (filter.model !== undefined) filtered = filtered.eq("model", filter.model);
  if (filter.since !== undefined) filtered = filtered.gte("sale_date", filter.since);

  const { data, error } = await filtered
    .order("sale_date", { ascending: false })
    .limit(filter.limit ?? DEFAULT_LIMIT);

  if (error) throw error;
  return (data ?? []).map(mapHistoricalSale);
}

function mapHistoricalSale(row: Record<string, unknown>): HistoricalSale {
  return {
    id: row.id as string,
    vin: (row.vin as string | null) ?? null,
    year: row.year as number,
    make: row.make as string,
    model: row.model as string,
    trim: (row.trim as string | null) ?? null,
    buyer: (row.buyer as string | null) ?? null,
    buyerUserId: (row.buyer_user_id as string | null) ?? null,
    acquisitionDate: (row.acquisition_date as string | null) ?? null,
    saleDate: row.sale_date as string,
    acquisitionCost: (row.acquisition_cost as number | null) ?? null,
    salePrice: row.sale_price as number,
    transportCost: (row.transport_cost as number | null) ?? null,
    reconCost: (row.recon_cost as number | null) ?? null,
    auctionFees: (row.auction_fees as number | null) ?? null,
    grossProfit: (row.gross_profit as number | null) ?? null,
    sourceFileName: (row.source_file_name as string | null) ?? null,
    uploadBatchId: (row.upload_batch_id as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}
