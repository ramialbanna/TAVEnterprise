import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ManheimHttpClient } from "../manheimHttp";
import type { Env } from "../../types/env";

/** Read the URL passed to a fetch mock invocation, safely under noUncheckedIndexedAccess. */
function urlOfCall(mock: ReturnType<typeof vi.fn>, callIndex: number): string {
  const calls = mock.mock.calls as unknown as Array<unknown[]>;
  const call = calls[callIndex];
  if (!call) throw new Error(`expected call at index ${callIndex} but none recorded`);
  return String(call[0]);
}
import {
  ManheimAuthError,
  ManheimRateLimitError,
  ManheimResponseError,
  ManheimUnavailableError,
} from "../../errors";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const PASSWORD       = "p@ssw0rd-secret-XYZ";
const CLIENT_SECRET  = "client-secret-VALUE-DO-NOT-LEAK";

const ENV: Env = {
  TAV_INTEL_KV: null as unknown as KVNamespace,
  MANAGER_EMAIL_ALLOWLIST: "",
  MANHEIM_CLIENT_ID:     "client-id",
  MANHEIM_CLIENT_SECRET: CLIENT_SECRET,
  MANHEIM_USERNAME:      "user@example.com",
  MANHEIM_PASSWORD:      PASSWORD,
  MANHEIM_TOKEN_URL:     "https://api.manheim.com/oauth2/token",
  MANHEIM_MMR_URL:       "https://api.manheim.com",
};

interface FakeKv {
  kv:    KVNamespace;
  store: Map<string, string>;
}

function makeFakeKv(): FakeKv {
  const store = new Map<string, string>();
  const kv = {
    get: vi.fn(async (key: string, options?: { type?: string }) => {
      const raw = store.get(key);
      if (raw === undefined) return null;
      if (options?.type === "json") {
        return JSON.parse(raw) as unknown;
      }
      return raw;
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list:   vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
  return { kv, store };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status:  200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function statusResponse(status: number, headers?: Record<string, string>): Response {
  return new Response("", {
    status,
    headers,
  });
}

const TOKEN_BODY = { access_token: "tok_abc", expires_in: 1_800 };
const VIN_BODY   = { items: [{ wholesale: { average: 18_500 } }] };
const YMM_BODY   = { items: [{ wholesale: { average: 22_750 } }] };

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("ManheimHttpClient", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    logSpy.mockRestore();
  });

  function logEvents(): Array<{ event: string; [k: string]: unknown }> {
    return logSpy.mock.calls.map((call) =>
      JSON.parse(String(call[0])) as { event: string; [k: string]: unknown },
    );
  }

  /**
   * Drive a promise to completion despite the test using fake timers.
   *
   * Crucial: we attach a no-op `.catch` *immediately* so that any rejection
   * that fires during `runAllTimersAsync` does not surface as an unhandled
   * rejection before our `.rejects.toBeInstanceOf(...)` assertion attaches
   * its own handler.
   */
  async function flush<T>(promise: Promise<T>): Promise<T> {
    promise.catch(() => undefined); // suppress "unhandled rejection" race
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
      await vi.runAllTimersAsync();
    }
    return promise;
  }

  // ── 1. Token reuse ──────────────────────────────────────────────────────────

  it("reuses cached token when expires_at is far in the future", async () => {
    const { kv, store } = makeFakeKv();
    // Pre-seed a token good for another hour.
    store.set("manheim:token", JSON.stringify({
      access_token: "tok_cached",
      expires_at:   Date.now() + 3_600_000,
    }));

    const fetchFn = vi.fn(async () => jsonResponse(VIN_BODY));
    const client  = new ManheimHttpClient(ENV, kv, fetchFn);

    await flush(client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "req-1",
    }));

    // Exactly one call — the lookup. No token POST.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = urlOfCall(fetchFn, 0);
    expect(url).toContain("/valuations/vin/1HGCM82633A123456");
  });

  // ── 2. Token refresh near expiry ────────────────────────────────────────────

  it("refreshes token when within the 60s expiry buffer", async () => {
    const { kv, store } = makeFakeKv();
    // Token expires 30s from now → within buffer → must refresh.
    store.set("manheim:token", JSON.stringify({
      access_token: "tok_old",
      expires_at:   Date.now() + 30_000,
    }));

    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY)); // refresh
    fetchFn.mockResolvedValueOnce(jsonResponse(VIN_BODY));   // lookup

    const client = new ManheimHttpClient(ENV, kv, fetchFn);
    await flush(client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "req-2",
    }));

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const tokenUrl = urlOfCall(fetchFn, 0);
    expect(tokenUrl).toBe(ENV.MANHEIM_TOKEN_URL);
  });

  // ── 3. Token refresh single-flight ──────────────────────────────────────────

  it("waits and re-reads cache when another request holds the refresh lock", async () => {
    const { kv, store } = makeFakeKv();
    // Set the lock to "someone else."
    store.set("lock:manheim:token:refresh", "other-req");

    // After the second poll, simulate the other request finishing by
    // populating the token cache.
    let pollCount = 0;
    (kv.get as ReturnType<typeof vi.fn>).mockImplementation(async (
      key: string,
      options?: { type?: string },
    ) => {
      if (key === "manheim:token") {
        if (pollCount >= 1) {
          // Token now exists.
          return {
            access_token: "tok_other_refreshed",
            expires_at:   Date.now() + 3_600_000,
          };
        }
        return null;
      }
      if (key === "lock:manheim:token:refresh") {
        pollCount++;
        return "other-req";
      }
      const raw = store.get(key);
      if (raw === undefined) return null;
      if (options?.type === "json") return JSON.parse(raw) as unknown;
      return raw;
    });

    const fetchFn = vi.fn(async () => jsonResponse(VIN_BODY));
    const client  = new ManheimHttpClient(ENV, kv, fetchFn);

    await flush(client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "waiter-req",
    }));

    // No token POST — we waited and reused the other request's token.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = urlOfCall(fetchFn, 0);
    expect(url).toContain("/valuations/vin/");
  });

  // ── 4. Token endpoint 401 → ManheimAuthError ────────────────────────────────

  it("token refresh on 401 from token endpoint throws ManheimAuthError", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn(async () => statusResponse(401));

    const client = new ManheimHttpClient(ENV, kv, fetchFn);
    const promise = client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "req-401",
    });

    await expect(flush(promise)).rejects.toBeInstanceOf(ManheimAuthError);
  });

  // ── 5. Token endpoint 5xx → ManheimUnavailableError (locked 2026-05-07) ─────
  // Token-endpoint 5xx and network failures map to ManheimUnavailableError
  // (infrastructure availability), not ManheimAuthError (credentials).

  it("token refresh on 5xx surfaces as ManheimUnavailableError", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn(async () => statusResponse(503));

    const client = new ManheimHttpClient(ENV, kv, fetchFn);
    const promise = client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "req-tok-5xx",
    });

    await expect(flush(promise)).rejects.toBeInstanceOf(ManheimUnavailableError);
  });

  // ── 6. VIN happy path ───────────────────────────────────────────────────────

  it("VIN happy path returns mmr_value, payload, fetched_at, retryCount=0", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(jsonResponse(VIN_BODY));

    const client = new ManheimHttpClient(ENV, kv, fetchFn);
    const result = await flush(client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "req-vin-ok",
    })) as {
      mmr_value: number;
      payload: Record<string, unknown>;
      fetched_at: string;
      retryCount: number;
    };

    expect(result.mmr_value).toBe(18_500);
    expect(result.retryCount).toBe(0);
    expect(typeof result.fetched_at).toBe("string");
    expect(result.payload).toEqual(VIN_BODY);
  });

  // ── 7. YMM uses path segments (regression) ─────────────────────────────────

  it("YMM lookup builds a path-segment URL (NOT query params)", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(jsonResponse(YMM_BODY));

    const client = new ManheimHttpClient(ENV, kv, fetchFn);
    await flush(client.lookupByYmm({
      year:  2020,
      make:  "Toyota",
      model: "Camry",
      trim:  "SE",
      mileage: 60_000,
      requestId: "req-ymm",
    }));

    const url = urlOfCall(fetchFn, 1);
    // Path segments — year/make/model in the path, not the querystring.
    expect(url).toContain("/valuations/search/2020/Toyota/Camry");
    // The querystring may include odometer/include/trim, but year/make/model
    // must NOT be there as ?year=...
    expect(url).not.toMatch(/[?&]year=2020/);
    expect(url).not.toMatch(/[?&]make=Toyota/);
    expect(url).not.toMatch(/[?&]model=Camry/);
  });

  // ── 8. 404 → mmr_value: null ────────────────────────────────────────────────

  it("404 from MMR returns mmr_value: null (not an error)", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(statusResponse(404));

    const client = new ManheimHttpClient(ENV, kv, fetchFn);
    const result = await flush(client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "req-404",
    })) as { mmr_value: number | null; retryCount: number };

    expect(result.mmr_value).toBeNull();
    expect(result.retryCount).toBe(0);
  });

  // ── 9. 401 from MMR → ManheimAuthError ──────────────────────────────────────

  it("401 from MMR endpoint throws ManheimAuthError", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(statusResponse(401));

    const client = new ManheimHttpClient(ENV, kv, fetchFn);
    const promise = client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "req-mmr-401",
    });

    await expect(flush(promise)).rejects.toBeInstanceOf(ManheimAuthError);
  });

  // ── 10. 429 honors Retry-After ──────────────────────────────────────────────

  it("429 with Retry-After header is honored before retry", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(statusResponse(429, { "Retry-After": "2" }));
    fetchFn.mockResolvedValueOnce(jsonResponse(VIN_BODY));

    const client = new ManheimHttpClient(ENV, kv, fetchFn);
    const result = await flush(client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "req-ra",
    })) as { mmr_value: number; retryCount: number };

    expect(result.mmr_value).toBe(18_500);
    expect(result.retryCount).toBe(1);
    // Retry-After observed event was emitted.
    expect(logEvents().some((e) =>
      e.event === "manheim.http.retry_after_observed",
    )).toBe(true);
  });

  // ── 11. 429 exhausted → ManheimRateLimitError ───────────────────────────────

  it("429 exhausted across all retries throws ManheimRateLimitError", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValue(statusResponse(429, { "Retry-After": "0" }));

    const client = new ManheimHttpClient(ENV, kv, fetchFn);
    const promise = client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "req-429-x",
    });

    await expect(flush(promise)).rejects.toBeInstanceOf(ManheimRateLimitError);
  });

  // ── 12. 500 retry succeeds on attempt 2 ─────────────────────────────────────

  it("500 retries and succeeds on subsequent attempt", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(statusResponse(500));
    fetchFn.mockResolvedValueOnce(jsonResponse(VIN_BODY));

    const client = new ManheimHttpClient(ENV, kv, fetchFn);
    const result = await flush(client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "req-500-ok",
    })) as { mmr_value: number; retryCount: number };

    expect(result.mmr_value).toBe(18_500);
    expect(result.retryCount).toBe(1);
  });

  // ── 13. 5xx exhausted → ManheimUnavailableError ─────────────────────────────

  it("5xx across all attempts throws ManheimUnavailableError", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValue(statusResponse(503));

    const client = new ManheimHttpClient(ENV, kv, fetchFn);
    const promise = client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "req-5xx-x",
    });

    await expect(flush(promise)).rejects.toBeInstanceOf(ManheimUnavailableError);
  });

  // ── 14. Network throw retries ───────────────────────────────────────────────

  it("network error on first attempt is retried", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockRejectedValueOnce(new Error("ECONNRESET"));
    fetchFn.mockResolvedValueOnce(jsonResponse(VIN_BODY));

    const client = new ManheimHttpClient(ENV, kv, fetchFn);
    const result = await flush(client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "req-net",
    })) as { mmr_value: number; retryCount: number };

    expect(result.mmr_value).toBe(18_500);
    expect(result.retryCount).toBe(1);
  });

  // ── 15. Malformed JSON body → ManheimResponseError ──────────────────────────

  it("malformed JSON in MMR response throws ManheimResponseError", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    // Return a 200 with non-JSON body.
    fetchFn.mockResolvedValueOnce(new Response("<html>oops</html>", {
      status:  200,
      headers: { "Content-Type": "text/html" },
    }));

    const client = new ManheimHttpClient(ENV, kv, fetchFn);
    const promise = client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "req-malformed",
    });

    await expect(flush(promise)).rejects.toBeInstanceOf(ManheimResponseError);
  });

  // ── 16. requestId in every emitted log line ─────────────────────────────────

  it("every log line includes the inbound requestId", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(jsonResponse(VIN_BODY));

    const client = new ManheimHttpClient(ENV, kv, fetchFn);
    await flush(client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "trace-xyz",
    }));

    const events = logEvents();
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.requestId).toBe("trace-xyz");
    }
  });

  // ── 17. No log line contains password / client_secret values ────────────────

  it("never logs MANHEIM_PASSWORD or MANHEIM_CLIENT_SECRET values", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(jsonResponse(VIN_BODY));

    const client = new ManheimHttpClient(ENV, kv, fetchFn);
    await flush(client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "trace-secrets",
    }));

    const allLogJson = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(allLogJson).not.toContain(PASSWORD);
    expect(allLogJson).not.toContain(CLIENT_SECRET);
  });
});
