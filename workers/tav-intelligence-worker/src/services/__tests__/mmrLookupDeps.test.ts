import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../../types/env";

// Mock all infrastructure modules so the factory can be imported without
// real Supabase/KV/Manheim credentials.
vi.mock("../../persistence/supabase", () => ({
  getSupabaseClient: vi.fn().mockReturnValue({ _tag: "supabase-mock" }),
}));
vi.mock("../../persistence/mmrQueriesRepository", () => ({
  createMmrQueriesRepository: vi.fn().mockReturnValue({ insert: vi.fn() }),
}));
vi.mock("../../persistence/mmrCacheRepository", () => ({
  createMmrCacheRepository: vi.fn().mockReturnValue({ upsert: vi.fn() }),
}));
vi.mock("../../persistence/userActivityRepository", () => ({
  createUserActivityRepository: vi.fn().mockReturnValue({ insert: vi.fn() }),
}));
vi.mock("../../clients/manheimHttp", () => ({
  ManheimHttpClient: vi.fn().mockImplementation(() => ({
    lookupByVin: vi.fn(), lookupByYmm: vi.fn(),
  })),
}));
vi.mock("../../cache/kvMmrCache", () => ({
  KvMmrCache: vi.fn().mockImplementation(() => ({
    get: vi.fn(), set: vi.fn(), invalidate: vi.fn(),
  })),
}));
vi.mock("../../cache/kvLock", () => ({
  KvCacheLock: vi.fn().mockImplementation(() => ({
    acquire: vi.fn(), release: vi.fn(), wait: vi.fn(),
  })),
}));
vi.mock("../../rateLimit/kvRateLimiter", () => ({
  KvRateLimiter: vi.fn().mockImplementation(() => ({
    check: vi.fn(),
  })),
}));

import { buildMmrLookupDeps } from "../mmrLookupDeps";
import { getSupabaseClient } from "../../persistence/supabase";
import { createMmrQueriesRepository } from "../../persistence/mmrQueriesRepository";
import { createMmrCacheRepository } from "../../persistence/mmrCacheRepository";
import { createUserActivityRepository } from "../../persistence/userActivityRepository";
import { ManheimHttpClient } from "../../clients/manheimHttp";
import { KvMmrCache } from "../../cache/kvMmrCache";
import { KvCacheLock } from "../../cache/kvLock";
import { KvRateLimiter } from "../../rateLimit/kvRateLimiter";

const env: Env = {
  TAV_INTEL_KV:              null as unknown as KVNamespace,
  MANAGER_EMAIL_ALLOWLIST:   "",
  MANHEIM_CLIENT_ID:         "cid",
  MANHEIM_CLIENT_SECRET:     "csecret",
  MANHEIM_USERNAME:          "user",
  MANHEIM_PASSWORD:          "pass",
  MANHEIM_TOKEN_URL:         "https://auth.manheim.test/token",
  MANHEIM_MMR_URL:           "https://api.manheim.test",
  SUPABASE_URL:              "https://proj.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  INTEL_SERVICE_SECRET: "",
};

describe("buildMmrLookupDeps", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an object with all seven required dep keys", () => {
    const deps = buildMmrLookupDeps(env);
    expect(deps).toHaveProperty("client");
    expect(deps).toHaveProperty("cache");
    expect(deps).toHaveProperty("lock");
    expect(deps).toHaveProperty("rateLimiter");
    expect(deps).toHaveProperty("queryRepo");
    expect(deps).toHaveProperty("cacheRepo");
    expect(deps).toHaveProperty("activityRepo");
  });

  it("calls getSupabaseClient once with the env", () => {
    buildMmrLookupDeps(env);
    expect(getSupabaseClient).toHaveBeenCalledOnce();
    expect(getSupabaseClient).toHaveBeenCalledWith(env);
  });

  it("passes the shared Supabase client to all three repo factories", () => {
    const mockClient = { _tag: "supabase-mock" };
    vi.mocked(getSupabaseClient).mockReturnValueOnce(mockClient as never);

    buildMmrLookupDeps(env);

    expect(createMmrQueriesRepository).toHaveBeenCalledWith(mockClient);
    expect(createMmrCacheRepository).toHaveBeenCalledWith(mockClient);
    expect(createUserActivityRepository).toHaveBeenCalledWith(mockClient);
  });

  it("instantiates ManheimHttpClient with env and KV namespace", () => {
    buildMmrLookupDeps(env);
    expect(ManheimHttpClient).toHaveBeenCalledWith(env, env.TAV_INTEL_KV);
  });

  it("instantiates KvMmrCache with the KV namespace", () => {
    buildMmrLookupDeps(env);
    expect(KvMmrCache).toHaveBeenCalledWith(env.TAV_INTEL_KV);
  });

  it("instantiates KvCacheLock with the KV namespace", () => {
    buildMmrLookupDeps(env);
    expect(KvCacheLock).toHaveBeenCalledWith(env.TAV_INTEL_KV);
  });

  it("instantiates KvRateLimiter with the KV namespace", () => {
    buildMmrLookupDeps(env);
    expect(KvRateLimiter).toHaveBeenCalledWith(env.TAV_INTEL_KV);
  });
});
