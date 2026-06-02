import { describe, expect, it } from "vitest";

import { parseParsedListingFields } from "./listing-parse";

describe("parseParsedListingFields", () => {
  it("parses ok payload", () => {
    const result = parseParsedListingFields(200, {
      ok: true,
      data: {
        listingUrl: "https://www.facebook.com/marketplace/item/1",
        source: "facebook",
        year: 2019,
        make: "toyota",
        model: "camry",
        price: 18000,
        warnings: [],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.make).toBe("toyota");
    }
  });

  it("maps ok:false parse failures", () => {
    const result = parseParsedListingFields(200, {
      ok: false,
      error: "fetch_failed",
      warnings: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("fetch_failed");
    }
  });
});
