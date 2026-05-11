import { describe, it, expect, vi } from "vitest";
import { performMmrLookup } from "../mmrLookup";
import { RateLimitError } from "../../errors";
import type { MmrLookupDeps, MmrLookupInput } from "../mmrLookup";
import type { MmrResponseEnvelope } from "../../validate";
import type { UserContext } from "../../auth/userContext";

// ── Shared fixtures ───────────────────────────────────────────────────────────

const USER_CTX: UserContext = {
  userId: "rami@texasautovalue.com",
  email:  "rami@texasautovalue.com",
  name:   "Rami",
  roles:  [],
};

const VIN_INPUT: MmrLookupInput = {
  kind:    "vin",
  vin:     "1HGCM82633A123456",
  year:    2020,
  mileage: 45_000,
};

const LIVE_RESULT = {
  mmr_value:  18_500,
  fetched_at: "2026-05-08T12:00:00.000Z",
  payload:    { items: [] },
  retryCount: 0,
};

const LIVE_ENVELOPE: MmrResponseEnvelope = {
  ok:                  true,
  mmr_value:           18_500,
  mileage_used:        45_000,
  is_inferred_mileage: false,
  cache_hit:           false,
  source:              "manheim",
  fetched_at:          "2026-05-08T12:00:00.000Z",
  expires_at:          "2026-05-09T12:00:00.000Z",
  mmr_payload:         { items: [] },
  error_code:          null,
  error_message:       null,
};

/** Build a minimal MmrLookupDeps that will reach the live-call path. */
function makeMissDeps(overrides: Partial<MmrLookupDeps> = {}): MmrLookupDeps {
  return {
    client: {
      lookupByVin: vi.fn().mockResolvedValue(LIVE_RESULT),
      lookupByYmm: vi.fn(),
    },
    cache: {
      get:        vi.fn().mockResolvedValue(null), // always miss
      set:        vi.fn().mockResolvedValue(undefined),
      invalidate: vi.fn(),
    },
    lock: {
      acquire: vi.fn().mockResolvedValue(true),
      release: vi.fn().mockResolvedValue(undefined),
      wait:    vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

// ── Test 1: under limit — proceeds to live call ───────────────────────────────

describe("mmrLookup — rate limiter passes", () => {
  it("calls the Manheim client when the rate limiter resolves", async () => {
    const rateLimiter = { check: vi.fn().mockResolvedValue(undefined) };
    const deps        = makeMissDeps({ rateLimiter });

    await performMmrLookup(
      { input: VIN_INPUT, requestId: "req-rl-1", userContext: USER_CTX },
      deps,
    );

    expect(rateLimiter.check).toHaveBeenCalledOnce();
    expect(rateLimiter.check).toHaveBeenCalledWith(USER_CTX.email, "req-rl-1");
    expect(vi.mocked(deps.client.lookupByVin)).toHaveBeenCalledOnce();
  });
});

// ── Test 2: over limit — 429 before any Manheim call ─────────────────────────

describe("mmrLookup — rate limiter rejects", () => {
  it("throws RateLimitError and never calls the Manheim client", async () => {
    const rateLimiter = {
      check: vi.fn().mockRejectedValue(
        new RateLimitError("Live lookup rate limit exceeded: max 10 per 60s window", {
          limit: 10, windowSeconds: 60,
        }),
      ),
    };
    const deps = makeMissDeps({ rateLimiter });

    await expect(
      performMmrLookup(
        { input: VIN_INPUT, requestId: "req-rl-2", userContext: USER_CTX },
        deps,
      ),
    ).rejects.toBeInstanceOf(RateLimitError);

    expect(vi.mocked(deps.client.lookupByVin)).not.toHaveBeenCalled();
  });

  it("RateLimitError surfaces with stable code and HTTP status", async () => {
    const err = new RateLimitError("over limit", { limit: 10, windowSeconds: 60 });
    expect(err.code).toBe("rate_limited");
    expect(err.httpStatus).toBe(429);
    expect(err.details).toEqual({ limit: 10, windowSeconds: 60 });
  });
});

// ── Test 3: cache hit — rate limiter is never invoked ─────────────────────────

describe("mmrLookup — cache hit bypasses rate limiter", () => {
  it("does not call the rate limiter when the initial cache read hits", async () => {
    const rateLimiter = { check: vi.fn() };
    const deps: MmrLookupDeps = {
      client: { lookupByVin: vi.fn(), lookupByYmm: vi.fn() },
      cache: {
        get:        vi.fn().mockResolvedValue(LIVE_ENVELOPE), // cache hit
        set:        vi.fn(),
        invalidate: vi.fn(),
      },
      lock:        { acquire: vi.fn(), release: vi.fn(), wait: vi.fn() },
      rateLimiter,
    };

    const result = await performMmrLookup(
      { input: VIN_INPUT, requestId: "req-rl-3", userContext: USER_CTX },
      deps,
    );

    expect(result.cache_hit).toBe(true);
    expect(rateLimiter.check).not.toHaveBeenCalled();
    expect(vi.mocked(deps.client.lookupByVin)).not.toHaveBeenCalled();
  });
});

// ── Test 4: absent rateLimiter dep — no error ─────────────────────────────────

describe("mmrLookup — rateLimiter dep absent", () => {
  it("proceeds to live call with no errors when rateLimiter is not provided", async () => {
    const deps = makeMissDeps(); // no rateLimiter

    const result = await performMmrLookup(
      { input: VIN_INPUT, requestId: "req-rl-4", userContext: USER_CTX },
      deps,
    );

    expect(result.mmr_value).toBe(18_500);
    expect(vi.mocked(deps.client.lookupByVin)).toHaveBeenCalledOnce();
  });
});
