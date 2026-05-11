import { describe, it, expect } from "vitest";
import { handleHealth } from "../health";
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
  SUPABASE_URL:          "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  INTEL_SERVICE_SECRET: "",
};

function makeArgs(): HandlerArgs {
  return {
    request: new Request("https://example.test/health", { method: "GET" }),
    env,
    requestId: "req-1",
    userContext: { userId: null, email: null, name: null, roles: [] },
  };
}

describe("handleHealth", () => {
  it("returns 200 with the standard envelope", async () => {
    const res = await handleHealth(makeArgs());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    const body = (await res.json()) as ApiResponse<{
      status: string;
      worker: string;
      version: string;
    }>;
    expect(body.success).toBe(true);
    expect(body.requestId).toBe("req-1");
    expect(typeof body.timestamp).toBe("string");
    expect(body.data).toEqual({
      status:  "ok",
      worker:  "tav-intelligence-worker",
      version: "0.1.0",
    });
  });
});
