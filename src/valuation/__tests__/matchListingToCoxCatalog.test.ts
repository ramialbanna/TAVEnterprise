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
});
