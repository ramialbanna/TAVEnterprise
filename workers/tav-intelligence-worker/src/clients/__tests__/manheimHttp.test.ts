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

/** Read the RequestInit passed to a fetch mock invocation. */
function initOfCall(mock: ReturnType<typeof vi.fn>, callIndex: number): RequestInit {
  const calls = mock.mock.calls as unknown as Array<unknown[]>;
  const call = calls[callIndex];
  if (!call) throw new Error(`expected call at index ${callIndex} but none recorded`);
  return call[1] as RequestInit;
}
import {
  CacheLockError,
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
  SUPABASE_URL:          "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  INTEL_SERVICE_SECRET: "",
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

  // ── 5b. Token refresh lock-wait timeout → CacheLockError (locked 2026-05-07)
  // Distributed-coordination contention is NOT an auth failure. Credentials
  // are valid; the local request simply could not acquire the single-flight
  // lock and the wait window exhausted before another request finished
  // refreshing. Dashboards must distinguish credentials, infrastructure, and
  // contention as three separate operational signals.

  it("token refresh lock held with no token surfaces as CacheLockError", async () => {
    const { kv, store } = makeFakeKv();
    // Lock held by someone else; token cache stays empty for the entire wait.
    store.set("lock:manheim:token:refresh", "other-req");

    const fetchFn = vi.fn(); // never invoked; we never get past the lock wait
    const client  = new ManheimHttpClient(ENV, kv, fetchFn);

    const promise = client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "waiter-timeout",
    });

    await expect(flush(promise)).rejects.toBeInstanceOf(CacheLockError);
    expect(fetchFn).not.toHaveBeenCalled();

    // Telemetry assertion: distinct event name, not refresh_failed.
    const events = logEvents().map((e) => e.event);
    expect(events).toContain("manheim.token.refresh_lock_timeout");
    expect(events).not.toContain("manheim.token.refresh_failed");
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

  // ── 18. client_credentials uses HTTP Basic Auth header (Cox Bridge 2) ───────

  it("client_credentials grant uses HTTP Basic Auth header and omits credentials from body", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(jsonResponse(VIN_BODY));

    const env: Env = {
      ...ENV,
      MANHEIM_GRANT_TYPE: "client_credentials",
      MANHEIM_SCOPE:      "wholesale-valuations.vehicle.mmr-ext.get",
    };
    const client = new ManheimHttpClient(env, kv, fetchFn);
    await flush(client.lookupByVin({ vin: "1HGCM82633A123456", mileage: 45_000, requestId: "req-cc" }));

    const tokenInit = initOfCall(fetchFn, 0);

    // Authorization: Basic base64(client_id:client_secret)
    const headers = (tokenInit.headers ?? {}) as Record<string, string>;
    const expectedBasic = `Basic ${btoa(`${env.MANHEIM_CLIENT_ID}:${env.MANHEIM_CLIENT_SECRET}`)}`;
    expect(headers.Authorization).toBe(expectedBasic);
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

    // Body has only grant_type and scope. NO client_id, client_secret, username, password.
    const params = new URLSearchParams(String(tokenInit.body));
    expect(params.get("grant_type")).toBe("client_credentials");
    expect(params.get("scope")).toBe("wholesale-valuations.vehicle.mmr-ext.get");
    expect(params.has("client_id")).toBe(false);
    expect(params.has("client_secret")).toBe(false);
    expect(params.has("username")).toBe(false);
    expect(params.has("password")).toBe(false);
  });

  // ── 18b. client_credentials without MANHEIM_SCOPE omits scope param ─────────

  it("client_credentials with no MANHEIM_SCOPE omits scope from body", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(jsonResponse(VIN_BODY));

    const env: Env = { ...ENV, MANHEIM_GRANT_TYPE: "client_credentials" };
    const client = new ManheimHttpClient(env, kv, fetchFn);
    await flush(client.lookupByVin({ vin: "1HGCM82633A123456", mileage: 45_000, requestId: "req-cc-no-scope" }));

    const params = new URLSearchParams(String(initOfCall(fetchFn, 0).body));
    expect(params.get("grant_type")).toBe("client_credentials");
    expect(params.has("scope")).toBe(false);
  });

  // ── 18c. 400 invalid_scope surfaces error_code in log + ManheimAuthError ────

  it("400 invalid_scope surfaces error_code in refresh_failed log and ManheimAuthError", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ error: "invalid_scope", error_description: "bad scope" }), {
        status:  400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const env: Env = {
      ...ENV,
      MANHEIM_GRANT_TYPE: "client_credentials",
      MANHEIM_SCOPE:      "title-services.bad",
    };
    const client = new ManheimHttpClient(env, kv, fetchFn);
    const promise = client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "req-bad-scope",
    });

    await expect(flush(promise)).rejects.toBeInstanceOf(ManheimAuthError);

    const failed = logEvents().find((e) => e.event === "manheim.token.refresh_failed");
    expect(failed).toBeDefined();
    expect(failed?.error_category).toBe("auth");
    expect(failed?.error_code).toBe("invalid_scope");
  });

  // ── 19. password grant: body credentials, no Basic header (legacy) ──────────

  it("password grant (explicit) sends body credentials and no Basic header", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(jsonResponse(VIN_BODY));

    const env: Env = { ...ENV, MANHEIM_GRANT_TYPE: "password" };
    const client = new ManheimHttpClient(env, kv, fetchFn);
    await flush(client.lookupByVin({ vin: "1HGCM82633A123456", mileage: 45_000, requestId: "req-pw" }));

    const tokenInit = initOfCall(fetchFn, 0);
    const headers = (tokenInit.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();

    const params = new URLSearchParams(String(tokenInit.body));
    expect(params.get("grant_type")).toBe("password");
    expect(params.get("client_id")).toBe(env.MANHEIM_CLIENT_ID);
    expect(params.get("client_secret")).toBe(env.MANHEIM_CLIENT_SECRET);
    expect(params.get("username")).toBe(env.MANHEIM_USERNAME);
    expect(params.has("password")).toBe(true);
  });

  // ── 19b. password grant + scope: scope appended to body (vendor-agnostic) ───

  it("password grant with MANHEIM_SCOPE appends scope to body", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(jsonResponse(VIN_BODY));

    const env: Env = { ...ENV, MANHEIM_GRANT_TYPE: "password", MANHEIM_SCOPE: "extra.scope" };
    const client = new ManheimHttpClient(env, kv, fetchFn);
    await flush(client.lookupByVin({ vin: "1HGCM82633A123456", mileage: 45_000, requestId: "req-pw-scope" }));

    const params = new URLSearchParams(String(initOfCall(fetchFn, 0).body));
    expect(params.get("scope")).toBe("extra.scope");
  });

  // ── 20. No MANHEIM_GRANT_TYPE defaults to password grant ────────────────────

  it("undefined MANHEIM_GRANT_TYPE defaults to password grant", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(jsonResponse(VIN_BODY));

    // ENV fixture has no MANHEIM_GRANT_TYPE — exercises the default.
    const client = new ManheimHttpClient(ENV, kv, fetchFn);
    await flush(client.lookupByVin({ vin: "1HGCM82633A123456", mileage: 45_000, requestId: "req-default" }));

    const tokenInit = initOfCall(fetchFn, 0);
    const params = new URLSearchParams(String(tokenInit.body));
    expect(params.get("grant_type")).toBe("password");
    expect(params.get("username")).toBe(ENV.MANHEIM_USERNAME);

    // grant_type must appear in the refresh_started log for observability.
    expect(logEvents().some((e) =>
      e.event === "manheim.token.refresh_started" && e.grant_type === "password",
    )).toBe(true);
  });

  // ── 21. Cox vendor: VIN URL = ${MMR_URL}/vin/{vin} (MMR 1.4 path-segment) ───

  it("cox vendor: VIN URL is ${MMR_URL}/vin/{vin} (no query params)", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(jsonResponse(VIN_BODY));

    const env: Env = {
      ...ENV,
      MANHEIM_API_VENDOR: "cox",
      MANHEIM_GRANT_TYPE: "client_credentials",
      MANHEIM_SCOPE:      "wholesale-valuations.vehicle.mmr-ext.get",
      MANHEIM_MMR_URL:    "https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr",
    };
    const client = new ManheimHttpClient(env, kv, fetchFn);
    await flush(client.lookupByVin({ vin: "1HGCM82633A123456", mileage: 50_000, requestId: "cox-vin" }));

    const url = urlOfCall(fetchFn, 1);
    expect(url).toBe("https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr/vin/1HGCM82633A123456");
    // MMR 1.4 spec does not document a query string on /vin/{vin}.
    expect(url).not.toContain("?");
    expect(url).not.toContain("odometer");
    // No legacy Manheim path remnants and no early-pass /mmr?vin= shape.
    expect(url).not.toContain("/valuations/vin/");
    expect(url).not.toContain("/mmr?");
  });

  // ── 22. Cox vendor: YMMT URL = ${MMR_URL}/search/{year}/{make}/{model}/{body}

  it("cox vendor: YMMT URL is ${MMR_URL}/search/{year}/{make}/{model}/{bodyname}", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(jsonResponse(YMM_BODY));

    const env: Env = {
      ...ENV,
      MANHEIM_API_VENDOR: "cox",
      MANHEIM_GRANT_TYPE: "client_credentials",
      MANHEIM_SCOPE:      "wholesale-valuations.vehicle.mmr-ext.get",
      MANHEIM_MMR_URL:    "https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr",
    };
    const client = new ManheimHttpClient(env, kv, fetchFn);
    await flush(client.lookupByYmm({
      year: 2020, make: "Toyota", model: "Camry", trim: "SE", mileage: 60_000, requestId: "cox-ymm",
    }));

    const url = urlOfCall(fetchFn, 1);
    expect(url).toBe("https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr/search/2020/Toyota/Camry/SE");
    // MMR 1.4 spec does not document a query string on /search/...
    expect(url).not.toContain("?");
    expect(url).not.toContain("odometer");
    expect(url).not.toContain("include=ci");
    // No legacy Manheim path remnants and no early-pass /mmr-lookup shape.
    expect(url).not.toContain("/valuations/search/");
    expect(url).not.toContain("/mmr-lookup");
  });

  // ── 22a. Cox YMMT URL-encodes whitespace in trim ────────────────────────────

  it("cox vendor: YMMT URL-encodes whitespace in bodyname", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(jsonResponse(YMM_BODY));

    const env: Env = {
      ...ENV,
      MANHEIM_API_VENDOR: "cox",
      MANHEIM_GRANT_TYPE: "client_credentials",
      MANHEIM_SCOPE:      "wholesale-valuations.vehicle.mmr-ext.get",
      MANHEIM_MMR_URL:    "https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr",
    };
    const client = new ManheimHttpClient(env, kv, fetchFn);
    await flush(client.lookupByYmm({
      year: 2020, make: "Toyota", model: "Camry", trim: "SE Premium", mileage: 60_000, requestId: "cox-ymm-enc",
    }));

    const url = urlOfCall(fetchFn, 1);
    expect(url.endsWith("/SE%20Premium")).toBe(true);
  });

  // ── 22b. Cox YMM with no trim short-circuits to null envelope ───────────────

  it("cox vendor: YMM with missing trim returns null envelope and skips fetch", async () => {
    const { kv } = makeFakeKv();
    // No token POST or lookup expected; fetchFn must not be called.
    const fetchFn = vi.fn();

    const env: Env = {
      ...ENV,
      MANHEIM_API_VENDOR: "cox",
      MANHEIM_GRANT_TYPE: "client_credentials",
      MANHEIM_SCOPE:      "wholesale-valuations.vehicle.mmr-ext.get",
      MANHEIM_MMR_URL:    "https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr",
    };
    const client = new ManheimHttpClient(env, kv, fetchFn);

    const result = await flush(client.lookupByYmm({
      year: 2020, make: "Toyota", model: "Camry", mileage: 60_000, requestId: "cox-no-trim",
    })) as { mmr_value: number | null; payload: unknown; retryCount: number };

    expect(result.mmr_value).toBeNull();
    expect(result.retryCount).toBe(0);
    expect(result.payload).toEqual({});
    expect(fetchFn).not.toHaveBeenCalled();

    const skipped = logEvents().find((e) => e.event === "manheim.http.skipped");
    expect(skipped).toBeDefined();
    expect(skipped?.reason).toBe("cox_ymm_requires_trim");
  });

  // ── 22c. Cox YMM with whitespace-only trim is treated as missing ────────────

  it("cox vendor: YMM with whitespace-only trim short-circuits to null envelope", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();

    const env: Env = {
      ...ENV,
      MANHEIM_API_VENDOR: "cox",
      MANHEIM_GRANT_TYPE: "client_credentials",
      MANHEIM_SCOPE:      "wholesale-valuations.vehicle.mmr-ext.get",
      MANHEIM_MMR_URL:    "https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr",
    };
    const client = new ManheimHttpClient(env, kv, fetchFn);

    const result = await flush(client.lookupByYmm({
      year: 2020, make: "Toyota", model: "Camry", trim: "   ", mileage: 60_000, requestId: "cox-ws-trim",
    })) as { mmr_value: number | null; payload: unknown };

    expect(result.mmr_value).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();

    expect(logEvents().some((e) => e.event === "manheim.http.skipped")).toBe(true);
  });

  // ── 23. Cox vendor: lookup carries Cox media headers ────────────────────────

  it("cox vendor: lookup request includes Accept and Content-Type vendor media headers", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(jsonResponse(VIN_BODY));

    const env: Env = {
      ...ENV,
      MANHEIM_API_VENDOR: "cox",
      MANHEIM_GRANT_TYPE: "client_credentials",
      MANHEIM_SCOPE:      "wholesale-valuations.vehicle.mmr-ext.get",
      MANHEIM_MMR_URL:    "https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle/mmr",
    };
    const client = new ManheimHttpClient(env, kv, fetchFn);
    await flush(client.lookupByVin({ vin: "1HGCM82633A123456", mileage: 45_000, requestId: "cox-headers" }));

    const lookupInit = initOfCall(fetchFn, 1);
    const headers = (lookupInit.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer /);
    expect(headers.Accept).toBe("application/vnd.coxauto.v1+json");
    expect(headers["Content-Type"]).toBe("application/vnd.coxauto.v1+json");
  });

  // ── 24. Legacy vendor (default): no Cox media headers on lookup ─────────────

  it("legacy vendor: lookup request has no Cox media headers", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(jsonResponse(VIN_BODY));

    const client = new ManheimHttpClient(ENV, kv, fetchFn);
    await flush(client.lookupByVin({ vin: "1HGCM82633A123456", mileage: 45_000, requestId: "legacy-headers" }));

    const lookupInit = initOfCall(fetchFn, 1);
    const headers = (lookupInit.headers ?? {}) as Record<string, string>;
    expect(headers.Accept).toBeUndefined();
    expect(headers["Content-Type"]).toBeUndefined();
  });

  // ── 25. Logging redaction extension: no Basic header value, no b64 secret ───

  it("logs never contain the Basic header value or base64-encoded credentials", async () => {
    const { kv } = makeFakeKv();
    const fetchFn = vi.fn();
    fetchFn.mockResolvedValueOnce(jsonResponse(TOKEN_BODY));
    fetchFn.mockResolvedValueOnce(jsonResponse(VIN_BODY));

    const env: Env = {
      ...ENV,
      MANHEIM_GRANT_TYPE: "client_credentials",
      MANHEIM_SCOPE:      "wholesale-valuations.vehicle.mmr-ext.get",
    };
    const client = new ManheimHttpClient(env, kv, fetchFn);
    await flush(client.lookupByVin({
      vin: "1HGCM82633A123456",
      mileage: 45_000,
      requestId: "trace-basic",
    }));

    const allLogJson = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    const b64 = btoa(`${env.MANHEIM_CLIENT_ID}:${env.MANHEIM_CLIENT_SECRET}`);
    expect(allLogJson).not.toContain("Basic ");
    expect(allLogJson).not.toContain(b64);
    expect(allLogJson).not.toContain(CLIENT_SECRET);
    expect(allLogJson).not.toContain(PASSWORD);
  });
});
