import type { Page, Route } from "@playwright/test";

import type {
  HistoricalSale,
  IngestRunSummary,
  IngestRunDetail,
  Kpis,
  SystemStatus,
} from "@/lib/app-api/schemas";

/**
 * Fixtures mirror `web/test/msw/fixtures.ts` shape — kept inline here so the e2e
 * specs do not import vitest-only modules. Same data contract as the MSW handlers.
 */
export const E2E_SYSTEM_STATUS: SystemStatus = {
  service: "tav-aip",
  version: "e2e-1.0.0",
  timestamp: "2026-05-12T12:00:00.000Z",
  db: { ok: true },
  intelWorker: {
    mode: "worker",
    binding: true,
    url: "https://tav-intelligence-worker.example.workers.dev",
  },
  sources: [
    { source: "facebook", normalized_count: 42, last_seen_at: "2026-05-12T11:00:00.000Z" },
  ],
  staleSweep: { lastRunAt: "2026-05-12T06:00:00.000Z", status: "ok", updated: 7 },
};

export const E2E_KPIS: Kpis = {
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

export const E2E_HISTORICAL_SALES: HistoricalSale[] = [
  makeSale(1, "2026-03-10", 1200),
  makeSale(2, "2026-03-20", 1800),
  makeSale(3, "2026-04-05", 1400),
  makeSale(4, "2026-04-22", 1600),
  makeSale(5, "2026-05-01", 1500),
  makeSale(6, "2026-05-10", 1700),
];

function makeSale(i: number, saleDate: string, gross: number): HistoricalSale {
  return {
    id: `hs_${i}`,
    vin: i % 3 === 0 ? null : `1FT8W3BT${String(1000000 + i)}`,
    year: 2024,
    make: "Ford",
    model: "F-150",
    trim: "XLT",
    buyer: "Acme Auto",
    buyerUserId: "u_acme",
    acquisitionDate: saleDate,
    saleDate,
    acquisitionCost: 14000 + i * 100,
    salePrice: 14000 + i * 100 + gross + 400,
    transportCost: 250,
    reconCost: null,
    auctionFees: 150,
    grossProfit: gross,
    sourceFileName: "e2e-fixture.xlsx",
    uploadBatchId: "ib_e2e",
    createdAt: `${saleDate}T18:00:00.000Z`,
  };
}

export const E2E_INGEST_RUNS: IngestRunSummary[] = [
  {
    id: "sr_e2e_2",
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
    id: "sr_e2e_1",
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

export const E2E_INGEST_DETAIL: IngestRunDetail = {
  run: E2E_INGEST_RUNS[0]!,
  rawListingCount: 4,
  normalizedListingCount: 3,
  filteredOutByReason: { missing_identifier: 1 },
  valuationMissByReason: { trim_missing: 2 },
  schemaDriftByType: {},
  createdLeadCount: 0,
  createdLeadIds: [],
};

export type AppApiOverrides = {
  systemStatus?: SystemStatus | { status: number; body: unknown };
  kpis?: Kpis | { status: number; body: unknown };
  historicalSales?: HistoricalSale[] | { status: number; body: unknown };
  ingestRuns?: IngestRunSummary[] | { status: number; body: unknown };
  ingestRunDetail?: IngestRunDetail | { status: number; body: unknown };
};

/**
 * Register Playwright `page.route` handlers for the three `/api/app/*` endpoints the
 * dashboard fetches in parallel. Overrides accept either a fixture (wrapped in the
 * `{ ok: true, data }` envelope automatically) or a fully custom `{ status, body }`
 * for error/degraded paths.
 */
export async function mockAppApi(page: Page, overrides: AppApiOverrides = {}): Promise<void> {
  const systemStatus = overrides.systemStatus ?? E2E_SYSTEM_STATUS;
  const kpis = overrides.kpis ?? E2E_KPIS;
  const historicalSales = overrides.historicalSales ?? E2E_HISTORICAL_SALES;

  const ingestRunsValue = overrides.ingestRuns ?? E2E_INGEST_RUNS;
  const ingestRunDetailValue = overrides.ingestRunDetail ?? E2E_INGEST_DETAIL;

  await page.route("**/api/app/system-status", (route) => respond(route, systemStatus));
  await page.route("**/api/app/kpis", (route) => respond(route, kpis));
  await page.route("**/api/app/historical-sales*", (route) => respond(route, historicalSales));
  // Playwright gives the most-recently-registered matching route priority.
  // The list URL (`/ingest-runs?limit=`) only matches `ingest-runs*`; the
  // detail URL (`/ingest-runs/<id>`) matches both — register the list first so
  // the later-registered detail handler wins for the detail path.
  await page.route("**/api/app/ingest-runs*", (route) => respond(route, ingestRunsValue));
  await page.route("**/api/app/ingest-runs/*", (route) => respond(route, ingestRunDetailValue));
}

function respond(route: Route, value: unknown): Promise<void> {
  const isCustom =
    typeof value === "object" && value !== null && "status" in value && "body" in value;
  if (isCustom) {
    const { status, body } = value as { status: number; body: unknown };
    return route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  }
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: value }),
  });
}
