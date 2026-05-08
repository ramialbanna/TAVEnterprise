import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError, ValidationError, PersistenceError } from "../../errors";
import type { HandlerArgs } from "../types";
import type { Env } from "../../types/env";
import type { ApiResponse } from "../../types/api";

const mockLimit  = vi.fn();
const mockOrder  = vi.fn(() => ({ limit: mockLimit }));
const mockIsNull = vi.fn(() => ({ order: mockOrder }));
const mockEq     = vi.fn(() => ({ is: mockIsNull, eq: vi.fn(() => ({ is: mockIsNull })), order: mockOrder }));
const mockSelect = vi.fn(() => ({ is: mockIsNull, eq: mockEq }));
const mockFrom   = vi.fn(() => ({ select: mockSelect }));

vi.mock("../../persistence/supabase", () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}));

const { handleActivityFeed } = await import("../activityFeed");

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
};

const authedCtx = { userId: "rami@texasautovalue.com", email: "rami@texasautovalue.com", name: null, roles: [] as string[] };
const anonCtx   = { userId: null, email: null, name: null, roles: [] as string[] };

function buildArgs(params: Record<string, string> = {}, authed = true): HandlerArgs {
  const url = new URL("https://worker.test/activity/feed");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return {
    request:     new Request(url.toString(), { method: "GET" }),
    env,
    requestId:   "req-feed-1",
    userContext: authed ? authedCtx : anonCtx,
  };
}

describe("handleActivityFeed", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("throws AuthError when unauthenticated", async () => {
    await expect(handleActivityFeed(buildArgs({}, false))).rejects.toBeInstanceOf(AuthError);
  });

  it("throws ValidationError on unknown activity_type", async () => {
    await expect(
      handleActivityFeed(buildArgs({ activity_type: "not_a_type" })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns 200 with entries on success", async () => {
    const rows = [
      { id: "1", activity_type: "mmr_search", created_at: "2026-05-08T12:00:00Z" },
      { id: "2", activity_type: "vin_view",   created_at: "2026-05-08T11:00:00Z" },
    ];
    mockLimit.mockResolvedValueOnce({ data: rows, error: null });

    const res  = await handleActivityFeed(buildArgs());
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ entries: unknown[]; count: number; limit: number }>;
    expect(body.success).toBe(true);
    expect(body.data?.entries).toEqual(rows);
    expect(body.data?.count).toBe(2);
    expect(body.data?.limit).toBe(50);
    expect(body.requestId).toBe("req-feed-1");
  });

  it("returns empty entries when no rows exist", async () => {
    mockLimit.mockResolvedValueOnce({ data: null, error: null });

    const res  = await handleActivityFeed(buildArgs());
    const body = (await res.json()) as ApiResponse<{ entries: unknown[] }>;
    expect(body.data?.entries).toEqual([]);
  });

  it("respects limit param clamped to 100", async () => {
    mockLimit.mockResolvedValueOnce({ data: [], error: null });

    const res  = await handleActivityFeed(buildArgs({ limit: "999" }));
    const body = (await res.json()) as ApiResponse<{ limit: number }>;
    expect(body.data?.limit).toBe(100);
  });

  it("throws PersistenceError when Supabase returns an error", async () => {
    mockLimit.mockResolvedValueOnce({ data: null, error: { code: "PGRST", message: "db error" } });
    await expect(handleActivityFeed(buildArgs())).rejects.toBeInstanceOf(PersistenceError);
  });

  it("queries the user_activity table", async () => {
    mockLimit.mockResolvedValueOnce({ data: [], error: null });
    await handleActivityFeed(buildArgs());
    expect(mockFrom).toHaveBeenCalledWith("user_activity");
  });
});
