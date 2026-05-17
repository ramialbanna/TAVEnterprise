// INTERIM CATALOG — limited validated sample, NOT the live Manheim catalog.
//
// Source: Issue #44 + the 2026-05-17 Manheim MMR screenshots ONLY. Every
// value below was directly observed; nothing is inferred or invented. This
// exists solely so the Manheim-style Year/Make/Model/Style row can render
// and cascade for demonstrable/validated cases. Selecting a Y/M/M/S here
// forms a vehicle title ONLY — it triggers no valuation and calls no API.
// Use a VIN for an actual value. Tracked for removal by the follow-up
// issue (live metadata + browser-safe YMM valuation endpoint).

export const INTERIM_CATALOG_DISCLAIMER =
  "Year/Make/Model/Style is a limited validated sample, not the live Manheim catalog. YMM valuation is not available — enter a VIN for a value.";

const YEARS = [
  2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014,
] as const;

type ModelMap = Record<string, string[]>;
type MakeMap = Record<string, ModelMap>;
const CATALOG: Record<number, MakeMap> = {
  2026: {
    CADILLAC: {
      "ESCALADE 4WD": [],
      "ESCALADE AWD": [],
      "ESCALADE ESV 2WD": [],
      "ESCALADE ESV 4WD": [],
      "ESCALADE ESV AWD": [],
      "ESCALADE IQ": [
        "4D SUV LUXURY",
        "4D SUV PREMIUM LUXURY",
        "4D SUV PREMIUM SPORT",
        "4D SUV SPORT",
      ],
      "ESCALADE IQL": [],
      "LYRIQ 2WD": [],
      "LYRIQ AWD": [],
      OPTIQ: [],
      VISTIQ: [],
      "XT5 AWD 4C": [],
      "XT5 AWD V6": [],
      "XT5 FWD 4C": [],
      "XT5 FWD V6": [],
    },
  },
  2019: {
    FORD: { "F250 4WD V8 TDSL": ["CREW CAB 6.7L PLATINUM"] },
  },
  2016: {
    SUBARU: { BRZ: ["2D COUPE LIMITED"] },
  },
};

export function getYears(): number[] {
  return [...YEARS];
}

// Makes are alphabetized for scanability; models preserve Manheim source
// order (do not add .sort() to getModels — cascade order is a UX contract).
export function getMakes(year: number): string[] {
  return Object.keys(CATALOG[year] ?? {}).sort();
}

export function getModels(year: number, make: string): string[] {
  return Object.keys(CATALOG[year]?.[make] ?? {});
}

export function getStyles(year: number, make: string, model: string): string[] {
  return [...(CATALOG[year]?.[make]?.[model] ?? [])];
}
