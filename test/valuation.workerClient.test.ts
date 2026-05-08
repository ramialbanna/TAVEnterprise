import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getMmrValueFromWorker,
  WorkerTimeoutError,
  WorkerRateLimitError,
  WorkerUnavailableError,
} from "../src/valuation/workerClient";
import type { Env } from "../src/types/env";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_ENV: Env = {
  INTEL_WORKER_URL: "https://intel.example.com",
  INTEL_WORKER_SECRET: "secret-xyz",
} as unknown as Env;

const ENVELOPE_VIN = {
  ok: true,
  mmr_value: 18_500,
  mileage_used: 45_000,
  is_inferred_mileage: false,
  cache_hit: false,
  source: "manheim",
  fetched_at: "2026-05-08T12:00:00.000Z",
  expires_at: "2026-05-09T12:00:00.000Z",
  mmr_payload: {
    items: [{
      adjustedPricing: { wholesale: { above: 19_800, average: 18_500, below: 17_200 } },
      sampleSize: "42",
    }],
  },
  error_code: null,
  error_message: null,
};

const ENVELOPE_YMM = {
  ...ENVELOPE_VIN,
  mmr_value: 16_000,
  source: "cache",
  cache_hit: true,
};

const ENVELOPE_NEGATIVE = {
  ok: false,
  mmr_value: null,
  mileage_used: 0,
  is_inferred_mileage: false,
  cache_hit: false,
  source: "manheim",
  fetched_at: "2026-05-08T12:00:00.000Z",
  expires_at: null,
  mmr_payload: {},
  error_code: "manheim_unavailable",
  error_message: "upstream error",
};

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  }));
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

// ── INTEL_WORKER_URL not configured ───────────────────────────────────────────

describe("getMmrValueFromWorker — not configured", () => {
  it("returns null immediately when INTEL_WORKER_URL is empty", async () => {
    const env = { ...BASE_ENV, INTEL_WORKER_URL: "" } as unknown as Env;
    vi.stubGlobal("fetch", vi.fn());
    const result = await getMmrValueFromWorker({ vin: "1HGCM82633A004352" }, env);
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns null when params are insufficient (no vin, no full ymm)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const result = await getMmrValueFromWorker({ year: 2020, make: "Toyota" }, BASE_ENV);
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ── VIN path ──────────────────────────────────────────────────────────────────

describe("getMmrValueFromWorker — VIN path", () => {
  it("calls /mmr/vin and returns MmrResult with confidence 'high'", async () => {
    mockFetch(200, ENVELOPE_VIN);
    const result = await getMmrValueFromWorker(
      { vin: "1HGCM82633A004352", year: 2020, mileage: 45_000 },
      BASE_ENV,
    );
    expect(result).toMatchObject({ mmrValue: 18_500, confidence: "high", method: "vin" });
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain("/mmr/vin");
  });

  it("sends x-tav-service-secret header", async () => {
    mockFetch(200, ENVELOPE_VIN);
    await getMmrValueFromWorker({ vin: "1HGCM82633A004352" }, BASE_ENV);
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)["x-tav-service-secret"]).toBe("secret-xyz");
  });

  it("passes mmr_payload as rawResponse for distribution parsing", async () => {
    mockFetch(200, ENVELOPE_VIN);
    const result = await getMmrValueFromWorker({ vin: "1HGCM82633A004352" }, BASE_ENV);
    expect(result?.rawResponse).toEqual(ENVELOPE_VIN.mmr_payload);
  });

  it("returns null for a negative-cache envelope (ok=false)", async () => {
    mockFetch(200, ENVELOPE_NEGATIVE);
    const result = await getMmrValueFromWorker({ vin: "1HGCM82633A004352" }, BASE_ENV);
    expect(result).toBeNull();
  });

  it("returns null when envelope.mmr_value is null", async () => {
    mockFetch(200, { ...ENVELOPE_VIN, ok: true, mmr_value: null });
    const result = await getMmrValueFromWorker({ vin: "1HGCM82633A004352" }, BASE_ENV);
    expect(result).toBeNull();
  });
});

// ── YMM path ──────────────────────────────────────────────────────────────────

describe("getMmrValueFromWorker — YMM path", () => {
  it("calls /mmr/year-make-model and returns MmrResult with confidence 'medium'", async () => {
    mockFetch(200, ENVELOPE_YMM);
    const result = await getMmrValueFromWorker(
      { year: 2019, make: "Toyota", model: "Camry", mileage: 60_000 },
      BASE_ENV,
    );
    expect(result).toMatchObject({ mmrValue: 16_000, confidence: "medium", method: "year_make_model" });
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain("/mmr/year-make-model");
  });

  it("prefers VIN over YMM when both are present", async () => {
    mockFetch(200, ENVELOPE_VIN);
    await getMmrValueFromWorker(
      { vin: "1HGCM82633A004352", year: 2020, make: "Honda", model: "Civic", mileage: 45_000 },
      BASE_ENV,
    );
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain("/mmr/vin");
  });
});

// ── Error cases ───────────────────────────────────────────────────────────────

describe("getMmrValueFromWorker — error cases", () => {
  it("throws WorkerRateLimitError on HTTP 429", async () => {
    mockFetch(429, { ok: false, error: "rate_limited" });
    await expect(getMmrValueFromWorker({ vin: "1HGCM82633A004352" }, BASE_ENV))
      .rejects.toBeInstanceOf(WorkerRateLimitError);
  });

  it("throws WorkerUnavailableError on HTTP 500", async () => {
    mockFetch(500, { ok: false, error: "internal_error" });
    await expect(getMmrValueFromWorker({ vin: "1HGCM82633A004352" }, BASE_ENV))
      .rejects.toBeInstanceOf(WorkerUnavailableError);
  });

  it("WorkerUnavailableError carries the HTTP status", async () => {
    mockFetch(503, { ok: false, error: "unavailable" });
    let caught: WorkerUnavailableError | undefined;
    try {
      await getMmrValueFromWorker({ vin: "1HGCM82633A004352" }, BASE_ENV);
    } catch (e) {
      caught = e instanceof WorkerUnavailableError ? e : undefined;
    }
    expect(caught).toBeInstanceOf(WorkerUnavailableError);
    expect(caught?.status).toBe(503);
  });

  it("throws WorkerTimeoutError when fetch is aborted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    }));
    await expect(getMmrValueFromWorker({ vin: "1HGCM82633A004352" }, BASE_ENV))
      .rejects.toBeInstanceOf(WorkerTimeoutError);
  });

  it("returns null when response body is not valid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
    }));
    const result = await getMmrValueFromWorker({ vin: "1HGCM82633A004352" }, BASE_ENV);
    expect(result).toBeNull();
  });

  it("returns null when response does not match MmrResponseEnvelope schema", async () => {
    mockFetch(200, { not: "an envelope" });
    const result = await getMmrValueFromWorker({ vin: "1HGCM82633A004352" }, BASE_ENV);
    expect(result).toBeNull();
  });
});
