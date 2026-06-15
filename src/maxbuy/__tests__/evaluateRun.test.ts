import { describe, expect, it } from "vitest";

import { vehicleContextFromRequestFields } from "../evaluateRun";

describe("vehicleContextFromRequestFields", () => {
  it("returns null when year/make/model are incomplete", () => {
    expect(vehicleContextFromRequestFields({ year: 2026, make: "TESLA" })).toBeNull();
    expect(vehicleContextFromRequestFields({ make: "TESLA", model: "MODEL Y AWD" })).toBeNull();
  });

  it("builds normalized vehicle context from request YMM fields", () => {
    expect(
      vehicleContextFromRequestFields({
        year: 2026,
        make: "TESLA",
        model: "MODEL Y AWD",
        trim: "4D SUV PERFORMANCE",
        region: "dallas_tx",
      }),
    ).toEqual({
      year: 2026,
      make: "tesla",
      model: "model y awd",
      trim: "4d suv performance",
      region: "dallas_tx",
      cotCity: null,
      cotState: null,
    });
  });

  it("defaults trim and region when omitted", () => {
    expect(
      vehicleContextFromRequestFields({
        year: 2020,
        make: "Ford",
        model: "F-150",
      }),
    ).toEqual({
      year: 2020,
      make: "ford",
      model: "f-150",
      trim: "base",
      region: "unknown",
      cotCity: null,
      cotState: null,
    });
  });
});
