import { describe, expect, it } from "vitest";

import { selectMmrPayloadItem } from "../manheimPayloadItem";

describe("selectMmrPayloadItem", () => {
  it("prefers bestMatch over items[0]", () => {
    const payload = {
      items: [
        { description: { trim: "TREMOR" }, adjustedPricing: { wholesale: { average: 34900 } } },
        { bestMatch: true, description: { trim: "XLT" }, adjustedPricing: { wholesale: { average: 25100 } } },
      ],
    };
    expect(selectMmrPayloadItem(payload)?.description).toEqual({ trim: "XLT" });
  });

  it("falls back to items[0] when no bestMatch flag", () => {
    const payload = {
      items: [
        { description: { trim: "FIRST" } },
        { description: { trim: "SECOND" } },
      ],
    };
    expect(selectMmrPayloadItem(payload)?.description).toEqual({ trim: "FIRST" });
  });

  it("reads root object when items array is absent", () => {
    const payload = { adjustedPricing: { wholesale: { average: 19400 } }, sampleSize: "12" };
    expect(selectMmrPayloadItem(payload)).toBe(payload);
  });

  it("returns null for empty items array", () => {
    expect(selectMmrPayloadItem({ items: [] })).toEqual({ items: [] });
  });
});
