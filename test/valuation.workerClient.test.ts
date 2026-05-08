import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getMmrValueFromWorker,
  WorkerTimeoutError,
  WorkerRateLimitError,
  WorkerUnavailableError,
} from "../src/valuation/workerClient";
import { EMPTY_REFERENCE, type ReferenceData } from "../src/valuation/normalizeMmrParams";
import { loadMmrReferenceData } from "../src/valuation/loadMmrReferenceData";
import type { Env } from "../src/types/env";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../src/valuation/loadMmrReferenceData", () => ({
  loadMmrReferenceData: vi.fn(),
  resetReferenceDataCache: vi.fn(),
}));

vi.mock("../src/persistence/supabase", () => ({
  getSupabaseClient: vi.fn(() => ({})),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_ENV: Env = {
  INTEL_WORKER_URL: "https://intel.example.com",
  INTEL_WORKER_SECRET: "secret-xyz",
} as unknown as Env;

// Default reference: Toyota/Camry exact-matched; used by existing YMM tests.
const DEFAULT_REF: ReferenceData = {
  makes: new Set(["Toyota", "Honda"]),
  models: new Map([
    ["Toyota", new Set(["Camry"])],
    ["Honda",  new Set(["Civic"])],
  ]),
  makeAliases: new Map(),
  modelAliases: new Map(),
};

// Reference that includes Chevrolet and a "chevy" alias for alias tests.
const ALIAS_REF: ReferenceData = {
  makes: new Set(["Chevrolet"]),
  models: new Map([["Chevrolet", new Set(["Malibu"])]]),
  makeAliases: new Map([["chevy", "Chevrolet"]]),
  modelAliases: new Map(),
};

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

beforeEach(() => {
  vi.clearAllMocks();
  // Default: YMM tests get a reference that exact-matches Toyota/Camry and Honda/Civic
  vi.mocked(loadMmrReferenceData).mockResolvedValue(DEFAULT_REF);
});
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

  it("does not call loadMmrReferenceData on the VIN path", async () => {
    mockFetch(200, ENVELOPE_VIN);
    await getMmrValueFromWorker({ vin: "1HGCM82633A004352", year: 2020, mileage: 45_000 }, BASE_ENV);
    expect(loadMmrReferenceData).not.toHaveBeenCalled();
  });

  it("VIN result has no normalization metadata fields", async () => {
    mockFetch(200, ENVELOPE_VIN);
    const result = await getMmrValueFromWorker({ vin: "1HGCM82633A004352" }, BASE_ENV);
    expect(result?.lookupMake).toBeUndefined();
    expect(result?.lookupModel).toBeUndefined();
    expect(result?.normalizationConfidence).toBeUndefined();
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

// ── YMM normalization ─────────────────────────────────────────────────────────

describe("getMmrValueFromWorker — YMM normalization", () => {
  it("sends canonical make/model when alias resolves", async () => {
    vi.mocked(loadMmrReferenceData).mockResolvedValueOnce(ALIAS_REF);
    mockFetch(200, ENVELOPE_YMM);

    await getMmrValueFromWorker(
      { year: 2019, make: "chevy", model: "Malibu", mileage: 60_000 },
      BASE_ENV,
    );

    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(sentBody.make).toBe("Chevrolet");
    expect(sentBody.model).toBe("Malibu");
  });

  it("exact make/model keeps confidence 'medium'", async () => {
    mockFetch(200, ENVELOPE_YMM);
    const result = await getMmrValueFromWorker(
      { year: 2019, make: "Toyota", model: "Camry", mileage: 60_000 },
      BASE_ENV,
    );
    expect(result?.confidence).toBe("medium");
    expect(result?.normalizationConfidence).toBe("exact");
  });

  it("alias-resolved make/model keeps confidence 'medium'", async () => {
    vi.mocked(loadMmrReferenceData).mockResolvedValueOnce(ALIAS_REF);
    mockFetch(200, ENVELOPE_YMM);

    const result = await getMmrValueFromWorker(
      { year: 2019, make: "chevy", model: "Malibu", mileage: 60_000 },
      BASE_ENV,
    );
    expect(result?.confidence).toBe("medium");
    expect(result?.normalizationConfidence).toBe("alias");
  });

  it("partial normalization (make resolves, model does not) downgrades confidence to 'low'", async () => {
    // ALIAS_REF has Chevrolet make but no "FakeTruck" model
    vi.mocked(loadMmrReferenceData).mockResolvedValueOnce(ALIAS_REF);
    mockFetch(200, ENVELOPE_YMM);

    const result = await getMmrValueFromWorker(
      { year: 2019, make: "Chevrolet", model: "FakeTruck", mileage: 60_000 },
      BASE_ENV,
    );
    expect(result?.confidence).toBe("low");
    expect(result?.normalizationConfidence).toBe("partial");
  });

  it("none normalization (unrecognized make) downgrades confidence to 'low'", async () => {
    vi.mocked(loadMmrReferenceData).mockResolvedValueOnce(EMPTY_REFERENCE);
    mockFetch(200, ENVELOPE_YMM);

    const result = await getMmrValueFromWorker(
      { year: 2019, make: "Porsche", model: "911", mileage: 60_000 },
      BASE_ENV,
    );
    expect(result?.confidence).toBe("low");
    expect(result?.normalizationConfidence).toBe("none");
  });

  it("empty reference data sends raw make/model in request body", async () => {
    vi.mocked(loadMmrReferenceData).mockResolvedValueOnce(EMPTY_REFERENCE);
    mockFetch(200, ENVELOPE_YMM);

    await getMmrValueFromWorker(
      { year: 2019, make: "Toyota", model: "Camry", mileage: 60_000 },
      BASE_ENV,
    );

    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(sentBody.make).toBe("Toyota");
    expect(sentBody.model).toBe("Camry");
  });

  it("empty reference data sets normalizationConfidence 'none' on result", async () => {
    vi.mocked(loadMmrReferenceData).mockResolvedValueOnce(EMPTY_REFERENCE);
    mockFetch(200, ENVELOPE_YMM);

    const result = await getMmrValueFromWorker(
      { year: 2019, make: "Toyota", model: "Camry", mileage: 60_000 },
      BASE_ENV,
    );
    expect(result?.normalizationConfidence).toBe("none");
    expect(result?.lookupMake).toBeNull();
    expect(result?.lookupModel).toBeNull();
  });

  it("trim is included in the YMM request body when present", async () => {
    mockFetch(200, ENVELOPE_YMM);

    await getMmrValueFromWorker(
      { year: 2019, make: "Toyota", model: "Camry", trim: "XSE", mileage: 60_000 },
      BASE_ENV,
    );

    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(opts.body as string) as Record<string, unknown>;
    // Cox MMR 1.4 YMMT requires bodyname (trim) as a path segment, so the
    // trim must cross the main-worker → intelligence-worker boundary.
    expect(sentBody.trim).toBe("XSE");
  });

  it("trim is omitted from the YMM request body when absent", async () => {
    mockFetch(200, ENVELOPE_YMM);

    await getMmrValueFromWorker(
      { year: 2019, make: "Toyota", model: "Camry", mileage: 60_000 },
      BASE_ENV,
    );

    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(sentBody).not.toHaveProperty("trim");
  });

  it("whitespace-only trim is omitted from the YMM request body", async () => {
    mockFetch(200, ENVELOPE_YMM);

    await getMmrValueFromWorker(
      { year: 2019, make: "Toyota", model: "Camry", trim: "   ", mileage: 60_000 },
      BASE_ENV,
    );

    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(sentBody).not.toHaveProperty("trim");
  });

  it("trim from params is present on result as lookupTrim", async () => {
    mockFetch(200, ENVELOPE_YMM);

    const result = await getMmrValueFromWorker(
      { year: 2019, make: "Toyota", model: "Camry", trim: "XSE", mileage: 60_000 },
      BASE_ENV,
    );
    expect(result?.lookupTrim).toBe("XSE");
  });

  it("lookupTrim is null when trim is not provided", async () => {
    mockFetch(200, ENVELOPE_YMM);

    const result = await getMmrValueFromWorker(
      { year: 2019, make: "Toyota", model: "Camry", mileage: 60_000 },
      BASE_ENV,
    );
    expect(result?.lookupTrim).toBeNull();
  });

  it("normalization metadata present on YMM exact-match result", async () => {
    mockFetch(200, ENVELOPE_YMM);

    const result = await getMmrValueFromWorker(
      { year: 2019, make: "Toyota", model: "Camry", mileage: 60_000 },
      BASE_ENV,
    );
    expect(result?.lookupMake).toBe("Toyota");
    expect(result?.lookupModel).toBe("Camry");
    expect(result?.normalizationConfidence).toBe("exact");
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
