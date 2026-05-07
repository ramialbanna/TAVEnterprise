import { describe, it, expect } from "vitest";
import { handleKpisSummary } from "../kpisSummary";
import { AuthError } from "../../errors";
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
};

function buildArgs(authed: boolean): HandlerArgs {
  return {
    request: new Request("https://example.test/kpis/summary", { method: "GET" }),
    env,
    requestId: "req-kpi",
    userContext: authed
      ? { userId: "rami@texasautovalue.com", email: "rami@texasautovalue.com", name: null, roles: [] }
      : { userId: null, email: null, name: null, roles: [] },
  };
}

describe("handleKpisSummary", () => {
  it("throws AuthError without Cloudflare Access identity", async () => {
    await expect(handleKpisSummary(buildArgs(false))).rejects.toBeInstanceOf(AuthError);
  });

  it("returns the not_implemented stub when authenticated", async () => {
    const res = await handleKpisSummary(buildArgs(true));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{
      best_buyer: null; best_unit: null; best_week: null; note: string;
    }>;
    expect(body.requestId).toBe("req-kpi");
    expect(typeof body.timestamp).toBe("string");
    expect(body.data).toEqual({
      best_buyer: null,
      best_unit:  null,
      best_week:  null,
      note:       "not_implemented",
    });
  });
});
