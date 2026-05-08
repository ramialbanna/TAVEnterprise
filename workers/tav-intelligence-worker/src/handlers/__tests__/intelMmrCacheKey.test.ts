import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError, ValidationError, PersistenceError } from "../../errors";
import type { HandlerArgs } from "../types";
import type { Env } from "../../types/env";
import type { ApiResponse } from "../../types/api";

const mockMaybeSingle = vi.fn();
const mockEq     = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom   = vi.fn(() => ({ select: mockSelect }));

vi.mock("../../persistence/supabase", () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));

// Import after mock is registered
const { handleIntelMmrCacheKey } = await import("../intelMmrCacheKey");

const env: Env = {
  TAV_INTEL_KV:              null as unknown as KVNamespace,
  MANAGER_EMAIL_ALLOWLIST:   "",
  MANHEIM_CLIENT_ID:         "",
  MANHEIM_CLIENT_SECRET:     "",
  MANHEIM_USERNAME:          "",
  MANHEIM_PASSWORD:          "",
  MANHEIM_TOKEN_URL:         "",
  MANHEIM_MMR_URL:           "",
  SUPABASE_URL:              "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-key",
  INTEL_SERVICE_SECRET: "",
};

const authedCtx = { userId: "rami@texasautovalue.com", email: "rami@texasautovalue.com", name: null, roles: [] as string[] };
const anonCtx   = { userId: null, email: null, name: null, roles: [] as string[] };

function buildArgs(cacheKey: string, authed = true): HandlerArgs {
  return {
    request:     new Request(`https://worker.test/intel/mmr/${cacheKey}`, { method: "GET" }),
    env,
    requestId:   "req-intel-1",
    userContext: authed ? authedCtx : anonCtx,
    pathParams:  { cacheKey },
  };
}

describe("handleIntelMmrCacheKey", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws AuthError when unauthenticated", async () => {
    await expect(
      handleIntelMmrCacheKey(buildArgs("vin:1HGCM82633A123456", false)),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("throws ValidationError when cacheKey is empty string", async () => {
    const args: HandlerArgs = { ...buildArgs("vin:1HGCM82633A123456"), pathParams: { cacheKey: "" } };
    await expect(handleIntelMmrCacheKey(args)).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when cacheKey pathParam is absent", async () => {
    const args: HandlerArgs = { ...buildArgs("vin:1HGCM82633A123456"), pathParams: {} };
    await expect(handleIntelMmrCacheKey(args)).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns 404 when no entry exists for the key", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const res  = await handleIntelMmrCacheKey(buildArgs("vin:NOTFOUND00000000"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<never>;
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe("not_found");
    expect(body.requestId).toBe("req-intel-1");
  });

  it("returns 200 with row data when entry exists", async () => {
    const row = {
      cache_key:           "vin:1HGCM82633A123456",
      vin:                 "1HGCM82633A123456",
      year:                2003,
      mmr_value:           8500,
      is_inferred_mileage: false,
      fetched_at:          "2026-05-08T12:00:00.000Z",
    };
    mockMaybeSingle.mockResolvedValueOnce({ data: row, error: null });

    const res  = await handleIntelMmrCacheKey(buildArgs("vin:1HGCM82633A123456"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<typeof row>;
    expect(body.success).toBe(true);
    expect(body.data).toEqual(row);
    expect(body.requestId).toBe("req-intel-1");
  });

  it("throws PersistenceError when Supabase returns an error", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data:  null,
      error: { code: "PGRST116", message: "db unavailable" },
    });

    await expect(
      handleIntelMmrCacheKey(buildArgs("vin:1HGCM82633A123456")),
    ).rejects.toBeInstanceOf(PersistenceError);
  });

  it("queries mmr_cache table with the provided cache key", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await handleIntelMmrCacheKey(buildArgs("ymm:2020:toyota:camry:55000"));

    expect(mockFrom).toHaveBeenCalledWith("mmr_cache");
    expect(mockSelect).toHaveBeenCalledWith("*");
    expect(mockEq).toHaveBeenCalledWith("cache_key", "ymm:2020:toyota:camry:55000");
  });
});
