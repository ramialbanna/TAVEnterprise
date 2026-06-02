import { describe, expect, it } from "vitest";

import { dispatchMaxbuy } from "../workers/maxbuy-worker/src/routes";

function maxbuyEnv(over: Partial<Record<string, string>> = {}) {
  return {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    INTEL_WORKER_URL: "",
    INTEL_WORKER_SECRET: "intel-secret",
    MAXBUY_SERVICE_SECRET: "maxbuy-secret",
    MAXBUY_EVALUATE_ENABLED: "true",
    ...over,
  };
}

describe("maxbuy-worker routes", () => {
  it("returns 401 without service secret", async () => {
    const res = await dispatchMaxbuy(
      new Request("https://example.com/maxbuy/evaluate", { method: "POST", body: "{}" }),
      maxbuyEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 when evaluate disabled", async () => {
    const res = await dispatchMaxbuy(
      new Request("https://example.com/maxbuy/evaluate", {
        method: "POST",
        headers: {
          "x-tav-service-secret": "maxbuy-secret",
          "x-tav-user-id": "user-1",
        },
        body: JSON.stringify({
          contract_version: "1.0.0",
          vin: "1FTFW1ET5DFA12345",
        }),
      }),
      maxbuyEnv({ MAXBUY_EVALUATE_ENABLED: "false" }),
    );
    expect(res.status).toBe(503);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("maxbuy_disabled");
  });

  it("health check is open", async () => {
    const res = await dispatchMaxbuy(
      new Request("https://example.com/health"),
      maxbuyEnv(),
    );
    expect(res.status).toBe(200);
  });
});
