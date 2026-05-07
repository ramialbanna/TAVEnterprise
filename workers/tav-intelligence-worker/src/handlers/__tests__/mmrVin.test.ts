import { describe, it, expect } from "vitest";
import { handleMmrVin } from "../mmrVin";
import { AuthError, ValidationError } from "../../errors";
import type { HandlerArgs } from "../types";
import type { Env } from "../../types/env";
import type { ApiResponse } from "../../types/api";

const env: Env = {
  TAV_INTEL_KV: null as unknown as KVNamespace,
  MANAGER_EMAIL_ALLOWLIST: "",
  MANHEIM_CLIENT_ID:     "",
  MANHEIM_CLIENT_SECRET: "",
  MANHEIM_USERNAME:      "",
  MANHEIM_PASSWORD:      "",
  MANHEIM_TOKEN_URL:     "",
  MANHEIM_MMR_URL:       "",
};

function buildArgs(opts: {
  body?: string;
  authed?: boolean;
}): HandlerArgs {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  return {
    request: new Request("https://example.test/mmr/vin", {
      method: "POST",
      headers,
      body: opts.body,
    }),
    env,
    requestId: "req-1",
    userContext: opts.authed
      ? { userId: "rami@texasautovalue.com", email: "rami@texasautovalue.com", name: null, roles: [] }
      : { userId: null, email: null, name: null, roles: [] },
  };
}

describe("handleMmrVin", () => {
  it("throws AuthError when no Cloudflare Access identity present", async () => {
    const args = buildArgs({
      authed: false,
      body: JSON.stringify({ vin: "1HGCM82633A123456" }),
    });
    await expect(handleMmrVin(args)).rejects.toBeInstanceOf(AuthError);
  });

  it("throws ValidationError on malformed JSON body", async () => {
    const args = buildArgs({ authed: true, body: "{not-json" });
    await expect(handleMmrVin(args)).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when the body fails schema validation", async () => {
    const args = buildArgs({ authed: true, body: JSON.stringify({ vin: "tooshort" }) });
    await expect(handleMmrVin(args)).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns scaffold envelope on a valid request", async () => {
    const args = buildArgs({
      authed: true,
      body: JSON.stringify({ vin: "1HGCM82633A123456", mileage: 50000 }),
    });
    const res = await handleMmrVin(args);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ error_code: string; ok: boolean }>;
    expect(body.success).toBe(true);
    expect(body.requestId).toBe("req-1");
    expect(typeof body.timestamp).toBe("string");
    expect(body.data?.error_code).toBe("not_implemented");
    expect(body.data?.ok).toBe(false);
  });
});
