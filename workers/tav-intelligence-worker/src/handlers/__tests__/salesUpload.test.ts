import { describe, it, expect } from "vitest";
import { handleSalesUpload } from "../salesUpload";
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
    request: new Request("https://example.test/sales/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: opts.body,
    }),
    env,
    requestId: "req-s",
    userContext: opts.authed
      ? { userId: "rami@texasautovalue.com", email: "rami@texasautovalue.com", name: null, roles: [] }
      : { userId: null, email: null, name: null, roles: [] },
  };
}

const validBatch = JSON.stringify({
  file_name:   "sales_2026_w19.csv",
  uploaded_at: "2026-05-07T12:00:00.000Z",
  rows: [
    {
      year: 2020, make: "Toyota", model: "Camry",
      sale_date: "2026-05-01", sale_price: 18_500,
    },
  ],
});

describe("handleSalesUpload", () => {
  it("throws AuthError without Cloudflare Access identity", async () => {
    const args = buildArgs({ authed: false, body: validBatch });
    await expect(handleSalesUpload(args)).rejects.toBeInstanceOf(AuthError);
  });

  it("throws ValidationError on malformed JSON", async () => {
    const args = buildArgs({ authed: true, body: "{not-json" });
    await expect(handleSalesUpload(args)).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when the batch fails schema validation", async () => {
    const args = buildArgs({
      authed: true,
      body: JSON.stringify({ file_name: "x.csv", uploaded_at: "not-a-date", rows: [] }),
    });
    await expect(handleSalesUpload(args)).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns the not_implemented stub on a valid batch", async () => {
    const args = buildArgs({ authed: true, body: validBatch });
    const res = await handleSalesUpload(args);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<{
      ok: boolean; batch_id: string | null; accepted: number; rejected: number; status: string;
    }>;
    expect(body.requestId).toBe("req-s");
    expect(typeof body.timestamp).toBe("string");
    expect(body.data).toEqual({
      ok:       false,
      batch_id: null,
      accepted: 0,
      rejected: 0,
      status:   "not_implemented",
    });
  });
});
