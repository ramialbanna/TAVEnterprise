import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError, ValidationError, PersistenceError } from "../../errors";
import type { HandlerArgs } from "../types";
import type { Env } from "../../types/env";
import type { ApiResponse } from "../../types/api";

const mockLimit      = vi.fn();
const mockOrder      = vi.fn(() => ({ limit: mockLimit }));
const mockIsNull     = vi.fn(() => ({ order: mockOrder }));
const mockEqVin      = vi.fn(() => ({ is: mockIsNull }));
const mockSelect     = vi.fn(() => ({ eq: mockEqVin }));
const mockFrom       = vi.fn(() => ({ select: mockSelect }));

vi.mock("../../persistence/supabase", () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));

const { handleActivityVin } = await import("../activityVin");

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

const VALID_VIN = "1HGCM82633A123456";

function buildArgs(opts: { vin?: string | null; authed?: boolean; limitParam?: string }): HandlerArgs {
  const vin = opts.vin ?? VALID_VIN;
  const url = new URL(`https://worker.test/activity/vin/${vin}`);
  if (opts.limitParam) url.searchParams.set("limit", opts.limitParam);
  return {
    request:     new Request(url.toString(), { method: "GET" }),
    env,
    requestId:   "req-a",
    userContext: opts.authed !== false ? authedCtx : anonCtx,
    // opts.vin === null signals "omit pathParams entirely" for missing-param tests
    pathParams:  opts.vin === null ? undefined : { vin: vin },
  };
}

describe("handleActivityVin", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws AuthError without Cloudflare Access identity", async () => {
    await expect(handleActivityVin(buildArgs({ authed: false }))).rejects.toBeInstanceOf(AuthError);
  });

  it("throws ValidationError when vin pathParam is missing", async () => {
    await expect(handleActivityVin(buildArgs({ vin: null }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when vin is too short", async () => {
    await expect(handleActivityVin(buildArgs({ vin: "SHORT" }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when vin is too long", async () => {
    await expect(handleActivityVin(buildArgs({ vin: "A".repeat(20) }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns 200 with entries and uppercased VIN", async () => {
    const rows = [{ id: "1", vin: "1HGCM82633A123456", activity_type: "vin_view" }];
    mockLimit.mockResolvedValueOnce({ data: rows, error: null });

    const res  = await handleActivityVin(buildArgs({ vin: "1hgcm82633a123456" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ vin: string; entries: unknown[]; count: number; limit: number }>;
    expect(body.success).toBe(true);
    expect(body.data?.vin).toBe("1HGCM82633A123456");
    expect(body.data?.entries).toEqual(rows);
    expect(body.data?.count).toBe(1);
    expect(body.data?.limit).toBe(50);
  });

  it("returns empty entries when no rows found", async () => {
    mockLimit.mockResolvedValueOnce({ data: null, error: null });

    const res  = await handleActivityVin(buildArgs({}));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ entries: unknown[] }>;
    expect(body.data?.entries).toEqual([]);
  });

  it("throws PersistenceError when Supabase returns an error", async () => {
    mockLimit.mockResolvedValueOnce({ data: null, error: { code: "PGRST", message: "db error" } });
    await expect(handleActivityVin(buildArgs({}))).rejects.toBeInstanceOf(PersistenceError);
  });
});
