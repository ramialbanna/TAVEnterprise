import { describe, it, expect } from "vitest";
import { handleActivityVin } from "../activityVin";
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
  vin?: string;
  authed?: boolean;
}): HandlerArgs {
  const args: HandlerArgs = {
    request: new Request("https://example.test/activity/vin/X", { method: "GET" }),
    env,
    requestId: "req-a",
    userContext: opts.authed
      ? { userId: "rami@texasautovalue.com", email: "rami@texasautovalue.com", name: null, roles: [] }
      : { userId: null, email: null, name: null, roles: [] },
  };
  if (opts.vin !== undefined) args.pathParams = { vin: opts.vin };
  return args;
}

describe("handleActivityVin", () => {
  it("throws AuthError without Cloudflare Access identity", async () => {
    const args = buildArgs({ authed: false, vin: "1HGCM82633A123456" });
    await expect(handleActivityVin(args)).rejects.toBeInstanceOf(AuthError);
  });

  it("throws ValidationError when vin is missing", async () => {
    const args = buildArgs({ authed: true });
    await expect(handleActivityVin(args)).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when vin is too short", async () => {
    const args = buildArgs({ authed: true, vin: "SHORT" });
    await expect(handleActivityVin(args)).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when vin is too long", async () => {
    const args = buildArgs({ authed: true, vin: "A".repeat(20) });
    await expect(handleActivityVin(args)).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns the not_implemented stub on a valid VIN, uppercased", async () => {
    const args = buildArgs({ authed: true, vin: "1hgcm82633a123456" });
    const res = await handleActivityVin(args);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{
      vin: string; recent_activity: unknown[]; note: string;
    }>;
    expect(body.requestId).toBe("req-a");
    expect(typeof body.timestamp).toBe("string");
    expect(body.data).toEqual({
      vin: "1HGCM82633A123456",
      recent_activity: [],
      note: "not_implemented",
    });
  });
});
