import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types/env";

const ADMIN = "admin-secret";
const INTEL = "intel-secret";

function envWith(fetchMock?: ReturnType<typeof vi.fn>): Env {
  return {
    ADMIN_API_SECRET: ADMIN,
    INTEL_WORKER_SECRET: INTEL,
    INTEL_WORKER_URL: "",
    INTEL_WORKER: fetchMock
      ? ({ fetch: fetchMock } as unknown as Fetcher)
      : undefined,
  } as unknown as Env;
}

const ctx = {
  waitUntil: (_p: Promise<unknown>) => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

describe("admin valuations contract probe proxy", () => {
  it("requires admin auth before proxying", async () => {
    const fetchMock = vi.fn();
    const res = await worker.fetch(
      new Request("https://example.test/admin/valuations/contract-probe"),
      envWith(fetchMock),
      ctx,
    );

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies to the intelligence worker via service binding without exposing secrets", async () => {
    const report = {
      success: true,
      data: {
        tokenObtained: false,
        tokenClassified: "not_provisioned",
        probes: [],
        recommendation: "blocked_not_provisioned",
      },
      requestId: "req-test",
      timestamp: "2026-05-17T00:00:00.000Z",
    };
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(_url)).toBe(
        "https://tav-intelligence-worker.internal/admin/valuations/contract-probe",
      );
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({
        Accept: "application/json",
        "x-tav-service-secret": INTEL,
      });
      return new Response(JSON.stringify(report), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const res = await worker.fetch(
      new Request("https://example.test/admin/valuations/contract-probe", {
        headers: { Authorization: `Bearer ${ADMIN}` },
      }),
      envWith(fetchMock),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const bodyText = await res.text();
    expect(bodyText).toContain("blocked_not_provisioned");
    expect(bodyText).not.toContain(ADMIN);
    expect(bodyText).not.toContain(INTEL);
  });

  it("returns a bounded error when the intelligence worker is not configured", async () => {
    const res = await worker.fetch(
      new Request("https://example.test/admin/valuations/contract-probe", {
        headers: { Authorization: `Bearer ${ADMIN}` },
      }),
      envWith(),
      ctx,
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: "intel_worker_not_configured",
    });
  });
});
