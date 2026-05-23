import { describe, it, expect } from "vitest";
import {
  buildManualListingTitle,
  detectListingSource,
  normalizeListingUrl,
} from "../src/manual/listingSource";

describe("normalizeListingUrl", () => {
  it("lowercases the host and strips fragments", () => {
    expect(normalizeListingUrl("HTTPS://Facebook.com/marketplace/item/123#top"))
      .toBe("https://facebook.com/marketplace/item/123");
  });
});

describe("detectListingSource", () => {
  it("detects facebook marketplace URLs", () => {
    expect(detectListingSource("https://www.facebook.com/marketplace/item/123")).toBe("facebook");
  });

  it("detects craigslist URLs", () => {
    expect(detectListingSource("https://dallas.craigslist.org/cto/d123.html")).toBe("craigslist");
  });

  it("returns null for unknown hosts", () => {
    expect(detectListingSource("https://example.com/car/123")).toBeNull();
  });
});

describe("buildManualListingTitle", () => {
  it("uses year/make/model when present", () => {
    expect(buildManualListingTitle({
      listingUrl: "https://facebook.com/item/1",
      year: 2020,
      make: "toyota",
      model: "camry",
    })).toBe("2020 toyota camry");
  });

  it("falls back to the URL host", () => {
    expect(buildManualListingTitle({
      listingUrl: "https://facebook.com/item/1",
    })).toBe("facebook.com");
  });
});
