import { describe, it, expect } from "vitest";
import {
  isFSeriesListingModel,
  resolveFSeriesTrimAxisAlias,
} from "../src/valuation/fSeriesTrimAxisAliases";
import type { CoxCatalogTreeRow } from "../src/valuation/matchListingToCoxCatalog";
import type { ProvenBookableCombo } from "../src/valuation/provenBookable";

const row = (
  model: string,
  style: string,
  make = "FORD",
  year = 2018,
): CoxCatalogTreeRow => ({
  year,
  make,
  model,
  style,
  searchText: `${model} ${style}`,
  variantKind: null,
});

describe("isFSeriesListingModel", () => {
  it("matches common Facebook model spellings", () => {
    expect(isFSeriesListingModel("f-150")).toBe(true);
    expect(isFSeriesListingModel("F-250")).toBe(true);
    expect(isFSeriesListingModel("f150")).toBe(true);
    expect(isFSeriesListingModel("Camry")).toBe(false);
  });
});

describe("resolveFSeriesTrimAxisAlias", () => {
  const catalogRows: CoxCatalogTreeRow[] = [
    row("F150 4WD V6", "CREW CAB 3.5L XLT"),
    row("F150 4WD V6", "CREW CAB 3.5L LARIAT"),
    row("F150 2WD V6", "CREW CAB 3.5L XLT"),
    row("F150 4WD V8 FFV", "CREW CAB 5.0L XLT"),
    row("F250 4WD V8 FFV", "CREW CAB 6.2L LARIAT"),
  ];

  const provenCombos: ProvenBookableCombo[] = [
    { make: "FORD", model: "F150 4WD V6", style: "CREW CAB 3.5L XLT" },
    { make: "FORD", model: "F150 4WD V6", style: "CREW CAB 3.5L LARIAT" },
    { make: "FORD", model: "F150 4WD V8 FFV", style: "CREW CAB 5.0L XLT" },
    { make: "FORD", model: "F250 4WD V8 FFV", style: "CREW CAB 6.2L LARIAT" },
  ];

  it("maps f-150 xlt with 4wd v6 crew to the booked 4WD V6 crew XLT style", () => {
    expect(
      resolveFSeriesTrimAxisAlias({
        model: "f-150",
        trim: "xlt",
        axisTokens: ["4wd", "v6", "crew"],
        catalogRows,
        provenCombos,
      }),
    ).toEqual({
      make: "FORD",
      model: "F150 4WD V6",
      style: "CREW CAB 3.5L XLT",
    });
  });

  it("maps f-150 lariat with 4wd v6 crew to the LARIAT style", () => {
    expect(
      resolveFSeriesTrimAxisAlias({
        model: "f-150",
        trim: "lariat",
        axisTokens: ["4wd", "v6", "crew"],
        catalogRows,
        provenCombos,
      }),
    ).toEqual({
      make: "FORD",
      model: "F150 4WD V6",
      style: "CREW CAB 3.5L LARIAT",
    });
  });

  it("returns null when axis evidence is missing", () => {
    expect(
      resolveFSeriesTrimAxisAlias({
        model: "f-150",
        trim: "xlt",
        axisTokens: [],
        catalogRows,
        provenCombos,
      }),
    ).toBeNull();
  });

  it("returns null when trim is not a Ford truck trim word", () => {
    expect(
      resolveFSeriesTrimAxisAlias({
        model: "f-150",
        trim: "super duty",
        axisTokens: ["4wd", "v6", "crew"],
        catalogRows,
        provenCombos,
      }),
    ).toBeNull();
  });

  it("returns null when two candidates tie on axis score", () => {
    const tiedCatalog = [
      row("F150 4WD V6", "CREW CAB 3.5L XLT"),
      row("F150 4WD V8 FFV", "CREW CAB 5.0L XLT"),
    ];
    const tiedProven: ProvenBookableCombo[] = [
      { make: "FORD", model: "F150 4WD V6", style: "CREW CAB 3.5L XLT" },
      { make: "FORD", model: "F150 4WD V8 FFV", style: "CREW CAB 5.0L XLT" },
    ];

    expect(
      resolveFSeriesTrimAxisAlias({
        model: "f-150",
        trim: "xlt",
        axisTokens: ["4wd", "crew"],
        catalogRows: tiedCatalog,
        provenCombos: tiedProven,
      }),
    ).toBeNull();
  });

  it("prefers v8 evidence over v6 when both are booked", () => {
    expect(
      resolveFSeriesTrimAxisAlias({
        model: "f-150",
        trim: "xlt",
        axisTokens: ["4wd", "v8", "crew"],
        catalogRows,
        provenCombos,
      }),
    ).toEqual({
      make: "FORD",
      model: "F150 4WD V8 FFV",
      style: "CREW CAB 5.0L XLT",
    });
  });
});
