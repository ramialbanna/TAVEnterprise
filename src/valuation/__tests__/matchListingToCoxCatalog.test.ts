import { describe, expect, it } from "vitest";
import {
  buildCoxCatalogSearchText,
  matchListingToCoxCatalog,
  type CoxCatalogTreeRow,
} from "../matchListingToCoxCatalog";

const rows: CoxCatalogTreeRow[] = [
  {
    year: 2016,
    make: "Honda",
    model: "CR-V AWD",
    style: "4D Sport Utility EX-L",
    searchText: buildCoxCatalogSearchText(2016, "Honda", "CR-V AWD", "4D Sport Utility EX-L"),
    variantKind: "drivetrain",
  },
  {
    year: 2016,
    make: "Honda",
    model: "CR-V FWD",
    style: "4D Sport Utility LX",
    searchText: buildCoxCatalogSearchText(2016, "Honda", "CR-V FWD", "4D Sport Utility LX"),
    variantKind: "drivetrain",
  },
];

describe("matchListingToCoxCatalog", () => {
  it("auto-selects the best offline Cox path when trim evidence is strong", () => {
    const result = matchListingToCoxCatalog(
      {
        year: 2016,
        make: "Honda",
        model: "CR-V",
        trim: "EX-L",
        title: "2016 Honda CR-V EX-L Sport Utility 4D",
      },
      rows,
    );

    expect(result?.autoLookup).toBe(true);
    expect(result?.make).toBe("Honda");
    expect(result?.model).toBe("CR-V AWD");
    expect(result?.style).toBe("4D Sport Utility EX-L");
    expect(result?.suggestions.length).toBeGreaterThan(0);
  });

  it("returns suggestions without auto lookup when evidence is weak", () => {
    const result = matchListingToCoxCatalog(
      {
        year: 2016,
        make: "Honda",
        model: "CR-V",
        trim: "Sport Utility",
        title: "2016 Honda CR-V Sport Utility 4D",
      },
      rows,
    );

    expect(result?.autoLookup).toBe(false);
    expect(result?.make).toBeNull();
    expect(result?.suggestions).toHaveLength(2);
  });

  it("breaks score ties using style token overlap (§55)", () => {
    const tiedRows: CoxCatalogTreeRow[] = [
      {
        year: 2016,
        make: "Honda",
        model: "CR-V AWD",
        style: "4D Sport Utility EX-L",
        searchText: "",
        variantKind: "drivetrain",
      },
      {
        year: 2016,
        make: "Honda",
        model: "CR-V FWD",
        style: "4D Sport Utility LX",
        searchText: "",
        variantKind: "drivetrain",
      },
    ];

    const result = matchListingToCoxCatalog(
      {
        year: 2016,
        make: "Honda",
        model: "CR-V",
        trim: "LX",
        title: "2016 Honda CR-V LX Sport Utility 4D",
      },
      tiedRows,
    );

    expect(result?.autoLookup).toBe(true);
    expect(result?.model).toBe("CR-V FWD");
    expect(result?.style).toContain("LX");
  });

  it("applies duplicate-make parser garbage penalty (§55)", () => {
    const garbageRows: CoxCatalogTreeRow[] = [
      {
        year: 2016,
        make: "Honda",
        model: "HR-V",
        style: "4D Sport Utility EX",
        searchText: "",
        variantKind: null,
      },
      {
        year: 2016,
        make: "Honda",
        model: "HR-V",
        style: "4D Sport Utility LX",
        searchText: "",
        variantKind: null,
      },
    ];

    const clean = matchListingToCoxCatalog(
      {
        year: 2016,
        make: "Honda",
        model: "HR-V",
        trim: "EX",
        title: "2016 Honda HR-V EX Sport Utility 4D",
      },
      garbageRows,
    );

    const garbage = matchListingToCoxCatalog(
      {
        year: 2016,
        make: "Honda",
        model: "HR-V",
        trim: "EX",
        title: "2016 Honda Honda HR-V EX",
      },
      garbageRows,
    );

    expect(clean?.autoLookup).toBe(true);
    expect(garbage).toBeNull();
  });
});
