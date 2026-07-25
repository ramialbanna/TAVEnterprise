import { describe, expect, it } from "vitest";

import { resolveOpportunityStyle } from "../src/persistence/opportunityStyle";
import { mergeListingWithValuationIdentity } from "../src/maxbuy/persistence/vehicleContext";
import { buildIngestMaxbuyEvaluateBody } from "../src/ingest/ingestMaxbuyEvaluate";
import { MAXBUY_CONTRACT_VERSION } from "../src/maxbuy/api/schemas";

describe("resolveOpportunityStyle (item 59)", () => {
  it("prefers listing trim when present", () => {
    expect(resolveOpportunityStyle("sport", "4D SUV BADLANDS")).toBe("sport");
  });

  it("falls back to valuation lookup_trim when listing trim is empty", () => {
    expect(resolveOpportunityStyle(null, "4D SUV BADLANDS")).toBe("4D SUV BADLANDS");
    expect(resolveOpportunityStyle("  ", "4D SUV BADLANDS")).toBe("4D SUV BADLANDS");
  });

  it("returns null when neither source has style", () => {
    expect(resolveOpportunityStyle(null, null)).toBeNull();
  });
});

describe("mergeListingWithValuationIdentity (item 59)", () => {
  it("prefers Cox lookup tokens over parsed listing trim", () => {
    expect(
      mergeListingWithValuationIdentity(
        { year: 2021, make: "ford", model: "bronco", trim: "badlands", region: "dallas_tx" },
        { lookup_make: "Ford", lookup_model: "Bronco 4D", lookup_trim: "4D SUV BADLANDS" },
      ),
    ).toEqual({
      year: 2021,
      make: "ford",
      model: "bronco 4d",
      trim: "4d suv badlands",
      region: "dallas_tx",
      cotCity: null,
      cotState: null,
    });
  });

  it("uses listing trim when valuation has no lookup_trim", () => {
    expect(
      mergeListingWithValuationIdentity(
        { year: 2019, make: "honda", model: "civic", trim: "sport", region: "dallas_tx" },
        { lookup_make: null, lookup_model: null, lookup_trim: null },
      ),
    ).toMatchObject({ trim: "sport" });
  });
});

describe("buildIngestMaxbuyEvaluateBody (item 59)", () => {
  const baseListing = {
    year: 2021,
    make: "ford",
    model: "bronco",
    trim: undefined as string | undefined,
    mileage: undefined as number | undefined,
    price: 45_000,
    region: "dallas_tx" as const,
    vin: undefined as string | undefined,
  };

  const baseMmr = {
    mmrValue: 48_000,
    confidence: "medium" as const,
    rawResponse: {},
    lookupMake: "Ford",
    lookupModel: "Bronco 4D",
    lookupTrim: "4D SUV BADLANDS",
  };

  it("builds YMM body with Cox tokens from MMR result", () => {
    expect(
      buildIngestMaxbuyEvaluateBody({
        normalizedListingId: "nl-1",
        listing: baseListing,
        mmrResult: baseMmr,
      }),
    ).toEqual({
      contract_version: MAXBUY_CONTRACT_VERSION,
      year: 2021,
      make: "Ford",
      model: "Bronco 4D",
      trim: "4D SUV BADLANDS",
      asking_price: 45_000,
      region: "dallas_tx",
      normalized_listing_id: "nl-1",
    });
  });

  it("builds VIN body when listing has VIN", () => {
    expect(
      buildIngestMaxbuyEvaluateBody({
        normalizedListingId: "nl-2",
        listing: { ...baseListing, vin: "1HGCM82633A004352" },
        mmrResult: baseMmr,
      }),
    ).toEqual({
      contract_version: MAXBUY_CONTRACT_VERSION,
      vin: "1HGCM82633A004352",
      asking_price: 45_000,
      region: "dallas_tx",
      normalized_listing_id: "nl-2",
    });
  });

  it("returns null without asking price", () => {
    expect(
      buildIngestMaxbuyEvaluateBody({
        normalizedListingId: "nl-3",
        listing: { ...baseListing, price: undefined },
        mmrResult: baseMmr,
      }),
    ).toBeNull();
  });
});
