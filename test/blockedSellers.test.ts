import { describe, it, expect } from "vitest";
import {
  buildBlockedSellerKey,
  isBlockedSeller,
  normalizeSellerName,
  normalizeSellerUrl,
} from "../src/persistence/blockedSellers";

describe("blockedSellers normalization", () => {
  it("normalizes Facebook profile URLs", () => {
    expect(normalizeSellerUrl("HTTPS://WWW.Facebook.com/marketplace/profile/123456/?ref=foo#x")).toBe(
      "https://www.facebook.com/marketplace/profile/123456",
    );
  });

  it("builds url-prefixed seller keys before name fallback", () => {
    expect(
      buildBlockedSellerKey("https://facebook.com/marketplace/profile/abc", "Dealer Name"),
    ).toBe("url:https://facebook.com/marketplace/profile/abc");
  });

  it("falls back to normalized seller name when URL missing", () => {
    expect(buildBlockedSellerKey(undefined, "  Big   Dealer  ")).toBe("name:big dealer");
  });

  it("matches blocked sellers by key set", () => {
    const lookup = {
      keys: new Set(["url:https://www.facebook.com/marketplace/profile/abc"]),
    };
    expect(
      isBlockedSeller(lookup, "https://www.facebook.com/marketplace/profile/abc/", null),
    ).toBe(true);
    expect(isBlockedSeller(lookup, "https://facebook.com/other", "abc")).toBe(false);
  });
});

describe("normalizeSellerName", () => {
  it("case-folds and collapses whitespace", () => {
    expect(normalizeSellerName("  ABC   Motors  ")).toBe("abc motors");
  });
});
