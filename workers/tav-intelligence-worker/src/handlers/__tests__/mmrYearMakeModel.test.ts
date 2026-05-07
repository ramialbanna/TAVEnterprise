import { describe, it, expect } from "vitest";
import { handleMmrYearMakeModel } from "../mmrYearMakeModel";
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

function buildArgs(opts: { body?: string; authed?: boolean }): HandlerArgs {
  return {
    request: new Request("https://example.test/mmr/year-make-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: opts.body,
    }),
    env,
    requestId: "req-2",
    userContext: opts.authed
      ? { userId: "rami@texasautovalue.com", email: "rami@texasautovalue.com", name: null, roles: [] }
      : { userId: null, email: null, name: null, roles: [] },
  };
}

describe("handleMmrYearMakeModel", () => {
  it("throws AuthError when no Cloudflare Access identity present", async () => {
    const args = buildArgs({
      authed: false,
      body: JSON.stringify({ year: 2020, make: "Toyota", model: "Camry" }),
    });
    await expect(handleMmrYearMakeModel(args)).rejects.toBeInstanceOf(AuthError);
  });

  it("throws ValidationError on malformed JSON", async () => {
    const args = buildArgs({ authed: true, body: "{not-json" });
    await expect(handleMmrYearMakeModel(args)).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when the body fails schema validation", async () => {
    const args = buildArgs({ authed: true, body: JSON.stringify({ year: 1800, make: "x", model: "y" }) });
    await expect(handleMmrYearMakeModel(args)).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns scaffold envelope on a valid request", async () => {
    const args = buildArgs({
      authed: true,
      body: JSON.stringify({
        year: 2020, make: "Toyota", model: "Camry", trim: "SE", mileage: 50_000,
      }),
    });
    const res = await handleMmrYearMakeModel(args);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{ error_code: string }>;
    expect(body.requestId).toBe("req-2");
    expect(typeof body.timestamp).toBe("string");
    expect(body.data?.error_code).toBe("not_implemented");
  });
});
