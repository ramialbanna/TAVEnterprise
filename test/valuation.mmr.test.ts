import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mileageBucket, kvKeyForVin, kvKeyForYmm, getMmrValue } from "../src/valuation/mmr";
import { getValuationLookupMode } from "../src/valuation/lookupMode";
import type { Env } from "../src/types/env";

// ── Pure utility tests ────────────────────────────────────────────────────────

describe("mileageBucket", () => {
  it("floors to the nearest 10k", () => {
    expect(mileageBucket(0)).toBe(0);
    expect(mileageBucket(9_999)).toBe(0);
    expect(mileageBucket(10_000)).toBe(10_000);
    expect(mileageBucket(82_400)).toBe(80_000);
    expect(mileageBucket(99_999)).toBe(90_000);
    expect(mileageBucket(100_000)).toBe(100_000);
    expect(mileageBucket(120_001)).toBe(120_000);
  });
});

describe("kvKeyForVin", () => {
  it("uppercases the VIN", () => {
    expect(kvKeyForVin("1hgcm82633a004352")).toBe("mmr:vin:1HGCM82633A004352");
  });

  it("keeps already-uppercase VINs unchanged", () => {
    expect(kvKeyForVin("1HGCM82633A004352")).toBe("mmr:vin:1HGCM82633A004352");
  });
});

describe("kvKeyForYmm", () => {
  it("builds a stable cache key", () => {
    expect(kvKeyForYmm(2021, "Toyota", "Camry", 45_000)).toBe("mmr:ymm:2021:toyota:camry:40000");
  });

  it("lowercases make and model", () => {
    expect(kvKeyForYmm(2019, "FORD", "F-150", 82_000)).toBe("mmr:ymm:2019:ford:f-150:80000");
  });

  it("two listings in the same mileage bucket share a cache key", () => {
    const key1 = kvKeyForYmm(2020, "Honda", "Civic", 55_000);
    const key2 = kvKeyForYmm(2020, "Honda", "Civic", 58_999);
    expect(key1).toBe(key2);
  });

  it("listings in different mileage buckets have different cache keys", () => {
    const key1 = kvKeyForYmm(2020, "Honda", "Civic", 49_999);
    const key2 = kvKeyForYmm(2020, "Honda", "Civic", 50_000);
    expect(key1).not.toBe(key2);
  });
});

// ── getMmrValue integration paths (fetch mocked) ─────────────────────────────

const VIN = "1HGCM82633A004352";
const TOKEN_RESPONSE = { access_token: "test-token-abc" };
const MMR_VIN_RESPONSE = { adjustedPricing: { wholesale: { average: 14750 } } };
const MMR_YMM_RESPONSE = { wholesaleAverage: 13200 };

function makeEnv(): Env {
  return {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    WEBHOOK_HMAC_SECRET: "hmac-secret",
    NORMALIZER_SECRET: "normalizer-secret",
    MANHEIM_TOKEN_URL: "https://auth.manheim.com/token",
    MANHEIM_MMR_URL: "https://api.manheim.com",
    MANHEIM_CLIENT_ID: "client-id",
    MANHEIM_CLIENT_SECRET: "client-secret",
    MANHEIM_USERNAME: "user",
    MANHEIM_PASSWORD: "pass",
    ALERT_WEBHOOK_URL: "https://hooks.example.com/alert",
    TWILIO_ACCOUNT_SID: "twilio-sid",
    TWILIO_AUTH_TOKEN: "twilio-token",
    TWILIO_FROM_NUMBER: "+15550000000",
    ALERT_TO_NUMBER: "+15551111111",
    TAV_KV: null as unknown as KVNamespace,
    ADMIN_API_SECRET: "admin-secret",
    APP_API_SECRET: "app-secret",
    HYBRID_BUYBOX_ENABLED: "false",
    MANHEIM_LOOKUP_MODE: "direct",
    INTEL_WORKER_URL: "",
    INTEL_WORKER_SECRET: "",
  };
}

function makeKv(store: Record<string, string> = {}): KVNamespace {
  return {
    get: vi.fn(async (key: string) => store[key] ?? null),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    list: vi.fn(async () => ({ keys: [], list_complete: true, cursor: "" })),
    getWithMetadata: vi.fn(async () => ({ value: null, metadata: null })),
  } as unknown as KVNamespace;
}

function mockFetch(responses: Array<{ ok: boolean; body: unknown }>) {
  let call = 0;
  vi.stubGlobal("fetch", vi.fn(async () => {
    const r = responses[call++] ?? { ok: false, body: {} };
    return {
      ok: r.ok,
      status: r.ok ? 200 : 500,
      json: async () => r.body,
    };
  }));
}

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("getMmrValue — VIN path", () => {
  it("returns cached VIN result without fetching", async () => {
    const cached = { mmrValue: 15000, confidence: "high", rawResponse: {} };
    const kv = makeKv({ [`mmr:vin:${VIN}`]: JSON.stringify(cached) });
    vi.stubGlobal("fetch", vi.fn());

    const result = await getMmrValue({ vin: VIN, mileage: 50_000 }, makeEnv(), kv);

    expect(result).toEqual(cached);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches token then VIN, caches result, returns high-confidence value", async () => {
    const kv = makeKv();
    mockFetch([
      { ok: true, body: TOKEN_RESPONSE },
      { ok: true, body: MMR_VIN_RESPONSE },
    ]);

    const result = await getMmrValue({ vin: VIN, mileage: 50_000 }, makeEnv(), kv);

    expect(result).toMatchObject({ mmrValue: 14750, confidence: "high" });
    expect(kv.put).toHaveBeenCalledWith(
      `mmr:vin:${VIN}`,
      expect.stringContaining("14750"),
      expect.objectContaining({ expirationTtl: 86400 }),
    );
  });

  it("returns null when VIN API returns non-ok status", async () => {
    const kv = makeKv();
    mockFetch([
      { ok: true, body: TOKEN_RESPONSE },
      { ok: false, body: {} },
    ]);

    const result = await getMmrValue({ vin: VIN }, makeEnv(), kv);

    expect(result).toBeNull();
  });

  it("falls through to YMM when VIN API returns ok but no extractable value", async () => {
    const kv = makeKv();
    mockFetch([
      { ok: true, body: TOKEN_RESPONSE },  // token (VIN path)
      { ok: true, body: {} },              // VIN — no recognisable fields
      { ok: true, body: TOKEN_RESPONSE },  // token (YMM path, uncached — separate call)
      { ok: true, body: MMR_YMM_RESPONSE },
    ]);

    const result = await getMmrValue({ vin: VIN, year: 2020, make: "toyota", model: "camry", mileage: 55_000 }, makeEnv(), kv);

    expect(result).toMatchObject({ mmrValue: 13200, confidence: "medium" });
  });
});

describe("getMmrValue — YMM path (no VIN)", () => {
  it("returns cached YMM result without fetching", async () => {
    const cached = { mmrValue: 12000, confidence: "medium", rawResponse: {} };
    const ymmKey = kvKeyForYmm(2020, "toyota", "camry", 55_000);
    const kv = makeKv({ [ymmKey]: JSON.stringify(cached) });
    vi.stubGlobal("fetch", vi.fn());

    const result = await getMmrValue({ year: 2020, make: "toyota", model: "camry", mileage: 55_000 }, makeEnv(), kv);

    expect(result).toEqual(cached);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches token then YMM, caches result, returns medium-confidence value", async () => {
    const kv = makeKv();
    mockFetch([
      { ok: true, body: TOKEN_RESPONSE },
      { ok: true, body: MMR_YMM_RESPONSE },
    ]);

    const result = await getMmrValue({ year: 2020, make: "toyota", model: "camry", mileage: 55_000 }, makeEnv(), kv);

    expect(result).toMatchObject({ mmrValue: 13200, confidence: "medium" });
    expect(kv.put).toHaveBeenCalledWith(
      kvKeyForYmm(2020, "toyota", "camry", 55_000),
      expect.stringContaining("13200"),
      expect.objectContaining({ expirationTtl: 21600 }),
    );
  });

  it("returns null when all YMM params present but API fails", async () => {
    const kv = makeKv();
    mockFetch([
      { ok: true, body: TOKEN_RESPONSE },
      { ok: false, body: {} },
    ]);

    const result = await getMmrValue({ year: 2020, make: "toyota", model: "camry", mileage: 55_000 }, makeEnv(), kv);

    expect(result).toBeNull();
  });

  it("returns null when YMM params are incomplete", async () => {
    const kv = makeKv();
    vi.stubGlobal("fetch", vi.fn());

    // Missing mileage — YMM path requires all four params
    const result = await getMmrValue({ year: 2020, make: "toyota", model: "camry" }, makeEnv(), kv);

    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns null when no params provided at all", async () => {
    const kv = makeKv();
    vi.stubGlobal("fetch", vi.fn());

    const result = await getMmrValue({}, makeEnv(), kv);

    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("getMmrValue — token caching", () => {
  it("uses cached token without re-fetching it", async () => {
    const kv = makeKv({ "manheim:token": "cached-token-xyz" });
    mockFetch([
      { ok: true, body: MMR_VIN_RESPONSE }, // only the VIN call, no token fetch
    ]);

    const result = await getMmrValue({ vin: VIN, mileage: 50_000 }, makeEnv(), kv);

    expect(result).toMatchObject({ mmrValue: 14750 });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/valuations/vin/");
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe("Bearer cached-token-xyz");
  });
});

// ── getValuationLookupMode ────────────────────────────────────────────────────

describe("getValuationLookupMode", () => {
  it("returns 'direct' when MANHEIM_LOOKUP_MODE is 'direct'", () => {
    expect(getValuationLookupMode({ ...makeEnv(), MANHEIM_LOOKUP_MODE: "direct" })).toBe("direct");
  });

  it("returns 'direct' when MANHEIM_LOOKUP_MODE is empty string", () => {
    expect(getValuationLookupMode({ ...makeEnv(), MANHEIM_LOOKUP_MODE: "" })).toBe("direct");
  });

  it("returns 'direct' for any unrecognised value", () => {
    expect(getValuationLookupMode({ ...makeEnv(), MANHEIM_LOOKUP_MODE: "unknown" })).toBe("direct");
  });

  it("returns 'worker' when MANHEIM_LOOKUP_MODE is 'worker'", () => {
    expect(getValuationLookupMode({ ...makeEnv(), MANHEIM_LOOKUP_MODE: "worker" })).toBe("worker");
  });
});
