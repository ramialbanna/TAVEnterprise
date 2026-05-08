import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleMmrVin } from "../mmrVin";
import { AuthError, ValidationError } from "../../errors";
import type { HandlerArgs } from "../types";
import type { Env } from "../../types/env";
import type { ApiResponse } from "../../types/api";
import type { MmrResponseEnvelope } from "../../validate";

// Mock the MMR service and Supabase factory so handler tests need no real deps.
vi.mock("../../services/mmrLookup", () => ({ performMmrLookup: vi.fn() }));
vi.mock("../../persistence/supabase", () => ({ getSupabaseClient: vi.fn().mockReturnValue({}) }));
vi.mock("../../persistence/mmrQueriesRepository", () => ({ createMmrQueriesRepository: vi.fn().mockReturnValue({ insert: vi.fn() }) }));
vi.mock("../../persistence/mmrCacheRepository", () => ({ createMmrCacheRepository: vi.fn().mockReturnValue({ upsert: vi.fn() }) }));
vi.mock("../../persistence/userActivityRepository", () => ({ createUserActivityRepository: vi.fn().mockReturnValue({ insert: vi.fn() }) }));

import { performMmrLookup } from "../../services/mmrLookup";

const env: Env = {
  TAV_INTEL_KV: null as unknown as KVNamespace,
  MANAGER_EMAIL_ALLOWLIST: "",
  MANHEIM_CLIENT_ID:     "",
  MANHEIM_CLIENT_SECRET: "",
  MANHEIM_USERNAME:      "",
  MANHEIM_PASSWORD:      "",
  MANHEIM_TOKEN_URL:     "",
  MANHEIM_MMR_URL:       "",
  SUPABASE_URL:          "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  INTEL_SERVICE_SECRET: "",
};

const MOCK_ENVELOPE: MmrResponseEnvelope = {
  ok:                  true,
  mmr_value:           18_500,
  mileage_used:        50_000,
  is_inferred_mileage: false,
  cache_hit:           false,
  source:              "manheim",
  fetched_at:          "2026-05-07T12:00:00.000Z",
  expires_at:          "2026-05-08T12:00:00.000Z",
  mmr_payload:         { items: [] },
  error_code:          null,
  error_message:       null,
};

function buildArgs(opts: { body?: string; authed?: boolean }): HandlerArgs {
  return {
    request: new Request("https://example.test/mmr/vin", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    opts.body,
    }),
    env,
    requestId:   "req-1",
    userContext: opts.authed
      ? { userId: "rami@texasautovalue.com", email: "rami@texasautovalue.com", name: null, roles: [] }
      : { userId: null, email: null, name: null, roles: [] },
  };
}

describe("handleMmrVin", () => {
  beforeEach(() => {
    vi.mocked(performMmrLookup).mockResolvedValue(MOCK_ENVELOPE);
  });

  it("throws AuthError when no Cloudflare Access identity present", async () => {
    const args = buildArgs({ authed: false, body: JSON.stringify({ vin: "1HGCM82633A123456" }) });
    await expect(handleMmrVin(args)).rejects.toBeInstanceOf(AuthError);
  });

  it("throws ValidationError on malformed JSON body", async () => {
    const args = buildArgs({ authed: true, body: "{not-json" });
    await expect(handleMmrVin(args)).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when the body fails schema validation", async () => {
    const args = buildArgs({ authed: true, body: JSON.stringify({ vin: "tooshort" }) });
    await expect(handleMmrVin(args)).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns the MMR envelope on a valid request", async () => {
    const args = buildArgs({
      authed: true,
      body:   JSON.stringify({ vin: "1HGCM82633A123456", mileage: 50_000 }),
    });
    const res  = await handleMmrVin(args);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<MmrResponseEnvelope>;
    expect(body.success).toBe(true);
    expect(body.requestId).toBe("req-1");
    expect(body.data?.mmr_value).toBe(18_500);
    expect(body.data?.cache_hit).toBe(false);
  });

  it("throws AuthError when force_refresh used without allowlist membership", async () => {
    const args = buildArgs({
      authed: true,
      body:   JSON.stringify({ vin: "1HGCM82633A123456", force_refresh: true }),
    });
    // env.MANAGER_EMAIL_ALLOWLIST is "" and user has no manager role
    await expect(handleMmrVin(args)).rejects.toBeInstanceOf(AuthError);
  });
});
