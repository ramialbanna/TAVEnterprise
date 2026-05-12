import { describe, expect, it } from "vitest";

import {
  HistoricalSaleListSchema,
  ImportBatchListSchema,
  KpisSchema,
  MmrVinOkSchema,
  MmrVinUnavailableSchema,
  SystemStatusSchema,
} from "@/lib/app-api/schemas";

/**
 * Manual contract test against the real **staging** Worker `/app/*` API.
 *
 * Not collected by `pnpm test` (excluded in `vitest.config.ts`) and not run in `web-ci`.
 * Invoke with `pnpm test:contract` after exporting `APP_API_BASE_URL` + `APP_API_SECRET`
 * (BOTH are required). The whole suite `skip()`s unless both are present, so an accidental
 * run — or one with only one of the two set — is a clean no-op.
 *
 * `APP_API_BASE_URL` is ORIGIN ONLY (no `/app`) — the test appends `/app/<path>` itself,
 * mirroring `lib/app-api/server.ts`.
 */
const BASE_URL = (process.env.APP_API_BASE_URL ?? "").replace(/\/+$/, "");
const SECRET = process.env.APP_API_SECRET ?? "";
const HAS_CONTRACT_ENV = Boolean(BASE_URL && SECRET);

type FetchInit = { method?: string; headers?: Record<string, string>; body?: string };

function appFetch(path: string, init: FetchInit = {}): Promise<Response> {
  return fetch(`${BASE_URL}/app/${path}`, {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${SECRET}`,
      accept: "application/json",
      ...(init.headers ?? {}),
    },
    body: init.body,
  });
}

async function readEnvelope(res: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

describe.skipIf(!HAS_CONTRACT_ENV)("/app/* contract — staging Worker", () => {
  it("GET /app/system-status → 200 envelope, data matches SystemStatusSchema", async () => {
    const { status, body } = await readEnvelope(await appFetch("system-status"));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    SystemStatusSchema.parse(body.data);
  });

  it("GET /app/kpis → 200 + KpisSchema, or 503 db_error", async () => {
    const { status, body } = await readEnvelope(await appFetch("kpis"));
    if (status === 200) {
      expect(body.ok).toBe(true);
      KpisSchema.parse(body.data);
    } else {
      expect(status).toBe(503);
      expect(body).toMatchObject({ ok: false, error: "db_error" });
    }
  });

  it("GET /app/import-batches?limit=2 → 200, data matches ImportBatchListSchema", async () => {
    const { status, body } = await readEnvelope(await appFetch("import-batches?limit=2"));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const rows = ImportBatchListSchema.parse(body.data);
    expect(rows.length).toBeLessThanOrEqual(2);
  });

  it("GET /app/historical-sales?limit=2 → 200, data matches HistoricalSaleListSchema", async () => {
    const { status, body } = await readEnvelope(await appFetch("historical-sales?limit=2"));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const rows = HistoricalSaleListSchema.parse(body.data);
    expect(rows.length).toBeLessThanOrEqual(2);
  });

  it("POST /app/mmr/vin → 200, data matches MmrVinOkSchema | MmrVinUnavailableSchema", async () => {
    const { status, body } = await readEnvelope(
      await appFetch("mmr/vin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vin: "1FT8W3BT1SEC27066", mileage: 50_000 }),
      }),
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const ok = MmrVinOkSchema.safeParse(body.data);
    const unavailable = MmrVinUnavailableSchema.safeParse(body.data);
    expect(ok.success || unavailable.success).toBe(true);

    if (ok.success) {
      // Don't assert the exact MMR number — sandbox-backed, it moves. Assert shape + enums.
      expect(["high", "medium", "low"]).toContain(ok.data.confidence);
      if (ok.data.method !== null) {
        expect(["vin", "year_make_model"]).toContain(ok.data.method);
      }
    }
  });

  it("POST /app/mmr/vin with a bad VIN → 400 invalid_body + issues", async () => {
    const { status, body } = await readEnvelope(
      await appFetch("mmr/vin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vin: "x" }),
      }),
    );
    expect(status).toBe(400);
    expect(body).toMatchObject({ ok: false, error: "invalid_body" });
    expect(Array.isArray(body.issues)).toBe(true);
  });
});
