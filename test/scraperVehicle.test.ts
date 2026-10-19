import { describe, expect, it } from "vitest";
import { isCleanVehicleLabel, readScraperVehicle } from "../src/apify/scraperVehicle";

describe("isCleanVehicleLabel", () => {
  it("accepts a make and a model name", () => {
    expect(isCleanVehicleLabel("GMC", "make")).toBe(true);
    expect(isCleanVehicleLabel("Rogue Select", "model")).toBe(true);
    expect(isCleanVehicleLabel("F-150", "model")).toBe(true);
  });

  it("rejects a pasted title, a body style, and a make with digits", () => {
    expect(isCleanVehicleLabel("tundra/d0wn pay", "model")).toBe(false);
    expect(isCleanVehicleLabel("Sport Utility 4D", "model")).toBe(false);
    expect(isCleanVehicleLabel("F-150", "make")).toBe(false);
  });
});

describe("readScraperVehicle", () => {
  it("reads the build 0.0.6 vehicle object", () => {
    const vehicle = readScraperVehicle({
      details: {
        vehicle: {
          makeDisplayName: "Nissan",
          modelDisplayName: "Rogue Select",
          odometer: { unit: "MILES", value: 128000 },
          sellerType: "PRIVATE_SELLER",
          dealershipName: null,
        },
      },
    });
    expect(vehicle.cleanYmms).toBe(true);
    expect(vehicle.dealership).toBe(false);
    expect(vehicle.mileage).toBe(128000);
  });

  it("treats a dealership name or dealer seller type as a dealership, not PRIVATE_SELLER", () => {
    expect(
      readScraperVehicle({
        details: { vehicle: { sellerType: "PRIVATE_SELLER", dealershipName: "Cardawg2 Auto Sales" } },
      }).dealership,
    ).toBe(true);
    expect(
      readScraperVehicle({
        details: { vehicle: { sellerType: "DEALER", dealershipName: null } },
      }).dealership,
    ).toBe(true);
    expect(
      readScraperVehicle({
        details: { vehicle: { sellerType: "PRIVATE_SELLER", dealershipName: null } },
      }).dealership,
    ).toBe(false);
  });

  it("still reads the old extraListingData field names", () => {
    const vehicle = readScraperVehicle({
      extraListingData: {
        vehicle_make_display_name: "Toyota",
        vehicle_model_display_name: "Camry",
        vehicle_odometer_data: { unit: "MILES", value: 62000 },
      },
    });
    expect(vehicle.cleanYmms).toBe(true);
    expect(vehicle.mileage).toBe(62000);
  });
});
