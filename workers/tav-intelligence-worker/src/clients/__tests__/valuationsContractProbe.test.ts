import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../types/env";
import { ManheimAuthError, ManheimUnavailableError } from "../../errors";
import {
  buildProbePlan,
  classifyProbe,
  executeContractProbe,
  extractShape,
} from "../valuationsContractProbe";

const env: Env = {
  TAV_INTEL_KV: null as unknown as KVNamespace,
  MANAGER_EMAIL_ALLOWLIST: "",
  MANHEIM_CLIENT_ID: "client-id",
  MANHEIM_CLIENT_SECRET: "client-secret",
  MANHEIM_API_VENDOR: "cox",
  MANHEIM_GRANT_TYPE: "client_credentials",
  MANHEIM_SCOPE: "wholesale-valuations.vehicle.mmr-ext.get",
  MANHEIM_USERNAME: "",
  MANHEIM_PASSWORD: "",
  MANHEIM_TOKEN_URL: "https://authorize.coxautoinc.test/oauth2/as-id/v1/token",
  MANHEIM_MMR_URL: "https://api.coxautoinc.test/wholesale-valuations/vehicle/mmr",
  SUPABASE_URL: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  INTEL_SERVICE_SECRET: "",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("valuationsContractProbe", () => {
  it("classifies auth/provisioning and availability failures", () => {
    expect(classifyProbe(401, null).classified).toBe("not_provisioned");
    expect(classifyProbe(403, null).classified).toBe("not_provisioned");
    expect(classifyProbe(596, null).classified).toBe("not_provisioned");
    expect(classifyProbe(400, { error: "invalid_scope" })).toEqual({
      classified: "not_provisioned",
      errorCode: "invalid_scope",
    });
    expect(classifyProbe(404, null).classified).toBe("not_found");
    expect(classifyProbe(503, null).classified).toBe("unavailable");
    expect(classifyProbe(418, { error: "teapot" })).toEqual({
      classified: "bad_response",
      errorCode: "teapot",
    });
  });

  it("extracts only shape information and redacts values", () => {
    const shape = extractShape({
      items: [
        {
          year: 2023,
          make: "HONDA",
          adjustedPricing: { wholesale: { average: 424242 } },
        },
      ],
    });

    expect(shape).toEqual({
      topLevelKeys: ["items"],
      itemCount: 1,
      itemKeys: ["adjustedPricing", "make", "year"],
      looksLikeCatalog: true,
      hasPricingKeys: true,
    });
    expect(JSON.stringify(shape)).not.toContain("HONDA");
    expect(JSON.stringify(shape)).not.toContain("424242");
  });

  it("builds both legacy and Cox candidate endpoint families from the configured base", () => {
    const plan = buildProbePlan(env);

    expect(plan).toHaveLength(10);
    expect(plan.map((p) => `${p.family}:${p.endpoint}`)).toEqual([
      "legacy_valuations:years",
      "legacy_valuations:makes",
      "legacy_valuations:models",
      "legacy_valuations:trims",
      "legacy_valuations:valuation_search",
      "cox_storefront:years",
      "cox_storefront:makes",
      "cox_storefront:models",
      "cox_storefront:trims",
      "cox_storefront:valuation_search",
    ]);
    expect(plan.some((p) => p.url.includes("/mmr-lookup/years"))).toBe(true);
    expect(plan.some((p) => p.pathTemplate.includes("{mmr}/search"))).toBe(true);
    expect(
      plan.some((p) =>
        p.pathTemplate ===
        "/valuations/search/years/{year}/makes/{make}/models/{model}/trims/{trim}?odometer={odo}",
      ),
    ).toBe(true);
  });

  it("executes a token-ok probe without serializing token, secrets, or valuation figures", async () => {
    const fetchMock = vi.fn(async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      expect(init?.headers).toMatchObject({ Authorization: "Bearer tok-secret" });
      return jsonResponse({
        items: [
          {
            year: 2023,
            make: "HONDA",
            adjustedPricing: { wholesale: { average: 424242 } },
          },
        ],
      });
    });
    const fetchFn = fetchMock as unknown as typeof fetch;

    const report = await executeContractProbe({
      env,
      fetchFn,
      requestId: "req-probe",
      getToken: async () => ({ token: "tok-secret" }),
    });

    expect(report.tokenObtained).toBe(true);
    expect(report.tokenClassified).toBe("ok");
    expect(report.probes).toHaveLength(10);
    expect(report.probes.every((p) => p.classified === "ok")).toBe(true);
    expect(report.recommendation).toContain("implement_vendor_adapters");

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("tok-secret");
    expect(serialized).not.toContain("client-secret");
    expect(serialized).not.toContain("HONDA");
    expect(serialized).not.toContain("424242");
    expect(serialized).toContain("topLevelKeys");
    expect(serialized).toContain("itemKeys");
  });

  it("maps token auth errors to not_provisioned without probing vendor URLs", async () => {
    const fetchFn = vi.fn();

    const report = await executeContractProbe({
      env,
      fetchFn,
      requestId: "req-auth",
      getToken: async () => ({
        token: null,
        error: new ManheimAuthError("bad scope", {
          status: 400,
          error_code: "invalid_scope",
        }),
      }),
    });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      tokenObtained: false,
      tokenClassified: "not_provisioned",
      tokenErrorCode: "invalid_scope",
      probes: [],
    });
    expect(report.recommendation).toContain("blocked_not_provisioned");
  });

  it("maps token infrastructure errors to unavailable without probing vendor URLs", async () => {
    const fetchFn = vi.fn();

    const report = await executeContractProbe({
      env,
      fetchFn,
      requestId: "req-upstream",
      getToken: async () => ({
        token: null,
        error: new ManheimUnavailableError("token endpoint 5xx"),
      }),
    });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      tokenObtained: false,
      tokenClassified: "unavailable",
      probes: [],
    });
    expect(report.recommendation).toContain("inconclusive_unavailable");
  });
});
