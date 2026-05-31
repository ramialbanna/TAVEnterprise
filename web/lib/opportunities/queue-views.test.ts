import { describe, expect, it } from "vitest";

import type { OpportunityRow } from "@/lib/app-api/schemas";

import {
  countFirstSeenToday,
  emptyCopyForView,
  formatQueueSummaryLine,
  isFirstSeenToday,
} from "./queue-views";

function row(firstSeenAt: string | null): Pick<OpportunityRow, "firstSeenAt"> {
  return { firstSeenAt };
}

describe("isFirstSeenToday", () => {
  const now = new Date(2026, 4, 31, 12, 0, 0);

  it("matches same local calendar day", () => {
    const sameDay = new Date(2026, 4, 31, 8, 0, 0).toISOString();
    expect(isFirstSeenToday(sameDay, now)).toBe(true);
  });

  it("rejects previous day", () => {
    const priorDay = new Date(2026, 4, 30, 23, 59, 0).toISOString();
    expect(isFirstSeenToday(priorDay, now)).toBe(false);
  });

  it("rejects null or invalid", () => {
    expect(isFirstSeenToday(null, now)).toBe(false);
    expect(isFirstSeenToday("not-a-date", now)).toBe(false);
  });
});

describe("countFirstSeenToday", () => {
  it("counts rows first seen today", () => {
    const now = new Date("2026-05-31T12:00:00.000Z");
    expect(
      countFirstSeenToday(
        [row("2026-05-31T01:00:00.000Z"), row("2026-05-30T01:00:00.000Z"), row(null)],
        now,
      ),
    ).toBe(1);
  });
});

describe("formatQueueSummaryLine", () => {
  it("formats needs-you and new-today counts", () => {
    expect(formatQueueSummaryLine({ needsYou: 3, newToday: 12 })).toBe(
      "3 need you · 12 new today",
    );
  });

  it("uses friendly copy when counts are zero", () => {
    expect(formatQueueSummaryLine({ needsYou: 0, newToday: 0 })).toBe(
      "Nothing needs you right now · No new listings today",
    );
  });
});

describe("emptyCopyForView", () => {
  it("returns per-tab empty states", () => {
    expect(emptyCopyForView("needs_action").title).toBe("You're all caught up");
    expect(emptyCopyForView("mine").title).toContain("assigned");
    expect(emptyCopyForView("worth_a_look").title).toContain("standouts");
  });
});
