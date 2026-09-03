import { describe, expect, it } from "vitest";

import { extractListingAxisTokens } from "../listingAxisEvidence";

describe("extractListingAxisTokens", () => {
  it("reads 4x4 V6 and SuperCrew from a Ford F-150 listing", () => {
    expect(
      extractListingAxisTokens({
        title: "FORD F150 XLT 2017 4x4 V6",
        trim: "xlt",
      }),
    ).toEqual(["4wd", "v6"]);
  });

  it("reads 4WD diesel and crew cab from a Ram listing, preferring diesel over a conflicting V6", () => {
    expect(
      extractListingAxisTokens({
        title: "RAM 5500",
        description: "RAM 5500 V6 6.7L DIESEL 4WD AUTO CREW CAB",
      }),
    ).toEqual(["4wd", "diesel", "crew"]);
  });

  it("maps 4x2 to 2wd and HEMI to v8", () => {
    expect(
      extractListingAxisTokens({ title: "2019 Ram 1500 4x2 HEMI Big Horn" }),
    ).toEqual(["2wd", "v8"]);
  });

  it("treats 4WD and AWD as the same drivetrain rather than a conflict", () => {
    expect(extractListingAxisTokens({ title: "2018 Jeep Wrangler 4x4 AWD Sport" })).toEqual(["4wd"]);
  });

  it("omits drivetrain when 4wd and 2wd both appear", () => {
    expect(extractListingAxisTokens({ title: "F-150 XLT 4x4 or 4x2" })).toEqual([]);
  });

  it("omits engine when V6 and V8 both appear without diesel", () => {
    expect(extractListingAxisTokens({ description: "available in V6 or V8" })).toEqual([]);
  });

  it("returns nothing when the listing does not name an axis", () => {
    expect(extractListingAxisTokens({ title: "2016 Honda CR-V Sport Utility 4D" })).toEqual([]);
  });

  it("reads AWD from a CR-V title", () => {
    expect(extractListingAxisTokens({ title: "2016 Honda CR-V AWD Sport Utility 4D" })).toEqual([
      "awd",
    ]);
  });
});
