import { describe, expect, it } from "vitest";

import { buildMmrRecomputeRequest } from "./build-mmr-recompute-request";
import { EMPTY_MMR_ADJUSTMENTS } from "./mmr-adjustments";

describe("buildMmrRecomputeRequest", () => {
  it("builds VIN request with mileage and adjustments", () => {
    const body = buildMmrRecomputeRequest(
      { kind: "vin", vin: "1HGCM82633A004352" },
      { ...EMPTY_MMR_ADJUSTMENTS, odometer: "52000", region: "West", grade: "3.5" },
    );
    expect(body).toEqual({
      vin: "1HGCM82633A004352",
      mileage: 52000,
      adjustments: { region: "West", grade: "3.5", exclude_build: true },
    });
  });

  it("builds VIN request with build options YES and odometer", () => {
    const body = buildMmrRecomputeRequest(
      { kind: "vin", vin: "1FMSK7DH1NGB37986" },
      { ...EMPTY_MMR_ADJUSTMENTS, odometer: "40000", buildOptions: true },
    );
    expect(body).toEqual({
      vin: "1FMSK7DH1NGB37986",
      mileage: 40000,
      adjustments: { exclude_build: false },
    });
  });

  it("sends exclude_build when user explicitly toggles build options to NO only", () => {
    const body = buildMmrRecomputeRequest(
      { kind: "vin", vin: "1FMSK7DH1NGB37986" },
      { ...EMPTY_MMR_ADJUSTMENTS, buildOptions: false, buildOptionsUserExcluded: true },
    );
    expect(body).toEqual({
      vin: "1FMSK7DH1NGB37986",
      adjustments: { exclude_build: true },
    });
  });

  it("builds YMM request using adjustment odometer when set", () => {
    const body = buildMmrRecomputeRequest(
      {
        kind: "ymm",
        selection: {
          year: "2026",
          make: "TESLA",
          model: "MODEL Y AWD",
          style: "4D SUV PERFORMANCE",
        },
      },
      { ...EMPTY_MMR_ADJUSTMENTS, odometer: "65000" },
    );
    expect(body).toEqual({
      year: 2026,
      make: "TESLA",
      model: "MODEL Y AWD",
      style: "4D SUV PERFORMANCE",
      mileage: 65000,
    });
  });

  it("builds YMM request without mileage when odometer is empty", () => {
    const body = buildMmrRecomputeRequest(
      {
        kind: "ymm",
        selection: {
          year: "2026",
          make: "TESLA",
          model: "MODEL Y AWD",
          style: "4D SUV PERFORMANCE",
        },
      },
      EMPTY_MMR_ADJUSTMENTS,
    );
    expect(body).toEqual({
      year: 2026,
      make: "TESLA",
      model: "MODEL Y AWD",
      style: "4D SUV PERFORMANCE",
    });
  });
});
