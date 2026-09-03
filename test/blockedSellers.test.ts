import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  buildBlockedSellerKey,
  hasFacebookSellerUrlForQueue,
  isBlockedSeller,
  isBlockedSellerScope,
  isFacebookMarketplaceProfileUrl,
  isPendingFacebookSellerIdentity,
  loadBlockedSellerLookup,
  normalizeSellerName,
  normalizeSellerUrl,
  upsertBlockedSeller,
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

  it("matches a name-only listing against a name key", () => {
    const lookup = { keys: new Set(["name:claudia gonzalez"]) };
    expect(isBlockedSeller(lookup, null, "Claudia Gonzalez")).toBe(true);
    expect(isBlockedSeller(lookup, null, "Someone Else")).toBe(false);
  });

  it("prefers profile URL: a live URL that is not blocked is shown even if the name is", () => {
    const lookup = { keys: new Set(["name:claudia gonzalez"]) };
    expect(
      isBlockedSeller(
        lookup,
        "https://www.facebook.com/marketplace/profile/999",
        "Claudia Gonzalez",
      ),
    ).toBe(false);
  });
});

describe("hasFacebookSellerUrlForQueue", () => {
  it("requires a seller URL before a Facebook card may enter the buyer sheet", () => {
    expect(hasFacebookSellerUrlForQueue(null)).toBe(false);
    expect(hasFacebookSellerUrlForQueue("  ")).toBe(false);
    expect(
      hasFacebookSellerUrlForQueue("https://www.facebook.com/marketplace/profile/100008618685090"),
    ).toBe(true);
  });

  it("treats Facebook without a seller URL as pending identity", () => {
    expect(isPendingFacebookSellerIdentity("facebook", null)).toBe(true);
    expect(isPendingFacebookSellerIdentity("facebook", "https://www.facebook.com/marketplace/profile/1")).toBe(
      false,
    );
    expect(isPendingFacebookSellerIdentity("craigslist", null)).toBe(false);
  });
});

describe("normalizeSellerName", () => {
  it("case-folds and collapses whitespace", () => {
    expect(normalizeSellerName("  ABC   Motors  ")).toBe("abc motors");
  });
});

describe("item 74 blocked seller scope", () => {
  it("accepts every Facebook metro, not only Dallas", () => {
    expect(isBlockedSellerScope("facebook", "dallas_tx")).toBe(true);
    expect(isBlockedSellerScope("facebook", "houston_tx")).toBe(true);
    expect(isBlockedSellerScope("facebook", "oklahoma_city_ok")).toBe(true);
    expect(isBlockedSellerScope("craigslist", "dallas_tx")).toBe(false);
  });

  it("locks seller profile hrefs to facebook.com/marketplace/profile/{id}", () => {
    expect(
      isFacebookMarketplaceProfileUrl("https://www.facebook.com/marketplace/profile/100008618685090"),
    ).toBe(true);
    expect(isFacebookMarketplaceProfileUrl("https://example.com/marketplace/profile/1")).toBe(false);
    expect(isFacebookMarketplaceProfileUrl("https://www.facebook.com/foo")).toBe(false);
  });

  it("inserts Houston Facebook sellers (unique on source + seller_key)", async () => {
    const rows: Array<Record<string, unknown>> = [];
    const db = {
      from() {
        return {
          select() {
            const filters: Record<string, string> = {};
            const builder = {
              eq(col: string, val: string) {
                filters[col] = val;
                return builder;
              },
              maybeSingle: async () => {
                const match = rows.find((row) =>
                  Object.entries(filters).every(([key, value]) => row[key] === value),
                );
                return {
                  data: match ? { id: match.id, region: match.region } : null,
                  error: null,
                };
              },
            };
            return builder;
          },
          insert(row: Record<string, unknown>) {
            rows.push({ id: `bs-${rows.length + 1}`, ...row });
            return Promise.resolve({ error: null });
          },
        };
      },
    };

    const result = await upsertBlockedSeller(db as never, {
      source: "facebook",
      region: "houston_tx",
      sellerUrl: "https://www.facebook.com/marketplace/profile/1000526149",
      sellerName: "Lot Seller",
      reason: "dealer",
    });

    expect(result).toEqual({
      inserted: true,
      sellerKey: "url:https://www.facebook.com/marketplace/profile/1000526149",
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      source: "facebook",
      region: "houston_tx",
      seller_key: "url:https://www.facebook.com/marketplace/profile/1000526149",
    });
    expect(rows[1]).toMatchObject({
      source: "facebook",
      seller_key: "name:lot seller",
      seller_name: "lot seller",
    });
  });

  it("loads Facebook keys for any metro (Houston sees Dallas first-seen rows)", async () => {
    const db = {
      from() {
        return {
          select() {
            return {
              eq: async () => ({
                data: [{ seller_key: "url:https://www.facebook.com/marketplace/profile/abc" }],
                error: null,
              }),
            };
          },
        };
      },
    };
    const lookup = await loadBlockedSellerLookup(db as never, "facebook", "houston_tx");
    expect(lookup?.keys.has("url:https://www.facebook.com/marketplace/profile/abc")).toBe(true);
  });
});

describe("item 74 empty payload does not wipe stored seller", () => {
  it("upsert_normalized_listing COALESCE keeps seller_url", () => {
    const sql = readFileSync(
      path.join(__dirname, "../supabase/migrations/0067_normalized_listing_description.sql"),
      "utf8",
    );
    expect(sql).toMatch(/seller_url\s+=\s+COALESCE\(p_seller_url,\s+seller_url\)/);
    expect(sql).toMatch(/seller_name\s+=\s+COALESCE\(p_seller_name,\s+seller_name\)/);
  });
});
