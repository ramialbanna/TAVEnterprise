import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addOpportunityNote,
  getKpis,
  getSystemStatus,
  historicalSalesQuery,
  importBatchesQuery,
  listHistoricalSales,
  postMmrVin,
  updateOpportunityStatus,
} from "./client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("query builders", () => {
  it("historicalSalesQuery omits unset fields and prefixes ?", () => {
    expect(historicalSalesQuery()).toBe("");
    expect(historicalSalesQuery({ limit: 5, make: "Ford" })).toBe("?limit=5&make=Ford");
    expect(historicalSalesQuery({ make: "", model: "F-150" })).toBe("?model=F-150");
    expect(historicalSalesQuery({ limit: 0 })).toBe("?limit=0");
  });

  it("importBatchesQuery", () => {
    expect(importBatchesQuery()).toBe("");
    expect(importBatchesQuery(3)).toBe("?limit=3");
  });
});

describe("transport-failure handling", () => {
  it("getSystemStatus → ApiResult error (not a throw) when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const r = await getSystemStatus();
    expect(r).toEqual({
      ok: false,
      kind: "proxy",
      error: "client_fetch_failed",
      status: 0,
      message: expect.stringContaining("could not reach"),
    });
  });

  it("listHistoricalSales → ApiResult error when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const r = await listHistoricalSales({ limit: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("proxy");
      expect(r.error).toBe("client_fetch_failed");
      expect(r.status).toBe(0);
    }
  });

  it("postMmrVin → ApiResult error when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const r = await postMmrVin({ vin: "1FT8W3BT1SEC27066" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("client_fetch_failed");
  });
});

describe("happy path delegates to parsers", () => {
  it("getKpis parses an ok envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        data: {
          generatedAt: "2026-05-12T12:00:00.000Z",
          outcomes: {
            value: { totalOutcomes: 3, avgGrossProfit: 1500, avgHoldDays: 21.5, lastOutcomeAt: null, byRegion: [] },
            missingReason: null,
          },
          leads: { value: { total: 7 }, missingReason: null },
          listings: { value: { normalizedTotal: 42 }, missingReason: null },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await getKpis();
    expect(fetchMock).toHaveBeenCalledWith("/api/app/kpis", expect.objectContaining({ method: "GET" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.outcomes.value?.totalOutcomes).toBe(3);
  });

  it("postMmrVin sends the JSON body to /api/app/mmr/vin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { ok: true, data: { mmrValue: 68600, confidence: "high", method: "vin" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await postMmrVin({ vin: "1FT8W3BT1SEC27066", mileage: 50000 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/app/mmr/vin",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ vin: "1FT8W3BT1SEC27066", mileage: 50000 }) }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.mmrValue).toBe(68600);
  });

  it("updateOpportunityStatus posts to /api/app/opportunities/:id/status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        data: {
          id: "listing-1",
          type: "lead",
          badges: [],
          source: "facebook",
          region: "dallas_tx",
          sourceRunId: null,
          normalizedListingId: "listing-1",
          vehicleCandidateId: null,
          leadId: null,
          title: "2019 Ford F-150",
          year: 2019,
          make: "Ford",
          model: "F-150",
          style: null,
          vin: null,
          price: 25000,
          mmrValue: 28000,
          spread: 3000,
          finalScore: 72,
          grade: "good",
          status: "reviewed",
          submittedBy: null,
          assignedTo: null,
          assignedCloserName: null,
          claimedBy: null,
          claimedAt: null,
          claimExpiresAt: null,
          lastEvaluatedBy: null,
          lastEvaluatedAt: null,
          firstSeenAt: null,
          lastSeenAt: null,
          seenCount: 1,
          listingUrl: null,
          estimateFlags: { mileage: false, style: false, mmr: false },
          reasonCodes: [],
          valuationMissingReason: null,
          scoreComponents: null,
          candidateListingCount: null,
          mileage: null,
          actions: [],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await updateOpportunityStatus("listing-1", { status: "reviewed" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/app/opportunities/listing-1/status",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ status: "reviewed" }),
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe("reviewed");
  });

  it("addOpportunityNote posts to /api/app/opportunities/:id/notes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        data: {
          id: "listing-1",
          type: "lead",
          badges: [],
          source: "facebook",
          region: "dallas_tx",
          sourceRunId: null,
          normalizedListingId: "listing-1",
          vehicleCandidateId: null,
          leadId: null,
          title: "2019 Ford F-150",
          year: 2019,
          make: "Ford",
          model: "F-150",
          style: null,
          vin: null,
          price: 25000,
          mmrValue: 28000,
          spread: 3000,
          finalScore: 72,
          grade: "good",
          status: "claimed",
          submittedBy: null,
          assignedTo: null,
          assignedCloserName: null,
          claimedBy: null,
          claimedAt: null,
          claimExpiresAt: null,
          lastEvaluatedBy: null,
          lastEvaluatedAt: null,
          firstSeenAt: null,
          lastSeenAt: null,
          seenCount: 1,
          listingUrl: null,
          estimateFlags: { mileage: false, style: false, mmr: false },
          reasonCodes: [],
          valuationMissingReason: null,
          scoreComponents: null,
          candidateListingCount: null,
          mileage: null,
          actions: [
            {
              id: "action-1",
              normalizedListingId: "listing-1",
              actorUserId: "user-1",
              actorName: "Alice Adams",
              action: "note_added",
              notes: "Seller asked for best offer",
              metadata: {},
              createdAt: "2026-05-23T00:00:00.000Z",
            },
          ],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const r = await addOpportunityNote("listing-1", { note: "Seller asked for best offer" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/app/opportunities/listing-1/notes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ note: "Seller asked for best offer" }),
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.actions[0]?.notes).toBe("Seller asked for best offer");
  });
});
