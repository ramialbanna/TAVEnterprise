import { describe, expect, it } from "vitest";
import {
  INTERIM_CATALOG_DISCLAIMER,
  getYears,
  getMakes,
  getModels,
  getStyles,
} from "./interim-catalog";

describe("interim-catalog (bounded validated sample — NOT live Manheim)", () => {
  it("exposes a disclaimer that says it is not the live catalog", () => {
    expect(INTERIM_CATALOG_DISCLAIMER.toLowerCase()).toContain("not");
    expect(INTERIM_CATALOG_DISCLAIMER.toLowerCase()).toContain("manheim");
    expect(INTERIM_CATALOG_DISCLAIMER.toLowerCase()).toContain("vin");
  });

  it("years are exactly 2027..2014 descending", () => {
    expect(getYears()).toEqual([
      2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014,
    ]);
  });

  it("makes for a year are the validated slice, alphabetical", () => {
    const makes = getMakes(2026);
    expect(makes).toContain("CADILLAC");
    expect([...makes]).toEqual([...makes].sort());
  });

  it("2026 CADILLAC models include ESCALADE IQ and only validated entries", () => {
    const models = getModels(2026, "CADILLAC");
    expect(models).toContain("ESCALADE IQ");
    expect(models).toContain("XT5 FWD V6");
    expect(models).not.toContain("ESCALADE IQ 2WD");
  });

  it("2026 CADILLAC ESCALADE IQ styles are exactly the 4 validated", () => {
    expect(getStyles(2026, "CADILLAC", "ESCALADE IQ")).toEqual([
      "4D SUV LUXURY",
      "4D SUV PREMIUM LUXURY",
      "4D SUV PREMIUM SPORT",
      "4D SUV SPORT",
    ]);
  });

  it("validated extra example paths exist (Ford F250, Subaru BRZ)", () => {
    expect(getModels(2019, "FORD")).toContain("F250 4WD V8 TDSL");
    expect(getStyles(2019, "FORD", "F250 4WD V8 TDSL")).toContain(
      "CREW CAB 6.7L PLATINUM",
    );
    expect(getModels(2016, "SUBARU")).toContain("BRZ");
    expect(getStyles(2016, "SUBARU", "BRZ")).toContain("2D COUPE LIMITED");
  });

  it("unknown / unvalidated combinations return [] (never invented)", () => {
    expect(getMakes(2027)).toEqual([]);
    expect(getModels(2026, "FERRARI")).toEqual([]);
    expect(getStyles(2026, "CADILLAC", "LYRIQ 2WD")).toEqual([]);
  });

  it("getModels preserves Manheim source order (not alphabetical)", () => {
    expect(getModels(2026, "CADILLAC")).toEqual([
      "ESCALADE 4WD",
      "ESCALADE AWD",
      "ESCALADE ESV 2WD",
      "ESCALADE ESV 4WD",
      "ESCALADE ESV AWD",
      "ESCALADE IQ",
      "ESCALADE IQL",
      "LYRIQ 2WD",
      "LYRIQ AWD",
      "OPTIQ",
      "VISTIQ",
      "XT5 AWD 4C",
      "XT5 AWD V6",
      "XT5 FWD 4C",
      "XT5 FWD V6",
    ]);
  });
});
