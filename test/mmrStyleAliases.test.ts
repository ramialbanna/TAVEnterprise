import { describe, expect, it } from "vitest";

import { buildListingStyleAliasKey } from "../src/persistence/mmrStyleAliases";

describe("buildListingStyleAliasKey lookup order", () => {
  it("prefers explicit trim, then title trim, then empty (documented order for lookupMmrStyleAliasWithFallback)", () => {
    expect(buildListingStyleAliasKey("jeep", "wrangler unlimited", "sport")).toBe(
      "jeep|wrangler unlimited|sport",
    );
    expect(buildListingStyleAliasKey("jeep", "wrangler unlimited", null)).toBe(
      "jeep|wrangler unlimited|",
    );
  });
});
