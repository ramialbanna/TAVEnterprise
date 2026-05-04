import { describe, it, expect } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types/env";

// Minimal stubs — health endpoint uses neither env nor ctx.
const env = {} as unknown as Env;
const ctx = {
  waitUntil: (_promise: Promise<unknown>) => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

describe("GET /health", () => {
  it("returns 200 with correct shape", async () => {
    const req = new Request("http://localhost/health");
    const res = await worker.fetch(req, env, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");

    const body = (await res.json()) as {
      ok: boolean;
      service: string;
      version: string;
      timestamp: string;
    };

    expect(body.ok).toBe(true);
    expect(body.service).toBe("tav-enterprise");
    expect(body.version).toBe("0.1.0");
    expect(typeof body.timestamp).toBe("string");
    expect(() => new Date(body.timestamp)).not.toThrow();
  });

  it("returns 404 for an unknown path", async () => {
    const req = new Request("http://localhost/unknown");
    const res = await worker.fetch(req, env, ctx);

    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("not_found");
  });

  it("returns 404 for POST /health", async () => {
    const req = new Request("http://localhost/health", { method: "POST" });
    const res = await worker.fetch(req, env, ctx);

    expect(res.status).toBe(404);
  });
});
