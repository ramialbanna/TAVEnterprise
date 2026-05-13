import { describe, expect, it } from "vitest";

import { GROSS_VALUE_KEYS, HOLD_DAYS_VALUE_KEYS, normalizeByRegion } from "./by-region";

describe("normalizeByRegion", () => {
  it("projects rows with valid region + numeric metric into BarChartDatum", () => {
    const rows = [
      { region: "TX-East", avg_gross_profit: 1700, avg_hold_days: 19 },
      { region: "TX-West", avg_gross_profit: 1300, avg_hold_days: 24 },
    ];
    expect(normalizeByRegion(rows, GROSS_VALUE_KEYS)).toEqual([
      { label: "TX-East", value: 1700 },
      { label: "TX-West", value: 1300 },
    ]);
    expect(normalizeByRegion(rows, HOLD_DAYS_VALUE_KEYS)).toEqual([
      { label: "TX-East", value: 19 },
      { label: "TX-West", value: 24 },
    ]);
  });

  it("returns [] for empty input", () => {
    expect(normalizeByRegion([], GROSS_VALUE_KEYS)).toEqual([]);
  });

  it("skips rows missing the value column — does NOT coerce missing to 0", () => {
    const rows = [
      { region: "TX-East", avg_gross_profit: 1700 },
      { region: "TX-West" /* no avg_gross_profit */ },
      { region: "TX-South", avg_gross_profit: null },
    ];
    const out = normalizeByRegion(rows, GROSS_VALUE_KEYS);
    expect(out).toEqual([{ label: "TX-East", value: 1700 }]);
    for (const d of out) expect(d.value).not.toBe(0);
  });

  it("skips rows where the value is not a finite number (NaN, Infinity, strings)", () => {
    const rows = [
      { region: "A", avg_gross_profit: Number.NaN },
      { region: "B", avg_gross_profit: Number.POSITIVE_INFINITY },
      { region: "C", avg_gross_profit: "1500" },
      { region: "D", avg_gross_profit: 1500 },
    ];
    expect(normalizeByRegion(rows, GROSS_VALUE_KEYS)).toEqual([{ label: "D", value: 1500 }]);
  });

  it("skips rows missing the region label entirely (or with a non-string region)", () => {
    const rows = [
      { region: "TX-East", avg_gross_profit: 1700 },
      { region: "", avg_gross_profit: 1500 },
      { region: null, avg_gross_profit: 1500 },
      { avg_gross_profit: 1500 },
      { region: 42, avg_gross_profit: 1500 },
    ];
    expect(normalizeByRegion(rows as Array<Record<string, unknown>>, GROSS_VALUE_KEYS)).toEqual([
      { label: "TX-East", value: 1700 },
    ]);
  });

  it("ignores sell_through_rate even when present on a row", () => {
    const rows = [{ region: "TX-East", avg_gross_profit: 1700, sell_through_rate: 0.9 }];
    const out = normalizeByRegion(rows, GROSS_VALUE_KEYS);
    expect(out).toEqual([{ label: "TX-East", value: 1700 }]);
  });
});
