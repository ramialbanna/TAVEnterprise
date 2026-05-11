import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// route.ts -> @/lib/env -> "server-only" (throws outside the RSC bundler). Stub it.
vi.mock("server-only", () => ({}));

const ORIGINAL_ENV = process.env;
const BASE = "https://tav-aip-staging.rami-1a9.workers.dev";

type FetchImpl = (url: string | URL, init?: RequestInit) => Promise<Response>;

/** Install a typed `fetch` stub that always returns `respond()`, and return the mock. */
function stubFetch(respond: () => Response) {
  const mock = vi.fn<FetchImpl>(async () => respond());
  vi.stubGlobal("fetch", mock);
  return mock;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function ctxFor(...segments: string[]) {
  return { params: Promise.resolve({ path: segments }) };
}

beforeEach(() => {
  vi.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    APP_API_BASE_URL: BASE,
    APP_API_SECRET: "test-secret",
    AUTH_SECRET: "x",
    AUTH_GOOGLE_ID: "x",
    AUTH_GOOGLE_SECRET: "x",
    ALLOWED_EMAIL_DOMAIN: "texasautovalue.com",
  };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  vi.unstubAllGlobals();
});

describe("/api/app/[...path] proxy", () => {
  it("forwards GET to the Worker /app/* with the server Bearer, preserving path + query", async () => {
    const fetchMock = stubFetch(() => jsonResponse({ ok: true, data: { totalOutcomes: 3 } }));
    const { GET } = await import("./route");

    const req = new NextRequest("http://localhost:3000/api/app/kpis?limit=5", {
      headers: { cookie: "authjs.session-token=secret-cookie", authorization: "Bearer client-token" },
    });
    const res = await GET(req, ctxFor("kpis"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { totalOutcomes: 3 } });
    expect(res.headers.get("content-type")).toContain("application/json");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe(`${BASE}/app/kpis?limit=5`);
    const headers = new Headers(call[1]!.headers);
    expect(headers.get("authorization")).toBe("Bearer test-secret");
    expect(headers.get("authorization")).not.toContain("client-token"); // browser token not leaked
    expect(headers.get("cookie")).toBeNull(); // browser cookie not forwarded
  });

  it("forwards a POST body and method verbatim", async () => {
    const fetchMock = stubFetch(() =>
      jsonResponse({ ok: true, data: { mmrValue: 68600, confidence: "high", method: "vin" } }),
    );
    const { POST } = await import("./route");

    const bodyStr = JSON.stringify({ vin: "1FT8W3BT1SEC27066", mileage: 50000 });
    const req = new NextRequest("http://localhost:3000/api/app/mmr/vin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: bodyStr,
    });
    const res = await POST(req, ctxFor("mmr", "vin"));

    expect(res.status).toBe(200);
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe(`${BASE}/app/mmr/vin`);
    expect(call[1]!.method).toBe("POST");
    expect(call[1]!.body).toBe(bodyStr);
    expect(new Headers(call[1]!.headers).get("content-type")).toBe("application/json");
  });

  it("returns the upstream status + JSON body verbatim (e.g. a 503 db_error from the Worker)", async () => {
    stubFetch(() => jsonResponse({ ok: false, error: "db_error" }, 503));
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost:3000/api/app/kpis"), ctxFor("kpis"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "db_error" });
  });

  it("returns { ok:false, error:'upstream_unavailable' } with 503 when the fetch throws", async () => {
    const mock = vi.fn<FetchImpl>(async () => {
      throw new TypeError("network down");
    });
    vi.stubGlobal("fetch", mock);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost:3000/api/app/kpis"), ctxFor("kpis"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "upstream_unavailable" });
  });

  it("returns { ok:false, error:'upstream_non_json' } when the Worker responds with non-JSON", async () => {
    stubFetch(() => new Response("<html>Cloudflare error 1101</html>", { status: 520, headers: { "content-type": "text/html" } }));
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost:3000/api/app/kpis"), ctxFor("kpis"));
    expect(res.status).toBe(520);
    expect(await res.json()).toEqual({ ok: false, error: "upstream_non_json" });
  });

  it("returns { ok:false, error:'proxy_misconfigured' } with 500 (no upstream call) when server env is invalid", async () => {
    delete process.env.APP_API_SECRET;
    const fetchMock = vi.fn<FetchImpl>();
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost:3000/api/app/kpis"), ctxFor("kpis"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "proxy_misconfigured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
