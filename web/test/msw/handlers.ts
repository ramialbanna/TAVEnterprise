import { http, HttpResponse } from "msw";

import {
  historicalSales,
  importBatches,
  ingestRuns,
  ingestRunDetail,
  opportunities,
  opportunityDetail,
  kpisFull,
  mmrVinOk,
  mmrVinUnavailable,
  PREVIEW_VIN,
  systemStatusHealthy,
} from "./fixtures";

/** The success envelope the `/api/app/*` Next proxy returns. */
function ok<T>(data: T) {
  return HttpResponse.json({ ok: true, data });
}

/** A Worker-style error envelope. */
function err(status: number, error: string, extra: Record<string, unknown> = {}) {
  return HttpResponse.json({ ok: false, error, ...extra }, { status });
}

/**
 * Default handlers for the same-origin `/api/app/*` routes. Individual tests can
 * `server.use(...)` to override a single endpoint (e.g. a db_error variant) for a case.
 */
export const handlers = [
  http.get("/api/app/system-status", () => ok(systemStatusHealthy)),

  http.get("/api/app/kpis", () => ok(kpisFull)),

  http.get("/api/app/import-batches", ({ request }) => {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? "");
    const rows = Number.isFinite(limit) && limit > 0 ? importBatches.slice(0, limit) : importBatches;
    return ok(rows);
  }),

  http.get("/api/app/historical-sales", ({ request }) => {
    const params = new URL(request.url).searchParams;
    const year = params.get("year");
    const make = params.get("make");
    const since = params.get("since");
    const limitRaw = Number(params.get("limit") ?? "");

    let rows = historicalSales;
    if (year) rows = rows.filter((r) => String(r.year) === year);
    if (make) rows = rows.filter((r) => r.make.toLowerCase() === make.toLowerCase());
    if (since) rows = rows.filter((r) => r.saleDate >= since);
    if (Number.isFinite(limitRaw) && limitRaw > 0) rows = rows.slice(0, limitRaw);
    return ok(rows);
  }),

  http.get("/api/app/ingest-runs", ({ request }) => {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? "");
    const rows = Number.isFinite(limit) && limit > 0 ? ingestRuns.slice(0, limit) : ingestRuns;
    return ok(rows);
  }),

  http.get("/api/app/ingest-runs/:id", ({ params }) => {
    const match = ingestRuns.find((r) => r.id === params.id);
    if (!match) return err(404, "not_found");
    return ok({ ...ingestRunDetail, run: match });
  }),

  http.get("/api/app/opportunities", ({ request }) => {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? "");
    const rows =
      Number.isFinite(limit) && limit > 0 ? opportunities.slice(0, limit) : opportunities;
    return ok(rows);
  }),

  http.get("/api/app/opportunities/:id", ({ params }) => {
    const match = opportunities.find((r) => r.id === params.id);
    if (!match) return err(404, "not_found");
    return ok({ ...opportunityDetail, ...match, id: match.id });
  }),

  http.post("/api/app/opportunities/:id/status", async ({ params, request }) => {
    const match = opportunities.find((r) => r.id === params.id);
    if (!match) return err(404, "opportunity_not_found");
    const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
    const status = typeof body?.status === "string" ? body.status : "";
    if (!["reviewed", "contacted", "negotiating", "purchased", "bought", "passed"].includes(status)) {
      return err(400, "invalid_status");
    }
    const nextStatus = status === "bought" ? "purchased" : status;
    return ok({
      ...opportunityDetail,
      ...match,
      id: match.id,
      status: nextStatus,
      actions: [
        ...opportunityDetail.actions,
        {
          id: "action-status",
          normalizedListingId: match.id,
          actorUserId: "user-closer-1",
          actorName: "Closer One",
          action: "status_changed",
          notes: null,
          metadata: { previousStatus: match.status ?? "new", newStatus: nextStatus },
          createdAt: "2026-05-23T18:00:00.000Z",
        },
      ],
    });
  }),

  http.post("/api/app/opportunities/:id/notes", async ({ params, request }) => {
    const match = opportunities.find((r) => r.id === params.id);
    if (!match) return err(404, "opportunity_not_found");
    const body = (await request.json().catch(() => null)) as { note?: unknown } | null;
    const note = typeof body?.note === "string" ? body.note.trim() : "";
    if (!note) return err(400, "validation_error");
    return ok({
      ...opportunityDetail,
      ...match,
      id: match.id,
      actions: [
        ...opportunityDetail.actions,
        {
          id: "action-note",
          normalizedListingId: match.id,
          actorUserId: "user-closer-1",
          actorName: "Closer One",
          action: "note_added",
          notes: note,
          metadata: {},
          createdAt: "2026-05-23T18:00:00.000Z",
        },
      ],
    });
  }),

  http.post("/api/app/mmr/vin", async ({ request }) => {
    const body = (await request.json().catch(() => null)) as { vin?: unknown } | null;
    const vin = typeof body?.vin === "string" ? body.vin : "";
    if (vin.length < 11) {
      return err(400, "invalid_body", {
        issues: [{ path: ["vin"], message: "VIN must be at least 11 characters" }],
      });
    }
    if (vin === PREVIEW_VIN) return ok(mmrVinOk);
    return ok(mmrVinUnavailable);
  }),
];
