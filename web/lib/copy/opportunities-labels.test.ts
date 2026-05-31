import { describe, expect, it } from "vitest";

import {
  formatOpportunityBadge,
  formatOpportunityStatus,
  formatOpportunityType,
  formatRegion,
} from "./opportunities-labels";

describe("formatRegion", () => {
  it("maps known region keys", () => {
    expect(formatRegion("dallas_tx")).toBe("Dallas");
    expect(formatRegion("lubbock_tx")).toBe("Lubbock");
  });

  it("falls back for unknown keys", () => {
    expect(formatRegion("some_other")).toBe("some other");
  });

  it("returns em dash for empty", () => {
    expect(formatRegion(null)).toBe("—");
  });
});

describe("formatOpportunityStatus", () => {
  it("maps known statuses", () => {
    expect(formatOpportunityStatus("claimed")).toBe("Working on it");
    expect(formatOpportunityStatus("reviewed")).toBe("Reviewed");
  });

  it("falls back for unknown statuses", () => {
    expect(formatOpportunityStatus("custom_status")).toBe("custom status");
  });
});

describe("formatOpportunityBadge", () => {
  it("maps known badges", () => {
    expect(formatOpportunityBadge("Near miss")).toBe("Almost a deal");
    expect(formatOpportunityBadge("Manual submission")).toBe("Submitted by team");
  });

  it("passes through unknown badges", () => {
    expect(formatOpportunityBadge("Price changed")).toBe("Price changed");
  });
});

describe("formatOpportunityType", () => {
  it("maps opportunity types", () => {
    expect(formatOpportunityType("near_miss")).toBe("Almost a deal");
    expect(formatOpportunityType("manual_submission")).toBe("Submitted by team");
  });

  it("includes capitalized grade for leads", () => {
    expect(formatOpportunityType("lead", "excellent")).toBe("Lead · Excellent");
  });
});
