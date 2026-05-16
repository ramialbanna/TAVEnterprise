import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ORIGINAL_ENV = process.env;

const VALID_ENV = {
  APP_API_BASE_URL: "https://tav-aip-staging.rami-1a9.workers.dev",
  APP_API_SECRET: "staging-secret",
  AUTH_SECRET: "auth-secret",
  AUTH_GOOGLE_ID: "google-id",
  AUTH_GOOGLE_SECRET: "google-secret",
  ALLOWED_EMAIL_DOMAIN: "texasautovalue.com",
};

const systemStatusEnvelope = {
  ok: true,
  data: {
    service: "tav-enterprise",
    version: "test",
    timestamp: "2026-05-16T00:00:00.000Z",
    db: { ok: true },
    intelWorker: { mode: "worker", binding: true, url: null },
    sources: [],
    staleSweep: { lastRunAt: null, missingReason: "never_run" },
  },
};

describe("app-api server transport", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV, ...VALID_ENV };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = ORIGINAL_ENV;
  });

  it("injects the server-side bearer when fetching the Worker", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(systemStatusEnvelope), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getSystemStatus } = await import("./server");
    const result = await getSystemStatus();

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://tav-aip-staging.rami-1a9.workers.dev/app/system-status",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          authorization: "Bearer staging-secret",
          accept: "application/json",
        }),
        cache: "no-store",
      }),
    );
  });

  it("returns a proxy error result when the server env is invalid", async () => {
    delete process.env.APP_API_SECRET;
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { getSystemStatus } = await import("./server");
    const result = await getSystemStatus();

    expect(result).toMatchObject({
      ok: false,
      kind: "proxy",
      error: "proxy_misconfigured",
      status: 500,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns an unavailable result when the Worker fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { getSystemStatus } = await import("./server");
    const result = await getSystemStatus();

    expect(result).toMatchObject({
      ok: false,
      kind: "unavailable",
      error: "upstream_unavailable",
      status: 503,
    });
  });
});
