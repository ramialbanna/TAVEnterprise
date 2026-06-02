import type { SupabaseClient } from "../../persistence/supabase";
import type {
  ExpenseBenchmarkRow,
  PricingBenchmarkRow,
  TransportBenchmarkRow,
} from "../scoring/benchmarks";

function asNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

type BenchmarkRowMeta = { _benchmarkVersion?: string };

export async function fetchPricingBenchmarkRows(
  db: SupabaseClient,
  segment: { year: number; make: string; model: string },
): Promise<(PricingBenchmarkRow & BenchmarkRowMeta)[]> {
  const { data, error } = await db
    .from("v_maxbuy_pricing_benchmarks")
    .select(
      "resolution, year, make, model, trim, region, mileage_band, effective_n, weighted_sale_price, weighted_sale_pct_mmr, benchmark_version",
    )
    .eq("make", segment.make.toLowerCase())
    .eq("model", segment.model.toLowerCase());

  if (error) throw error;

  return (data ?? []).map((row) => ({
    resolution: row.resolution as PricingBenchmarkRow["resolution"],
    year: row.year != null ? Number(row.year) : undefined,
    make: row.make ?? undefined,
    model: row.model ?? undefined,
    trim: row.trim ?? undefined,
    region: row.region ?? undefined,
    mileageBand: row.mileage_band ?? undefined,
    effectiveN: Number(row.effective_n ?? 0),
    weightedSalePrice: asNumber(row.weighted_sale_price),
    weightedSalePctMmr: asNumber(row.weighted_sale_pct_mmr),
    _benchmarkVersion: row.benchmark_version as string | undefined,
  }));
}

export async function fetchTransportBenchmarkRows(
  db: SupabaseClient,
  segment: { region: string },
  cotCity?: string | null,
  cotState?: string | null,
): Promise<(TransportBenchmarkRow & BenchmarkRowMeta)[]> {
  const queries = [
    db.from("v_maxbuy_transport_benchmarks").select("*").eq("resolution", "global"),
    db.from("v_maxbuy_transport_benchmarks").select("*").eq("resolution", "region").eq("region", segment.region),
  ];

  if (cotCity && cotState) {
    queries.push(
      db
        .from("v_maxbuy_transport_benchmarks")
        .select("*")
        .eq("resolution", "city")
        .eq("cot_city", cotCity.toLowerCase())
        .eq("cot_state", cotState.toLowerCase()),
    );
  }

  const results = await Promise.all(queries);
  const rows: (TransportBenchmarkRow & BenchmarkRowMeta)[] = [];

  for (const result of results) {
    if (result.error) throw result.error;
    for (const row of result.data ?? []) {
      rows.push({
        resolution: row.resolution as TransportBenchmarkRow["resolution"],
        cotCity: row.cot_city ?? undefined,
        cotState: row.cot_state ?? undefined,
        region: row.region ?? undefined,
        effectiveN: Number(row.effective_n ?? 0),
        weightedTransportCost: Number(row.weighted_transport_cost ?? 0),
        _benchmarkVersion: row.benchmark_version as string | undefined,
      });
    }
  }

  return rows;
}

export async function fetchExpenseBenchmarkRows(
  db: SupabaseClient,
  segment: { year: number; make: string; model: string },
): Promise<(ExpenseBenchmarkRow & BenchmarkRowMeta)[]> {
  const { data, error } = await db
    .from("v_maxbuy_expense_benchmarks")
    .select(
      "resolution, year, make, model, trim, region, mileage_band, effective_n, weighted_expense_total, benchmark_version",
    )
    .eq("make", segment.make.toLowerCase())
    .eq("model", segment.model.toLowerCase());

  if (error) throw error;

  return (data ?? []).map((row) => ({
    resolution: row.resolution as ExpenseBenchmarkRow["resolution"],
    year: row.year != null ? Number(row.year) : undefined,
    make: row.make ?? undefined,
    model: row.model ?? undefined,
    trim: row.trim ?? undefined,
    region: row.region ?? undefined,
    mileageBand: row.mileage_band ?? undefined,
    effectiveN: Number(row.effective_n ?? 0),
    weightedExpenseTotal: Number(row.weighted_expense_total ?? 0),
    _benchmarkVersion: row.benchmark_version as string | undefined,
  }));
}

type BenchmarkVersionCarrier = BenchmarkRowMeta;

export function pickBenchmarkVersion(
  pricingRows: (PricingBenchmarkRow & BenchmarkVersionCarrier)[],
  transportRows: (TransportBenchmarkRow & BenchmarkVersionCarrier)[],
  expenseRows: (ExpenseBenchmarkRow & BenchmarkVersionCarrier)[],
): string {
  return (
    pricingRows.find((row) => row._benchmarkVersion)?._benchmarkVersion
    ?? transportRows.find((row) => row._benchmarkVersion)?._benchmarkVersion
    ?? expenseRows.find((row) => row._benchmarkVersion)?._benchmarkVersion
    ?? "bm-unknown-180d"
  );
}
