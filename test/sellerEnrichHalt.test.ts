import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types/env";

function env(overrides: Partial<Env> = {}): Env {
  return {
    HALT_ALERT_SECRET: "halt-secret",
    HALT_ALERT_SMS_TO: "+15163441449",
    TWILIO_ACCOUNT_SID: "ACtest",
    TWILIO_AUTH_TOKEN: "auth-token",
    TWILIO_FROM_NUMBER: "+12125551000",
    ALERT_TO_NUMBER: "+12125559999",
    ...overrides,
  } as Env;
}

function post(secret: string | null, body?: unknown): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (secret) headers.set("Authorization", `Bearer ${secret}`);
  return new Request("https://worker.test/internal/seller-enrich-halt", {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /internal/seller-enrich-halt", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects a missing token", async () => {
    const res = await worker.fetch(post(null), env(), {} as ExecutionContext);
    expect(res.status).toBe(401);
  });

  it("texts the halt number, not the deal-alert number", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const res = await worker.fetch(post("halt-secret", { reason: "checkpoint" }), env(), {} as ExecutionContext);
    expect(res.status).toBe(200);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sent = new URLSearchParams(String(init.body));
    expect(sent.get("To")).toBe("+15163441449");
    expect(sent.get("To")).not.toBe("+12125559999");
    expect(sent.get("Body")).toContain("Facebook locked the lookup account");
  });

  it("stays closed until the secret is configured", async () => {
    const res = await worker.fetch(
      post("halt-secret"),
      env({ HALT_ALERT_SECRET: "replace_me" }),
      {} as ExecutionContext,
    );
    expect(res.status).toBe(503);
  });
});
