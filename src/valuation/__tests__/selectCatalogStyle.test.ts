import { describe, expect, it } from "vitest";
import { selectCatalogStyleForListing } from "../selectCatalogStyle";

describe("selectCatalogStyleForListing", () => {
  it("selects the exact Cox style when trim and body evidence match one option", () => {
    const selected = selectCatalogStyleForListing({
      title: "2019 Ford F150 Regular Cab XL Pickup 2D 6 1/2 ft",
      trim: "XL",
      styles: [
        "4D CREW CAB XLT",
        "2D REGULAR CAB XL",
        "2D REGULAR CAB XLT",
      ],
    });

    expect(selected?.style).toBe("2D REGULAR CAB XL");
    expect(selected?.matchedSignals).toEqual(expect.arrayContaining(["XL", "REGULAR CAB"]));
    expect(selected?.isEstimated).toBe(false);
  });

  it("selects EV range/performance styles from title evidence", () => {
    const selected = selectCatalogStyleForListing({
      title: "2021 Tesla Model Y AWD 4D SUV Performance",
      trim: "Performance",
      styles: ["4D SUV LONG RANGE", "4D SUV PERFORMANCE"],
    });

    expect(selected?.style).toBe("4D SUV PERFORMANCE");
    expect(selected?.isEstimated).toBe(false);
  });

  it("uses the first catalog style as an estimate when matching trim is ambiguous", () => {
    const selected = selectCatalogStyleForListing({
      title: "2020 Chevrolet Silverado 1500 RST Pickup 4D 5 3/4 ft",
      trim: "RST",
      styles: [
        "4D CREW CAB RST",
        "4D DOUBLE CAB RST",
      ],
    });

    expect(selected?.style).toBe("4D CREW CAB RST");
    expect(selected?.isEstimated).toBe(true);
  });

  it("uses the first catalog style as an estimate when no listing evidence matches the catalog", () => {
    const selected = selectCatalogStyleForListing({
      title: "2011 Ram 2500",
      trim: null,
      styles: ["4D CREW CAB LARAMIE", "4D CREW CAB SLT"],
    });

    expect(selected?.style).toBe("4D CREW CAB LARAMIE");
    expect(selected?.matchedSignals).toEqual([]);
    expect(selected?.isEstimated).toBe(true);
  });
});
