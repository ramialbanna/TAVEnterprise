import { describe, expect, it } from "vitest";
import { selectCatalogModelVariantForListing } from "../selectCatalogModelVariant";

describe("selectCatalogModelVariantForListing", () => {
  it("selects AWD when the listing explicitly says AWD", () => {
    const selected = selectCatalogModelVariantForListing({
      sourceModel: "K5",
      title: "2021 Kia K5 AWD Sedan 4D",
      models: ["K5 AWD", "K5 FWD"],
    });

    expect(selected).toEqual({ model: "K5 AWD", matchedSignals: ["AWD"] });
  });

  it("selects FWD when the listing explicitly says front wheel drive", () => {
    const selected = selectCatalogModelVariantForListing({
      sourceModel: "CR-V",
      title: "2016 Honda CR-V front wheel drive Sport Utility 4D",
      models: ["CR-V AWD", "CR-V FWD", "CR-Z HYBRID"],
    });

    expect(selected).toEqual({ model: "CR-V FWD", matchedSignals: ["FWD"] });
  });

  it("returns null when Cox has drivetrain variants but the listing has no drivetrain evidence", () => {
    const selected = selectCatalogModelVariantForListing({
      sourceModel: "CR-V",
      title: "2016 Honda CR-V Sport Utility 4D",
      trim: "Sport Utility",
      models: ["CR-V AWD", "CR-V FWD"],
    });

    expect(selected).toBeNull();
  });

  it("returns the exact model when Cox exposes the normalized model directly", () => {
    const selected = selectCatalogModelVariantForListing({
      sourceModel: "ILX",
      title: "2021 Acura ILX 4D Sedan",
      models: ["ILX"],
    });

    expect(selected).toEqual({ model: "ILX", matchedSignals: ["EXACT_MODEL"] });
  });

  it("selects Crew Cab variant when title names cab type for split truck models", () => {
    const selected = selectCatalogModelVariantForListing({
      sourceModel: "1500",
      title: "2020 Ram 1500 Crew Cab Big Horn Pickup 4D",
      models: ["1500 Crew Cab", "1500 Double Cab", "1500 Regular Cab"],
    });

    expect(selected).toEqual({ model: "1500 Crew Cab", matchedSignals: ["CREW CAB"] });
  });

  it("selects Double Cab when SuperCab appears in the title", () => {
    const selected = selectCatalogModelVariantForListing({
      sourceModel: "F-150",
      title: "2019 Ford F-150 SuperCab XLT Pickup 4D",
      models: ["F-150 Crew Cab", "F-150 SuperCab", "F-150 Regular Cab"],
    });

    expect(selected?.model).toBe("F-150 SuperCab");
    expect(selected?.matchedSignals).toContain("DOUBLE CAB");
  });
});
