import { describe, expect, it } from "vitest";

import {
  buildListingStyleAliasKey,
  listListingStyleAliasLookupKeys,
} from "../src/persistence/mmrStyleAliases";

describe("buildListingStyleAliasKey lookup order", () => {
  it("prefers explicit trim, then title trim, then empty (documented order for lookupMmrStyleAliasWithFallback)", () => {
    expect(buildListingStyleAliasKey("jeep", "wrangler unlimited", "sport")).toBe(
      "jeep|wrangler unlimited|sport",
    );
    expect(buildListingStyleAliasKey("jeep", "wrangler unlimited", null)).toBe(
      "jeep|wrangler unlimited|",
    );
  });

  it("appends drivetrain and engine tokens after trim", () => {
    expect(buildListingStyleAliasKey("ford", "f-150", "xlt", ["4wd", "v6"])).toBe(
      "ford|f-150|xlt|4wd|v6",
    );
  });
});

describe("listListingStyleAliasLookupKeys", () => {
  it("tries explicit trim, then title trim, then empty when the listing has no axis evidence", () => {
    expect(
      listListingStyleAliasLookupKeys("jeep", "wrangler unlimited", "sport", "sahara"),
    ).toEqual([
      "jeep|wrangler unlimited|sport",
      "jeep|wrangler unlimited|sahara",
      "jeep|wrangler unlimited|",
    ]);
  });

  it("does not fall back to the short make|model|trim key when axis evidence is present", () => {
    expect(
      listListingStyleAliasLookupKeys("ford", "f-150", "xlt", "xlt", ["4wd", "v6"]),
    ).toEqual(["ford|f-150|xlt|4wd|v6"]);
  });

  it("still tries title trim with the same axes, but never an empty-trim catch-all", () => {
    expect(
      listListingStyleAliasLookupKeys("ford", "f-150", "xlt", "lariat", ["4wd", "v8"]),
    ).toEqual(["ford|f-150|xlt|4wd|v8", "ford|f-150|lariat|4wd|v8"]);
  });
});
