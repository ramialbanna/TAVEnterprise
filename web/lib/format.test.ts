import { describe, expect, it } from "vitest";
import {
  EMPTY_VALUE,
  compactNumber,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelativeTime,
} from "./format";

describe("formatMoney", () => {
  it("formats whole dollars by default", () => {
    expect(formatMoney(1500)).toBe("$1,500");
    expect(formatMoney(0)).toBe("$0");
  });
  it("formats negatives", () => {
    expect(formatMoney(-1500)).toBe("-$1,500");
  });
  it("supports cents when requested", () => {
    expect(formatMoney(1500.5, { cents: true })).toBe("$1,500.50");
  });
  it("is null-safe", () => {
    expect(formatMoney(null)).toBe(EMPTY_VALUE);
    expect(formatMoney(undefined)).toBe(EMPTY_VALUE);
    expect(formatMoney(Number.NaN)).toBe(EMPTY_VALUE);
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe(EMPTY_VALUE);
  });
});

describe("formatNumber", () => {
  it("rounds to whole numbers by default", () => {
    expect(formatNumber(21.5)).toBe("22");
    expect(formatNumber(1234)).toBe("1,234");
  });
  it("honours maximumFractionDigits", () => {
    expect(formatNumber(21.5, { maximumFractionDigits: 1 })).toBe("21.5");
    expect(formatNumber(21, { minimumFractionDigits: 2 })).toBe("21.00");
  });
  it("is null-safe", () => {
    expect(formatNumber(null)).toBe(EMPTY_VALUE);
    expect(formatNumber(undefined)).toBe(EMPTY_VALUE);
    expect(formatNumber(Number.NaN)).toBe(EMPTY_VALUE);
  });
});

describe("compactNumber", () => {
  it("compacts large counts", () => {
    expect(compactNumber(1500)).toBe("1.5K");
    expect(compactNumber(2_000_000)).toBe("2M");
  });
  it("is null-safe", () => {
    expect(compactNumber(null)).toBe(EMPTY_VALUE);
    expect(compactNumber(Number.NaN)).toBe(EMPTY_VALUE);
  });
});

describe("formatPercent", () => {
  it("treats input as a decimal ratio", () => {
    expect(formatPercent(0.123)).toBe("12.3%");
    expect(formatPercent(0.42)).toBe("42%");
    expect(formatPercent(1)).toBe("100%");
  });
  it("honours fraction-digit options", () => {
    expect(formatPercent(0.12345, { maximumFractionDigits: 2 })).toBe("12.35%");
  });
  it("is null-safe", () => {
    expect(formatPercent(null)).toBe(EMPTY_VALUE);
    expect(formatPercent(undefined)).toBe(EMPTY_VALUE);
    expect(formatPercent(Number.NaN)).toBe(EMPTY_VALUE);
  });
});

describe("formatDate", () => {
  it("formats a date-only ISO string in UTC (no off-by-one)", () => {
    expect(formatDate("2026-05-01")).toBe("May 1, 2026");
    expect(formatDate("2026-12-31")).toBe("December 31, 2026");
  });
  it("formats a full ISO timestamp", () => {
    expect(formatDate("2026-05-01T12:00:00Z")).toBe("May 1, 2026");
  });
  it("accepts a Date and epoch ms", () => {
    expect(formatDate(new Date("2026-05-01T00:00:00Z"))).toContain("2026");
    expect(formatDate(Date.UTC(2026, 4, 1))).toContain("2026");
  });
  it("returns the sentinel for invalid / missing input", () => {
    expect(formatDate("not a date")).toBe(EMPTY_VALUE);
    expect(formatDate("")).toBe(EMPTY_VALUE);
    expect(formatDate(null)).toBe(EMPTY_VALUE);
    expect(formatDate(undefined)).toBe(EMPTY_VALUE);
    expect(formatDate(Number.NaN)).toBe(EMPTY_VALUE);
  });
});

describe("formatDateTime", () => {
  it("includes a time component for full timestamps", () => {
    const out = formatDateTime("2026-05-01T14:30:00Z");
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });
  it("falls back to date-only formatting for a bare date", () => {
    expect(formatDateTime("2026-05-01")).toBe("May 1, 2026");
  });
  it("is null-safe", () => {
    expect(formatDateTime(null)).toBe(EMPTY_VALUE);
    expect(formatDateTime("nope")).toBe(EMPTY_VALUE);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-05-12T12:00:00Z").getTime();
  it("says 'just now' within 30s", () => {
    expect(formatRelativeTime("2026-05-12T11:59:50Z", now)).toBe("just now");
  });
  it("formats past times", () => {
    expect(formatRelativeTime("2026-05-12T11:55:00Z", now)).toBe("5 minutes ago");
    expect(formatRelativeTime("2026-05-10T12:00:00Z", now)).toMatch(/ago|days/);
  });
  it("formats future times", () => {
    expect(formatRelativeTime("2026-05-12T15:00:00Z", now)).toBe("in 3 hours");
  });
  it("is null-safe", () => {
    expect(formatRelativeTime(null, now)).toBe(EMPTY_VALUE);
    expect(formatRelativeTime("nope", now)).toBe(EMPTY_VALUE);
  });
});
