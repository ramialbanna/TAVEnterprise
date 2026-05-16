import type {
  HistoricalSale,
  ImportBatch,
  IngestRunSummary,
  IngestRunDetail,
  Kpis,
  MmrVinOk,
  MmrVinUnavailable,
  SystemStatus,
} from "@/lib/app-api";

/**
 * Typed fixtures mirroring `docs/APP_API.md` / the parser schemas. Handlers wrap these
 * in the `{ ok: true, data }` envelope the `/api/app/*` proxy returns.
 */

// ── GET /app/system-status ─────────────────────────────────────────────────────
export const systemStatusHealthy: SystemStatus = {
  service: "tav-aip",
  version: "test-abc123",
  timestamp: "2026-05-12T12:00:00.000Z",
  db: { ok: true },
  intelWorker: {
    mode: "worker",
    binding: true,
    url: "https://tav-intelligence-worker.example.workers.dev",
  },
  sources: [
    {
      source: "facebook",
      region: "dallas_tx",
      run_id: "fixture-run-1",
      scraped_at: "2026-05-12T11:00:00.000Z",
      item_count: 50,
      processed: 42,
      rejected: 8,
      created_leads: 3,
      status: "completed",
    },
  ],
  staleSweep: { lastRunAt: "2026-05-12T06:00:00.000Z", status: "ok", updated: 7 },
};

export const systemStatusNeverRun: SystemStatus = {
  ...systemStatusHealthy,
  staleSweep: { lastRunAt: null, missingReason: "never_run" },
};

export const systemStatusDbDown: SystemStatus = {
  ...systemStatusHealthy,
  db: { ok: false, missingReason: "db_error" },
  sources: [],
  staleSweep: { lastRunAt: null, missingReason: "db_error" },
};

// ── GET /app/kpis ──────────────────────────────────────────────────────────────
export const kpisFull: Kpis = {
  generatedAt: "2026-05-12T12:00:00.000Z",
  outcomes: {
    value: {
      totalOutcomes: 3,
      avgGrossProfit: 1500,
      avgHoldDays: 21.5,
      lastOutcomeAt: "2026-05-10T00:00:00.000Z",
      byRegion: [
        { region: "TX-East", avg_gross_profit: 1700, avg_hold_days: 19 },
        { region: "TX-West", avg_gross_profit: 1300, avg_hold_days: 24 },
      ],
    },
    missingReason: null,
  },
  leads: { value: { total: 7 }, missingReason: null },
  listings: { value: { normalizedTotal: 42 }, missingReason: null },
};

export const kpisOutcomesUnavailable: Kpis = {
  ...kpisFull,
  outcomes: { value: null, missingReason: "db_error" },
};

// ── GET /app/import-batches ────────────────────────────────────────────────────
export const importBatches: ImportBatch[] = [
  {
    id: "ib_2026w19",
    createdAt: "2026-05-08T15:00:00.000Z",
    weekLabel: "2026-W19",
    rowCount: 120,
    importedCount: 110,
    duplicateCount: 8,
    rejectedCount: 2,
    status: "complete",
    notes: null,
  },
  {
    id: "ib_2026w18",
    createdAt: "2026-05-01T15:00:00.000Z",
    weekLabel: "2026-W18",
    rowCount: 95,
    importedCount: 95,
    duplicateCount: 0,
    rejectedCount: 0,
    status: "complete",
    notes: "clean batch",
  },
];

// ── GET /app/historical-sales ──────────────────────────────────────────────────
const MAKES_MODELS: Array<[string, string]> = [
  ["Ford", "F-150"],
  ["Toyota", "Camry"],
  ["Chevrolet", "Silverado"],
  ["Honda", "Accord"],
];

function makeHistoricalSale(i: number): HistoricalSale {
  const [make, model] = MAKES_MODELS[i % MAKES_MODELS.length]!;
  const month = (i % 5) + 1; // Jan–May 2026
  const saleDate = `2026-${String(month).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`;
  const acquisitionCost = 14000 + i * 250;
  const salePrice = acquisitionCost + 1500 + (i % 4) * 200;
  return {
    id: `hs_${i + 1}`,
    vin: i % 3 === 0 ? null : `1FT8W3BT${String(1000000 + i)}`,
    year: 2019 + (i % 5),
    make,
    model,
    trim: i % 2 === 0 ? "XLT" : null,
    buyer: i % 2 === 0 ? "Acme Auto" : "Lone Star Motors",
    buyerUserId: i % 2 === 0 ? "u_acme" : "u_lonestar",
    acquisitionDate: `2026-${String(month).padStart(2, "0")}-01`,
    saleDate,
    acquisitionCost,
    salePrice,
    transportCost: 250,
    reconCost: i % 2 === 0 ? 600 : null,
    auctionFees: 150,
    grossProfit: salePrice - acquisitionCost - 250 - 150 - (i % 2 === 0 ? 600 : 0),
    sourceFileName: `tav-sales-2026-${String(month).padStart(2, "0")}.xlsx`,
    uploadBatchId: month % 2 === 0 ? "ib_2026w18" : "ib_2026w19",
    createdAt: `${saleDate}T18:00:00.000Z`,
  };
}

export const historicalSales: HistoricalSale[] = Array.from({ length: 12 }, (_, i) =>
  makeHistoricalSale(i),
);

// ── POST /app/mmr/vin ──────────────────────────────────────────────────────────
export const PREVIEW_VIN = "1FT8W3BT1SEC27066";

export const mmrVinOk: MmrVinOk = { mmrValue: 68600, confidence: "high", method: "vin" };
export const mmrVinUnavailable: MmrVinUnavailable = {
  mmrValue: null,
  missingReason: "intel_worker_timeout",
};

// ── GET /app/ingest-runs ───────────────────────────────────────────────────────
export const ingestRuns: IngestRunSummary[] = [
  {
    id: "sr_2",
    source: "facebook",
    run_id: "4NyscgfxEA39sJcIY",
    region: "dallas_tx",
    status: "completed",
    item_count: 4,
    processed: 3,
    rejected: 1,
    created_leads: 0,
    scraped_at: "2026-05-16T20:11:42.247Z",
    created_at: "2026-05-16T20:11:49.596Z",
    error_message: null,
  },
  {
    id: "sr_1",
    source: "facebook",
    run_id: "aEhX3Np1OQcmlOk4D",
    region: "dallas_tx",
    status: "truncated",
    item_count: 600,
    processed: 500,
    rejected: 100,
    created_leads: 2,
    scraped_at: "2026-05-15T18:50:21.413Z",
    created_at: "2026-05-15T18:50:32.003Z",
    error_message: "batch_truncated:100_items_skipped",
  },
];

export const ingestRunDetail: IngestRunDetail = {
  run: ingestRuns[0]!,
  rawListingCount: 4,
  normalizedListingCount: 3,
  filteredOutByReason: { missing_identifier: 1 },
  valuationMissByReason: { trim_missing: 2 },
  schemaDriftByType: {},
  createdLeadCount: 0,
  createdLeadIds: [],
};
