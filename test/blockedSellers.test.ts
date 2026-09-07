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
  groupBlockedSellerReviews,
  shouldPersistBlockedSeller,
  isRepeatSellerDealer,
  facebookMarketplaceProfileId,
  countLiveFacebookListingsForSellerUrl,
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

  it("does not build a name-only key", () => {
    expect(buildBlockedSellerKey(undefined, "  Big   Dealer  ")).toBeNull();
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

  it("does not match a name-only listing", () => {
    const lookup = { keys: new Set(["name:claudia gonzalez"]) };
    expect(isBlockedSeller(lookup, null, "Claudia Gonzalez")).toBe(false);
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

describe("shouldPersistBlockedSeller / repeat seller", () => {
  const url = "https://www.facebook.com/marketplace/profile/1";

  it("persists a buyer flag with a URL even on one listing", () => {
    expect(shouldPersistBlockedSeller({ sellerUrl: url, listingCount: 1, buyerFlagged: true })).toBe(true);
    expect(shouldPersistBlockedSeller({ sellerUrl: null, listingCount: 1, buyerFlagged: true })).toBe(false);
  });

  it("persists an auto dealer only after a second listing", () => {
    expect(
      shouldPersistBlockedSeller({ sellerUrl: url, listingCount: 1, dealerEvidence: true }),
    ).toBe(false);
    expect(
      shouldPersistBlockedSeller({ sellerUrl: url, listingCount: 2, dealerEvidence: true }),
    ).toBe(true);
  });

  it("treats 3+ live cars as a dealer", () => {
    expect(isRepeatSellerDealer(2)).toBe(false);
    expect(isRepeatSellerDealer(3)).toBe(true);
  });

  it("extracts the Marketplace profile id", () => {
    expect(facebookMarketplaceProfileId("https://www.facebook.com/marketplace/profile/1000526149/")).toBe(
      "1000526149",
    );
    expect(facebookMarketplaceProfileId("https://www.facebook.com/foo")).toBeNull();
  });

  it("counts distinct live listing URLs plus the current ad", async () => {
    const db = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  ilike() {
                    return {
                      gte: async () => ({
                        data: [
                          { listing_url: "https://www.facebook.com/marketplace/item/a/" },
                          { listing_url: "https://www.facebook.com/marketplace/item/b" },
                        ],
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    expect(
      await countLiveFacebookListingsForSellerUrl(
        db as never,
        "https://www.facebook.com/marketplace/profile/1",
        "https://www.facebook.com/marketplace/item/c/",
      ),
    ).toBe(3);
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
      listingCount: 2,
    });

    expect(result).toEqual({
      inserted: true,
      sellerKey: "url:https://www.facebook.com/marketplace/profile/1000526149",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "facebook",
      region: "houston_tx",
      seller_key: "url:https://www.facebook.com/marketplace/profile/1000526149",
      seller_name: "lot seller",
    });
  });

  it("refuses a name-only auto block and a one-listing auto URL", async () => {
    const db = { from() { return {}; } };
    expect(
      await upsertBlockedSeller(db as never, {
        source: "facebook",
        region: "dallas_tx",
        sellerName: "Randy White",
        reason: "dealer",
      }),
    ).toBeNull();
    expect(
      await upsertBlockedSeller(db as never, {
        source: "facebook",
        region: "dallas_tx",
        sellerUrl: "https://www.facebook.com/marketplace/profile/1",
        listingCount: 1,
        reason: "dealer",
      }),
    ).toBeNull();
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

describe("groupBlockedSellerReviews", () => {
  it("merges url and name keys and attaches listings", () => {
    const reviews = groupBlockedSellerReviews(
      [
        {
          id: "url-1",
          source: "facebook",
          region: "dallas_tx",
          seller_key: "url:https://www.facebook.com/marketplace/profile/1",
          seller_url: "https://www.facebook.com/marketplace/profile/1",
          seller_name: "imd motors dallas",
          reason: "dealer",
          flagged_by_user_id: null,
          normalized_listing_id: null,
          created_at: "2026-09-03T17:46:32Z",
        },
        {
          id: "name-1",
          source: "facebook",
          region: "dallas_tx",
          seller_key: "name:imd motors dallas",
          seller_url: null,
          seller_name: "imd motors dallas",
          reason: "dealer",
          flagged_by_user_id: null,
          normalized_listing_id: null,
          created_at: "2026-09-03T17:46:32Z",
        },
      ],
      [
        {
          id: "listing-1",
          title: "2018 F-150",
          listing_url: "https://www.facebook.com/marketplace/item/1/",
          price: 12000,
          year: 2018,
          make: "Ford",
          model: "F-150",
          seller_url: "https://www.facebook.com/marketplace/profile/1/",
          seller_name: "IMD Motors Dallas",
          first_seen_at: "2026-09-03T18:00:00Z",
        },
      ],
      new Set(["listing-1"]),
    );

    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.sellerName).toBe("imd motors dallas");
    expect(reviews[0]?.listingCount).toBe(1);
    expect(reviews[0]?.origin).toBe("auto");
    expect(reviews[0]?.listings[0]?.opportunityHref).toBe("/opportunities/listing-1");
    expect(reviews[0]?.relatedIds).toContain("name-1");
  });

  it("sorts one-listing auto blocks first", () => {
    const reviews = groupBlockedSellerReviews(
      [
        {
          id: "a",
          source: "facebook",
          region: null,
          seller_key: "name:randy white",
          seller_url: null,
          seller_name: "randy white",
          reason: "dealer",
          flagged_by_user_id: null,
          normalized_listing_id: null,
          created_at: "2026-09-04T15:48:52Z",
        },
        {
          id: "b",
          source: "facebook",
          region: null,
          seller_key: "url:https://www.facebook.com/marketplace/profile/2",
          seller_url: "https://www.facebook.com/marketplace/profile/2",
          seller_name: "mauricio cortes",
          reason: "dealer",
          flagged_by_user_id: "user-1",
          normalized_listing_id: null,
          created_at: "2026-09-03T14:00:30Z",
        },
      ],
      [
        {
          id: "l1",
          title: "Car A",
          listing_url: "https://www.facebook.com/marketplace/item/a/",
          price: 1,
          year: 2016,
          make: "Honda",
          model: "Civic",
          seller_url: null,
          seller_name: "Randy White",
          first_seen_at: "2026-09-04T00:00:00Z",
        },
        {
          id: "l2",
          title: "Car B",
          listing_url: "https://www.facebook.com/marketplace/item/b/",
          price: 2,
          year: 2019,
          make: "Ford",
          model: "F-150",
          seller_url: "https://www.facebook.com/marketplace/profile/2",
          seller_name: "Mauricio Cortes",
          first_seen_at: "2026-09-03T00:00:00Z",
        },
        {
          id: "l3",
          title: "Car C",
          listing_url: "https://www.facebook.com/marketplace/item/c/",
          price: 3,
          year: 2020,
          make: "Ford",
          model: "F-150",
          seller_url: "https://www.facebook.com/marketplace/profile/2",
          seller_name: "Mauricio Cortes",
          first_seen_at: "2026-09-03T01:00:00Z",
        },
      ],
      new Set(),
    );

    expect(reviews[0]?.sellerName).toBe("randy white");
    expect(reviews[0]?.listingCount).toBe(1);
    expect(reviews[1]?.origin).toBe("buyer");
    expect(reviews[1]?.listingCount).toBe(2);
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
