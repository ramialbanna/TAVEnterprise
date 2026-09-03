import { describe, expect, it } from "vitest";
import {
  applyResolvedSeller,
  resolveListingSeller,
} from "../listingSellerIdentity";

describe("resolveListingSeller (item 74)", () => {
  it("prefers payload seller over stored", () => {
    expect(
      resolveListingSeller(
        {
          sellerUrl: "https://www.facebook.com/marketplace/profile/payload/",
          sellerName: "From Payload",
        },
        {
          sellerUrl: "https://www.facebook.com/marketplace/profile/stored/",
          sellerName: "From Stored",
        },
      ),
    ).toEqual({
      sellerUrl: "https://www.facebook.com/marketplace/profile/payload/",
      sellerName: "From Payload",
    });
  });

  it("uses stored seller when the Facebook payload is empty", () => {
    expect(
      resolveListingSeller(
        { sellerUrl: null, sellerName: null },
        {
          sellerUrl: "https://www.facebook.com/marketplace/profile/100008618685090",
          sellerName: "Dakota Herrel",
        },
      ),
    ).toEqual({
      sellerUrl: "https://www.facebook.com/marketplace/profile/100008618685090",
      sellerName: "Dakota Herrel",
    });
  });

  it("keeps a stored profile URL when the payload only has a display name", () => {
    expect(
      resolveListingSeller(
        { sellerUrl: null, sellerName: "Claudia Gonzalez" },
        {
          sellerUrl: "https://www.facebook.com/marketplace/profile/61560214693807",
          sellerName: "Claudia Gonzalez",
        },
      ),
    ).toEqual({
      sellerUrl: "https://www.facebook.com/marketplace/profile/61560214693807",
      sellerName: "Claudia Gonzalez",
    });
  });

  it("does not invent a seller when both payload and stored are empty", () => {
    expect(resolveListingSeller({ sellerUrl: "  ", sellerName: "" }, null)).toEqual({
      sellerUrl: null,
      sellerName: null,
    });
  });

  it("applies stored identity onto the listing used by ingest", () => {
    const listing: { url: string; sellerUrl?: string; sellerName?: string } = {
      url: "https://www.facebook.com/marketplace/item/1/",
    };
    applyResolvedSeller(listing, {
      sellerUrl: "https://www.facebook.com/marketplace/profile/1",
      sellerName: "Seller",
    });
    expect(listing.sellerUrl).toBe("https://www.facebook.com/marketplace/profile/1");
    expect(listing.sellerName).toBe("Seller");
  });
});
