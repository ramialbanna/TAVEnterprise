import { describe, expect, it } from "vitest";

import { getKpis, getSystemStatus, listHistoricalSales, postMmrVin } from "@/lib/app-api";
import { server } from "./server";
import { handlers } from "./handlers";
import { PREVIEW_VIN, systemStatusDbDown } from "./fixtures";
import { http, HttpResponse } from "msw";

/**
 * Smoke test for the MSW <-> typed-client <-> parser path. Proves the test infra
 * intercepts same-origin `/api/app/*` and that `server.use(...)` overrides work.
 */
describe("MSW /api/app/* interception", () => {
  it("system-status → ok", async () => {
    const r = await getSystemStatus();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.db).toEqual({ ok: true });
  });

  it("kpis → ok with the fixture payload", async () => {
    const r = await getKpis();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.leads.value?.total).toBe(7);
  });

  it("historical-sales respects the ?make= filter", async () => {
    const r = await listHistoricalSales({ make: "Ford" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.length).toBeGreaterThan(0);
      expect(r.data.every((row) => row.make === "Ford")).toBe(true);
    }
  });

  it("mmr/vin → ok for the preview VIN, invalid for a short VIN", async () => {
    const ok = await postMmrVin({ vin: PREVIEW_VIN, mileage: 50000 });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.mmrValue).toBe(68600);

    const bad = await postMmrVin({ vin: "x" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe("invalid_body");
  });

  it("server.use(...) overrides a single endpoint", async () => {
    server.use(http.get("/api/app/system-status", () => HttpResponse.json({ ok: true, data: systemStatusDbDown })));
    const r = await getSystemStatus();
    expect(r.ok).toBe(true);
    if (r.ok) expect("missingReason" in r.data.db && r.data.db.missingReason).toBe("db_error");
  });

  it("default handlers are restored after reset", async () => {
    // afterEach in test/setup.ts called resetHandlers(); the default should be back.
    expect(handlers.length).toBeGreaterThan(0);
    const r = await getSystemStatus();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.db).toEqual({ ok: true });
  });
});
