import { describe, expect, it } from "vitest";
import { extractManheimVehicleIdentity } from "../manheimVehicleIdentityParser";

describe("extractManheimVehicleIdentity", () => {
  it("reads legacy Manheim description object on items[0]", () => {
    const payload = {
      items: [{
        description: {
          year: 2022,
          make: "FORD",
          model: "F-150",
          trim: "4D SUPERCREW XLT",
        },
        adjustedPricing: { wholesale: { average: 43000 } },
      }],
    };
    expect(extractManheimVehicleIdentity(payload)).toEqual({
      year: 2022,
      make: "FORD",
      model: "F-150",
      trim: "4D SUPERCREW XLT",
    });
  });

  it("reads flat Cox-style fields on items[0]", () => {
    const payload = {
      items: [{
        year: 2026,
        makeName: "TESLA",
        modelName: "MODEL Y AWD",
        bodyName: "4D SUV PERFORMANCE",
      }],
    };
    expect(extractManheimVehicleIdentity(payload)).toEqual({
      year: 2026,
      make: "TESLA",
      model: "MODEL Y AWD",
      trim: "4D SUV PERFORMANCE",
    });
  });

  it("returns nulls when payload has no identity fields", () => {
    expect(extractManheimVehicleIdentity({ items: [{ sampleSize: "6" }] })).toEqual({
      year: null,
      make: null,
      model: null,
      trim: null,
    });
  });
});
