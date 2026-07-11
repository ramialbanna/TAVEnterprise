import { describe, expect, it } from "vitest";

import type { OpportunityRow } from "@/lib/app-api/schemas";

import {
  filterOpportunityRowsByView,
  matchesMine,
  matchesWorthALook,
  shouldApplyClientViewFilter,
} from "./view-filter";

function row(overrides: Partial<OpportunityRow> = {}): OpportunityRow {
  return {
    id: "opp-1",
    type: "lead",
    badges: [],
    source: "facebook",
    region: "dallas_tx",
    sourceRunId: null,
    normalizedListingId: "opp-1",
    vehicleCandidateId: null,
    leadId: null,
    title: "Test",
    year: 2019,
    make: "Honda",
    model: "Civic",
    style: null,
    vin: null,
    price: 10_000,
    mmrValue: 14_000,
    spread: 4_000,
    finalScore: 80,
    grade: "good",
    status: "new",
    submittedBy: null,
    assignedTo: null,
    assignedCloserName: null,
    claimedBy: null,
    claimedAt: null,
    claimExpiresAt: null,
    lastEvaluatedBy: null,
    lastEvaluatedAt: null,
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    seenCount: 1,
    listingUrl: null,
    estimateFlags: { mmr: false, mileage: false, style: false },
    ...overrides,
  };
}

describe("view-filter", () => {
  it("filters needs_action to unassigned rows", () => {
    const rows = [row({ assignedTo: null }), row({ assignedTo: "user-2" })];
    const filtered = filterOpportunityRowsByView(rows, "needs_action");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.assignedTo).toBeNull();
  });

  it("excludes bad_lead and other suppressed statuses from all default views", () => {
    const active = row({ id: "a", assignedTo: null, status: "new" });
    const bad = row({ id: "b", assignedTo: null, status: "bad_lead" });
    const passed = row({ id: "c", assignedTo: null, status: "passed" });
    expect(filterOpportunityRowsByView([active, bad, passed], "all")).toEqual([active]);
    expect(filterOpportunityRowsByView([active, bad, passed], "needs_action")).toEqual([active]);
  });

  it("filters mine by assignee user id", () => {
    expect(matchesMine(row({ assignedTo: "user-1" }), "user-1")).toBe(true);
    expect(matchesMine(row({ assignedTo: "user-2" }), "user-1")).toBe(false);
  });

  it("filters mine by active claim user id", () => {
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(
      matchesMine(
        row({ assignedTo: "user-2", claimedBy: "user-1", claimExpiresAt: expires }),
        "user-1",
      ),
    ).toBe(true);
    expect(
      matchesMine(
        row({ assignedTo: "user-2", claimedBy: "Alex", claimExpiresAt: expires }),
        "user-1",
        "Alex",
      ),
    ).toBe(true);
  });

  it("filters worth_a_look by spread threshold", () => {
    expect(matchesWorthALook(row({ spread: 500 }))).toBe(false);
    expect(matchesWorthALook(row({ spread: 2_000 }))).toBe(true);
  });

  it("leaves all rows for view=all", () => {
    const rows = [row(), row({ assignedTo: "user-2" })];
    expect(filterOpportunityRowsByView(rows, "all")).toHaveLength(2);
  });

  it("keeps scraper review rows only on scraper_review view", () => {
    const lead = row({ id: "lead", type: "lead", badges: [] });
    const review = row({
      id: "review",
      type: "scraper_review",
      badges: ["Scraper review", "No MMR"],
      mmrValue: null,
      spread: null,
      assignedTo: null,
    });
    const softNearMiss = row({
      id: "soft",
      type: "near_miss",
      badges: ["Scraper review", "Near miss"],
      assignedTo: null,
    });
    expect(filterOpportunityRowsByView([lead, review, softNearMiss], "all")).toEqual([lead]);
    expect(filterOpportunityRowsByView([lead, review, softNearMiss], "needs_action")).toEqual([
      lead,
    ]);
    expect(filterOpportunityRowsByView([lead, review, softNearMiss], "scraper_review")).toEqual([
      review,
      softNearMiss,
    ]);
  });

  it("shouldApplyClientViewFilter only when items exceed total", () => {
    const items = [row(), row({ assignedTo: "user-2" })];
    expect(
      shouldApplyClientViewFilter({ view: "mine", offset: 0 }, { items, total: 1, offset: 0 }),
    ).toBe(true);
    expect(
      shouldApplyClientViewFilter({ view: "mine", offset: 0 }, { items: [row()], total: 1, offset: 0 }),
    ).toBe(false);
  });
});
