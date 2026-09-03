import { describe, expect, it } from "vitest";

import { listingIsIneligibleVehicle } from "../listingVehicleEligibility";

describe("listingIsIneligibleVehicle", () => {
  it("drops a BMW K1600 as a motorcycle", () => {
    expect(
      listingIsIneligibleVehicle({
        make: "bmw",
        model: "k1600",
        title: "2018 BMW K1600 GTL",
      }),
    ).toEqual({ kind: "motorcycle", matched: "k1600" });
  });

  it("drops a Honda SCL500", () => {
    expect(
      listingIsIneligibleVehicle({
        make: "honda",
        model: "scl500",
        title: "2023 Honda SCL500",
      }),
    ).toMatchObject({ kind: "motorcycle" });
  });

  it("drops a Honda PCX scooter", () => {
    expect(
      listingIsIneligibleVehicle({
        make: "honda",
        model: "pcx",
        title: "2021 Honda PCX 150",
      }),
    ).toMatchObject({ kind: "scooter" });
  });

  it("drops a Ford F-550 as commercial chassis", () => {
    expect(
      listingIsIneligibleVehicle({
        make: "ford",
        model: "f-550",
        title: "2016 Ford F-550 XL",
      }),
    ).toEqual({ kind: "commercial_chassis", matched: "f550" });
  });

  it("drops a Ram 5500 as commercial chassis", () => {
    expect(
      listingIsIneligibleVehicle({
        make: "ram",
        model: "5500",
        title: "2019 Ram 5500 chassis cab",
      }),
    ).toMatchObject({ kind: "commercial_chassis" });
  });

  it("keeps an F-150", () => {
    expect(
      listingIsIneligibleVehicle({
        make: "ford",
        model: "f-150",
        title: "2018 Ford F-150 XLT SuperCrew",
      }),
    ).toBeNull();
  });

  it("keeps a Mercedes E 350", () => {
    expect(
      listingIsIneligibleVehicle({
        make: "mercedes-benz",
        model: "e-class",
        title: "2017 Mercedes-Benz E 350",
      }),
    ).toBeNull();
  });

  it("keeps an F-450 pickup", () => {
    expect(
      listingIsIneligibleVehicle({
        make: "ford",
        model: "f-450",
        title: "2018 Ford F-450 King Ranch",
      }),
    ).toBeNull();
  });
});
