import { describe, expect, it } from "vitest";

import { selectMmrPayloadItem, selectMmrPayloadItemByStyle } from "../manheimPayloadItem";

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

/** 2022 Camry SE parity case — items[0] is AWD ($19,950); correct SE is items[1] ($15,850). */
const CAMRY_2022_ITEMS = {
  items: [
    {
      description: {
        trim: "SE",
        subSeries: "AWD 4D SEDAN SE",
        description: "2022 TOYOTA CAMRY AWD 4C 4D SEDAN SE",
      },
      wholesale: { average: 19_950, below: 16_400, above: 23_500 },
      averageGrade: 38,
    },
    {
      description: {
        trim: "SE",
        subSeries: "4D SEDAN SE",
        description: "2022 TOYOTA CAMRY 4C 4D SEDAN SE",
      },
      wholesale: { average: 15_850, below: 14_000, above: 17_700 },
      averageGrade: 23,
    },
  ],
};

describe("selectMmrPayloadItemByStyle", () => {
  it("prefers bestMatch over style scoring", () => {
    const payload = {
      items: [
        { description: { trim: "SE" }, wholesale: { average: 19_950 } },
        {
          bestMatch: true,
          description: { trim: "XLT" },
          wholesale: { average: 25_100 },
        },
      ],
    };
    expect(selectMmrPayloadItemByStyle(payload, "SE 4D Sedan")?.wholesale).toEqual({ average: 25_100 });
  });

  it("selects non-AWD Camry SE for catalog style SE 4D Sedan (Item 17)", () => {
    const chosen = selectMmrPayloadItemByStyle(CAMRY_2022_ITEMS, "SE 4D Sedan");
    expect((chosen?.wholesale as { average: number }).average).toBe(15_850);
    expect(chosen?.averageGrade).toBe(23);
  });

  it("does not pick AWD variant when style omits AWD", () => {
    const chosen = selectMmrPayloadItemByStyle(CAMRY_2022_ITEMS, "SE 4D Sedan");
    const subSeries = (chosen?.description as { subSeries: string }).subSeries;
    expect(subSeries).not.toMatch(/AWD/i);
  });

  it("falls back to items[0] when style name is empty", () => {
    const chosen = selectMmrPayloadItemByStyle(CAMRY_2022_ITEMS, "");
    expect((chosen?.wholesale as { average: number }).average).toBe(19_950);
  });

  it("returns single item object suitable for downstream parsers", () => {
    const chosen = selectMmrPayloadItemByStyle(CAMRY_2022_ITEMS, "SE 4D Sedan");
    expect(selectMmrPayloadItem(chosen)?.wholesale).toEqual(chosen?.wholesale);
  });
});
