import { NextResponse } from "next/server";

/**
 * E2E-only fixture endpoint. Mirrors the Cloudflare Worker's `/app/*` envelope shape so
 * the dashboard's server-side first paint (`appApiServer`) can be driven from
 * Playwright without a real upstream.
 *
 * Activation: gated by `E2E_MOCKS === "1"` — when unset (the default in dev/preview/
 * prod), every request returns `404 not_found`, so this file is a no-op in any
 * non-test environment. `playwright.config.ts → webServer.env` sets the flag and
 * points `APP_API_BASE_URL` at `http://127.0.0.1:3000/api/e2e-mocks`, so SSR fetches
 * land here. The browser-side proxy `/api/app/*` also flows through `APP_API_BASE_URL`
 * (i.e. through this handler) for the same reason. The folder name avoids a leading
 * underscore because Next treats `_*` folders as private and does not route them.
 *
 * No `Authorization` header is required here — auth is enforced one layer up by
 * `proxy.ts` for browser routes; server-side fetches are trusted in-process.
 */

const SYSTEM_STATUS = {
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

const KPIS = {
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

function makeSale(i: number, saleDate: string, gross: number) {
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

const HISTORICAL_SALES = [
  makeSale(1, "2026-03-10", 1200),
  makeSale(2, "2026-03-20", 1800),
  makeSale(3, "2026-04-05", 1400),
  makeSale(4, "2026-04-22", 1600),
  makeSale(5, "2026-05-01", 1500),
  makeSale(6, "2026-05-10", 1700),
];

const INGEST_RUNS = [
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

const INGEST_DETAIL = {
  run: INGEST_RUNS[0],
  rawListingCount: 4,
  normalizedListingCount: 3,
  filteredOutByReason: { missing_identifier: 1 },
  valuationMissByReason: { trim_missing: 2 },
  schemaDriftByType: {},
  createdLeadCount: 0,
  createdLeadIds: [],
  listings: [
    {
      normalized_listing_id: "nl_e2e_1",
      title: "2020 Toyota Camry SE",
      listing_url: "https://www.facebook.com/marketplace/item/1/",
      year: 2020,
      make: "Toyota",
      model: "Camry",
      trim: "SE",
      price: 18500,
      mileage: 62000,
      vin: null,
      valuation_status: "miss",
      valuation_missing_reason: "trim_missing",
      mmr_value: null,
      lead_id: null,
      lead_grade: null,
      lead_final_score: null,
      lead_score_components: null,
      vehicle_candidate_id: null,
    },
    {
      normalized_listing_id: "nl_e2e_2",
      title: "2019 Honda Civic EX",
      listing_url: "https://www.facebook.com/marketplace/item/2/",
      year: 2019,
      make: "Honda",
      model: "Civic",
      trim: "EX",
      price: 16000,
      mileage: 48000,
      vin: "2HGFC2F",
      valuation_status: "hit",
      valuation_missing_reason: null,
      mmr_value: 17200,
      lead_id: "lead_e2e_1",
      lead_grade: "good",
      lead_final_score: 78,
      lead_score_components: { deal: 40 },
      vehicle_candidate_id: "vc_e2e_1",
    },
  ],
};

function notFound() {
  return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
}

function ok<T>(data: T) {
  return NextResponse.json({ ok: true, data });
}

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (process.env.E2E_MOCKS !== "1") return notFound();
  const { path } = await ctx.params;
  const key = (path ?? []).join("/");
  switch (key) {
    case "system-status":
      return ok(SYSTEM_STATUS);
    case "kpis":
      return ok(KPIS);
    case "historical-sales":
      return ok(HISTORICAL_SALES);
    case "ingest-runs":
      return ok(INGEST_RUNS);
    default:
      if (key.startsWith("ingest-runs/")) {
        const id = decodeURIComponent(key.slice("ingest-runs/".length));
        const match = INGEST_RUNS.find((r) => r.id === id);
        if (!match) return notFound();
        return ok({ ...INGEST_DETAIL, run: match });
      }
      return notFound();
  }
}
