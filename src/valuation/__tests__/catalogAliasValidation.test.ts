import { describe, expect, it } from "vitest";

import { isCatalogAliasValid, normalizeCatalogAliasTokens } from "../catalogAliasValidation";
import type { CoxCatalogTreeRow } from "../matchListingToCoxCatalog";

const WRANGLER_ROWS: CoxCatalogTreeRow[] = [
  {
    year: 2018,
    make: "JEEP",
    model: "WRANGLER UNLIMITED V6",
    style: "4D SUV SPORT",
    searchText: "",
    variantKind: null,
  },
  {
    year: 2018,
    make: "JEEP",
    model: "WRANGLER UNLIMITED V6",
    style: "4D SUV SAHARA",
    searchText: "",
    variantKind: null,
  },
];

describe("isCatalogAliasValid", () => {
  it("accepts exact catalog tokens", () => {
    expect(
      isCatalogAliasValid(WRANGLER_ROWS, {
        canonicalMake: "JEEP",
        canonicalModel: "WRANGLER UNLIMITED V6",
        canonicalStyle: "4D SUV SPORT",
      }),
    ).toBe(true);
  });

  it("rejects invalid model names (WRANGLER UNLIMITED without variant)", () => {
    expect(
      isCatalogAliasValid(WRANGLER_ROWS, {
        canonicalMake: "jeep",
        canonicalModel: "WRANGLER UNLIMITED",
        canonicalStyle: "4D SUV SAHARA",
      }),
    ).toBe(false);
  });

  it("normalizes make to uppercase", () => {
    expect(
      normalizeCatalogAliasTokens({
        alias: "x",
        canonicalMake: "jeep",
        canonicalModel: "WRANGLER UNLIMITED V6",
        canonicalStyle: "4D SUV SPORT",
        source: "ingest_learned",
      }),
    ).toEqual({
      make: "JEEP",
      model: "WRANGLER UNLIMITED V6",
      style: "4D SUV SPORT",
    });
  });
});
