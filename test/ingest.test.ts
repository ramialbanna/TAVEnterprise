import { describe, it, expect } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types/env";

const SECRET = "test-ingest-secret";

const env = { WEBHOOK_HMAC_SECRET: SECRET } as unknown as Env;
const ctx = {
  waitUntil: (_p: Promise<unknown>) => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

async function sign(body: string, secret: string): Promise<string> {
  const encoded = new TextEncoder().encode(body);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoded);
  const hex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

function makeRequest(body: string, signature: string, extraHeaders?: Record<string, string>): Request {
  return new Request("http://localhost/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tav-signature": signature,
      ...extraHeaders,
    },
    body,
  });
}

const VALID_PAYLOAD = JSON.stringify({
  source: "facebook",
  run_id: "run-001",
  region: "dallas_tx",
  scraped_at: new Date().toISOString(),
  items: [{ title: "2020 Toyota Camry SE, 62k miles, $18,500" }],
});

describe("POST /ingest", () => {
  it("returns 200 with structured summary for a valid request", async () => {
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), env, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");

    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.source).toBe("facebook");
    expect(body.run_id).toBe("run-001");
    expect(body.processed).toBe(0);
    expect(body.rejected).toBe(0);
    expect(body.created_leads).toBe(0);
  });

  it("returns 401 for a missing x-tav-signature header", async () => {
    const req = new Request("http://localhost/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: VALID_PAYLOAD,
    });
    const res = await worker.fetch(req, env, ctx);

    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 for a wrong signature", async () => {
    const res = await worker.fetch(
      makeRequest(VALID_PAYLOAD, "sha256=badc0ffee"),
      env,
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for a valid signature computed over a different secret", async () => {
    const sig = await sign(VALID_PAYLOAD, "wrong-secret");
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), env, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    const body = "not-json{{{";
    const sig = await sign(body, SECRET);
    const req = new Request("http://localhost/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tav-signature": sig },
      body,
    });
    const res = await worker.fetch(req, env, ctx);

    expect(res.status).toBe(400);
    const json = await res.json() as Record<string, unknown>;
    expect(json.error).toBe("invalid_json");
  });

  it("returns 400 when source is missing", async () => {
    const payload = JSON.stringify({
      run_id: "run-001",
      region: "dallas_tx",
      scraped_at: new Date().toISOString(),
      items: [{ title: "test" }],
    });
    const sig = await sign(payload, SECRET);
    const res = await worker.fetch(makeRequest(payload, sig), env, ctx);

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("invalid_payload");
  });

  it("returns 400 for an empty items array", async () => {
    const payload = JSON.stringify({
      source: "facebook",
      run_id: "run-001",
      region: "dallas_tx",
      scraped_at: new Date().toISOString(),
      items: [],
    });
    const sig = await sign(payload, SECRET);
    const res = await worker.fetch(makeRequest(payload, sig), env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 413 when Content-Length header exceeds 2MB", async () => {
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(
      makeRequest(VALID_PAYLOAD, sig, { "content-length": String(3 * 1024 * 1024) }),
      env,
      ctx,
    );

    expect(res.status).toBe(413);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("payload_too_large");
  });

  it("returns 404 for GET /ingest", async () => {
    const res = await worker.fetch(new Request("http://localhost/ingest"), env, ctx);
    expect(res.status).toBe(404);
  });

  it("existing GET /health still returns 200", async () => {
    const res = await worker.fetch(new Request("http://localhost/health"), env, ctx);
    expect(res.status).toBe(200);
  });
});
