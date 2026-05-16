import { describe, expect, it } from "vitest";
import {
  metricBlockResult,
  parseHistoricalSales,
  parseImportBatches,
  parseIngestRunDetail,
  parseKpis,
  parseMmrVin,
  parseSystemStatus,
} from "./parse";

// ── fixtures (mirroring docs/APP_API.md) ───────────────────────────────────────
const SYSTEM_STATUS_OK = {
  ok: true,
  data: {
    service: "tav-enterprise",
    version: "0.1.0",
    timestamp: "2026-05-11T16:00:00.000Z",
    db: { ok: true },
    intelWorker: { mode: "worker", binding: true, url: "https://tav-intelligence-worker-staging.rami-1a9.workers.dev" },
    sources: [{ source: "facebook", last_run_at: "2026-05-11T15:00:00.000Z", status: "ok", item_count: 12 }],
    staleSweep: { lastRunAt: null, missingReason: "never_run" },
  },
};

const KPIS_OK = {
  ok: true,
  data: {
    generatedAt: "2026-05-11T16:00:00.000Z",
    outcomes: {
      value: {
        totalOutcomes: 3,
        avgGrossProfit: 1500,
        avgHoldDays: 21.5,
        lastOutcomeAt: "2026-05-01T00:00:00.000Z",
        byRegion: [{ region: "TX-East", avg_gross_profit: 1600, avg_hold_days: 20, total_outcomes: 2, sell_through_rate: 1 }],
      },
      missingReason: null,
    },
    leads: { value: { total: 7 }, missingReason: null },
    listings: { value: { normalizedTotal: 42 }, missingReason: null },
  },
};

const IMPORT_BATCHES_OK = {
  ok: true,
  data: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      createdAt: "2026-05-10T00:00:00.000Z",
      weekLabel: "2026-W19",
      rowCount: 100,
      importedCount: 95,
      duplicateCount: 3,
      rejectedCount: 2,
      status: "complete",
      notes: null,
    },
  ],
};

const HISTORICAL_SALES_OK = {
  ok: true,
  data: [
    {
      id: "22222222-2222-2222-2222-222222222222",
      vin: "1FT8W3BT1SEC27066",
      year: 2021,
      make: "Ford",
      model: "F-150",
      trim: "Lariat",
      buyer: "Lot A",
      buyerUserId: null,
      acquisitionDate: "2026-04-01",
      saleDate: "2026-04-20",
      acquisitionCost: 38000,
      salePrice: 45000,
      transportCost: 300,
      reconCost: 600,
      auctionFees: 150,
      grossProfit: 5950,
      sourceFileName: "april-sales.csv",
      uploadBatchId: "11111111-1111-1111-1111-111111111111",
      createdAt: "2026-04-21T00:00:00.000Z",
    },
  ],
};

describe("parse — happy paths", () => {
  it("parses GET /app/kpis", () => {
    const r = parseKpis(200, KPIS_OK);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.status).toBe(200);
    expect(r.data.outcomes.value?.totalOutcomes).toBe(3);
    expect(r.data.leads.value?.total).toBe(7);
    expect(r.data.listings.value?.normalizedTotal).toBe(42);
    expect(r.data.outcomes.value?.byRegion[0]?.region).toBe("TX-East");
  });

  it("parses GET /app/system-status with staleSweep never_run", () => {
    const r = parseSystemStatus(200, SYSTEM_STATUS_OK);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.db).toEqual({ ok: true });
    expect(r.data.intelWorker.mode).toBe("worker");
    expect(r.data.staleSweep).toEqual({ lastRunAt: null, missingReason: "never_run" });
    expect(r.data.sources[0]?.source).toBe("facebook");
  });

  it("parses GET /app/import-batches", () => {
    const r = parseImportBatches(200, IMPORT_BATCHES_OK);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.data).toHaveLength(1);
    expect(r.data[0]?.status).toBe("complete");
  });

  it("parses GET /app/historical-sales", () => {
    const r = parseHistoricalSales(200, HISTORICAL_SALES_OK);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.data[0]?.make).toBe("Ford");
    expect(r.data[0]?.grossProfit).toBe(5950);
  });

  it("parses POST /app/mmr/vin with a value", () => {
    const r = parseMmrVin(200, { ok: true, data: { mmrValue: 68600, confidence: "high", method: "vin" } });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.data).toEqual({ mmrValue: 68600, confidence: "high", method: "vin" });
  });
});

describe("parse — MMR null + missingReason", () => {
  it("maps mmrValue:null + missingReason to an unavailable result", () => {
    const r = parseMmrVin(200, { ok: true, data: { mmrValue: null, missingReason: "intel_worker_timeout" } });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected not ok");
    expect(r.kind).toBe("unavailable");
    expect(r.error).toBe("intel_worker_timeout");
    expect(r.status).toBe(200);
    expect(r.message.length).toBeGreaterThan(0);
  });
});

describe("parse — Worker error envelopes", () => {
  it("maps unauthorized", () => {
    const r = parseKpis(401, { ok: false, error: "unauthorized" });
    expect(r).toMatchObject({ ok: false, kind: "unauthorized", error: "unauthorized", status: 401 });
    if (r.ok) throw new Error("nope");
    expect(r.message.length).toBeGreaterThan(0);
  });

  it("maps db_error to unavailable", () => {
    const r = parseKpis(503, { ok: false, error: "db_error" });
    expect(r).toMatchObject({ ok: false, kind: "unavailable", error: "db_error", status: 503 });
  });

  it("maps app_auth_not_configured to server", () => {
    const r = parseKpis(503, { ok: false, error: "app_auth_not_configured" });
    expect(r).toMatchObject({ ok: false, kind: "server", error: "app_auth_not_configured", status: 503 });
  });

  it("maps internal_error to server", () => {
    const r = parseKpis(503, { ok: false, error: "internal_error" });
    expect(r).toMatchObject({ ok: false, kind: "server", error: "internal_error", status: 503 });
  });

  it("maps not_found to invalid", () => {
    const r = parseKpis(404, { ok: false, error: "not_found" });
    expect(r).toMatchObject({ ok: false, kind: "invalid", error: "not_found", status: 404 });
  });

  it("maps invalid_body (with issues) to invalid and preserves issues", () => {
    const r = parseMmrVin(400, { ok: false, error: "invalid_body", issues: [{ path: ["vin"], message: "Too small" }] });
    expect(r).toMatchObject({ ok: false, kind: "invalid", error: "invalid_body", status: 400 });
    if (r.ok) throw new Error("nope");
    expect(r.issues).toEqual([{ path: ["vin"], message: "Too small" }]);
  });

  it("maps invalid_json to invalid", () => {
    const r = parseMmrVin(400, { ok: false, error: "invalid_json" });
    expect(r).toMatchObject({ ok: false, kind: "invalid", error: "invalid_json", status: 400 });
  });
});

describe("parse — /web proxy error envelopes (not Worker errors)", () => {
  it("maps proxy_misconfigured to kind 'proxy' with config-problem copy", () => {
    const r = parseKpis(500, { ok: false, error: "proxy_misconfigured" });
    expect(r).toMatchObject({ ok: false, kind: "proxy", error: "proxy_misconfigured", status: 500 });
    if (r.ok) throw new Error("nope");
    expect(r.message).toMatch(/config|misconfigur|operator|deploy/i);
  });

  it("maps upstream_unavailable to unavailable", () => {
    const r = parseKpis(503, { ok: false, error: "upstream_unavailable" });
    expect(r).toMatchObject({ ok: false, kind: "unavailable", error: "upstream_unavailable", status: 503 });
  });

  it("maps upstream_non_json to kind 'proxy'", () => {
    const r = parseKpis(502, { ok: false, error: "upstream_non_json" });
    expect(r).toMatchObject({ ok: false, kind: "proxy", error: "upstream_non_json", status: 502 });
  });
});

describe("parse — malformed / unknown", () => {
  it("defaults missing ingest detail listings to [] for staggered Worker/Vercel deploys", () => {
    const r = parseIngestRunDetail(200, {
      ok: true,
      data: {
        run: {
          id: "11111111-1111-1111-1111-111111111111",
          source: "facebook",
          run_id: "Ci2n6ph1CkdCu6pUI",
          region: "dallas_tx",
          status: "completed",
          item_count: 3,
          processed: 3,
          rejected: 0,
          created_leads: 0,
          scraped_at: "2026-05-16T23:01:00.000Z",
          created_at: "2026-05-16T23:02:00.000Z",
          error_message: null,
        },
        rawListingCount: 3,
        normalizedListingCount: 3,
        filteredOutByReason: {},
        valuationMissByReason: { cox_unavailable: 2, trim_missing: 1 },
        schemaDriftByType: { unexpected_field: 19 },
        createdLeadCount: 0,
        createdLeadIds: [],
      },
    });

    expect(r).toMatchObject({ ok: true, status: 200 });
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.listings).toEqual([]);
  });

  it("maps a schema mismatch on ok:true data to invalid", () => {
    const r = parseKpis(200, { ok: true, data: { totally: "wrong" } });
    expect(r).toMatchObject({ ok: false, kind: "invalid", error: "schema_mismatch", status: 200 });
    if (r.ok) throw new Error("nope");
    expect(r.message.length).toBeGreaterThan(0);
  });

  it("maps a non-array historical-sales data to invalid", () => {
    const r = parseHistoricalSales(200, { ok: true, data: "not an array" });
    expect(r).toMatchObject({ ok: false, kind: "invalid", error: "schema_mismatch", status: 200 });
  });

  it("maps a non-object body to invalid", () => {
    const r = parseKpis(200, "totally not json");
    expect(r).toMatchObject({ ok: false, kind: "invalid", error: "bad_response", status: 200 });
  });

  it("maps an unknown error code with status < 500 to 'unknown'", () => {
    const r = parseKpis(418, { ok: false, error: "teapot" });
    expect(r).toMatchObject({ ok: false, kind: "unknown", error: "teapot", status: 418 });
  });

  it("maps an unknown error code with status >= 500 to 'server'", () => {
    const r = parseKpis(500, { ok: false, error: "some_new_server_thing" });
    expect(r).toMatchObject({ ok: false, kind: "server", error: "some_new_server_thing", status: 500 });
  });

  it("maps an ok:false body with no error string to invalid", () => {
    const r = parseKpis(500, { ok: false });
    expect(r).toMatchObject({ ok: false, kind: "invalid", error: "bad_response", status: 500 });
  });
});

describe("metricBlockResult", () => {
  it("returns ok with the value when present", () => {
    expect(metricBlockResult({ value: { total: 7 }, missingReason: null })).toMatchObject({
      ok: true,
      data: { total: 7 },
      status: 200,
    });
  });

  it("returns an unavailable result when the value is null", () => {
    const r = metricBlockResult({ value: null, missingReason: "db_error" });
    expect(r).toMatchObject({ ok: false, kind: "unavailable", error: "db_error", status: 200 });
    if (r.ok) throw new Error("nope");
    expect(r.message.length).toBeGreaterThan(0);
  });

  it("falls back to a generic reason when missingReason is null", () => {
    const r = metricBlockResult({ value: null, missingReason: null });
    expect(r).toMatchObject({ ok: false, kind: "unavailable", status: 200 });
  });
});
