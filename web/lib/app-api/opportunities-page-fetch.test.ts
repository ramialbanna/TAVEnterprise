import { describe, expect, it, vi } from "vitest";

import { fetchOpportunitiesPage } from "./opportunities-page-fetch";
import { parseOpportunitiesPage } from "./parse";

const OPPORTUNITY_ROW = {
  id: "22222222-2222-2222-2222-222222222222",
  type: "lead",
  badges: ["First seen"],
  source: "facebook",
  region: "dallas_tx",
  sourceRunId: "11111111-1111-1111-1111-111111111111",
  normalizedListingId: "22222222-2222-2222-2222-222222222222",
  vehicleCandidateId: null,
  leadId: "33333333-3333-3333-3333-333333333333",
  title: "2019 Ford F-150",
  year: 2019,
  make: "Ford",
  model: "F-150",
  style: "XLT",
  vin: "1FT8W3BT1SEC27066",
  price: 25000,
  mmrValue: 28000,
  spread: 3000,
  finalScore: 72,
  grade: "good",
  status: "reviewed",
  submittedBy: null,
  assignedTo: null,
  assignedCloserName: null,
  claimedBy: "Closer One",
  claimedAt: "2026-05-23T00:00:00.000Z",
  claimExpiresAt: "2026-05-24T00:00:00.000Z",
  lastEvaluatedBy: null,
  lastEvaluatedAt: null,
  firstSeenAt: "2026-05-20T10:00:00.000Z",
  lastSeenAt: "2026-05-21T10:00:00.000Z",
  seenCount: 1,
  listingUrl: "https://example.com/listing/1",
  estimateFlags: { mileage: false, style: false, mmr: false },
};

describe("fetchOpportunitiesPage", () => {
  it("falls back to the classic list when paginated parsing fails", async () => {
    const getJson = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        json: { ok: true, data: { not: "a page" } },
      })
      .mockResolvedValueOnce({
        status: 200,
        json: { ok: true, data: [OPPORTUNITY_ROW] },
      });

    const result = await fetchOpportunitiesPage(getJson, {
      limit: 25,
      offset: 0,
      sort: "spread_desc",
      view: "all",
    });

    expect(getJson).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.items).toHaveLength(1);
    expect(result.data.total).toBe(1);
  });

  it("applies client view filter when the Worker returns a full legacy array page", async () => {
    const unassigned = { ...OPPORTUNITY_ROW, id: "opp-a", assignedTo: null };
    const assigned = { ...OPPORTUNITY_ROW, id: "opp-b", assignedTo: "user-2" };

    const getJson = vi.fn().mockResolvedValueOnce({
      status: 200,
      json: { ok: true, data: [unassigned, assigned] },
    });

    const result = await fetchOpportunitiesPage(getJson, {
      limit: 25,
      offset: 0,
      sort: "spread_desc",
      view: "needs_action",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.total).toBe(1);
    expect(result.data.items[0]?.id).toBe("opp-a");
  });

  it("applies client view filter when paginated body has more items than total", async () => {
    const unassigned = { ...OPPORTUNITY_ROW, id: "opp-a", assignedTo: null };
    const assigned = { ...OPPORTUNITY_ROW, id: "opp-b", assignedTo: "user-2" };

    const getJson = vi.fn().mockResolvedValueOnce({
      status: 200,
      json: {
        ok: true,
        data: { items: [unassigned, assigned], total: 1, offset: 0 },
      },
    });

    const result = await fetchOpportunitiesPage(getJson, {
      limit: 25,
      offset: 0,
      sort: "spread_desc",
      view: "needs_action",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.total).toBe(1);
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]?.id).toBe("opp-a");
  });

  it("uses paginated parsing when the Worker returns a consistent page object", async () => {
    const unassigned = { ...OPPORTUNITY_ROW, id: "opp-a", assignedTo: null };
    const assigned = { ...OPPORTUNITY_ROW, id: "opp-b", assignedTo: "user-2" };

    const getJson = vi.fn().mockResolvedValueOnce({
      status: 200,
      json: {
        ok: true,
        data: { items: [unassigned], total: 1, offset: 0 },
      },
    });

    const result = await fetchOpportunitiesPage(getJson, {
      limit: 25,
      offset: 0,
      sort: "spread_desc",
      view: "needs_action",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.total).toBe(1);
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]?.id).toBe("opp-a");
  });

  it("uses paginated parsing when the Worker returns a page object", async () => {
    const payload = {
      ok: true,
      data: { items: [OPPORTUNITY_ROW], total: 1, offset: 0 },
    };
    const getJson = vi.fn().mockResolvedValueOnce({ status: 200, json: payload });

    const result = await fetchOpportunitiesPage(getJson, { limit: 25, offset: 0, sort: "spread_desc" });

    expect(getJson).toHaveBeenCalledTimes(1);
    expect(parseOpportunitiesPage(200, payload).ok).toBe(true);
    expect(result.ok).toBe(true);
  });
});
