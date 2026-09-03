import { describe, it, expect } from "vitest";
import {
  extractListingImageUrls,
  listingMirrorPhotoUrls,
  selectSellerClassifyImageUrls,
  upgradeFacebookListingPhotoUrl,
} from "../src/apify/listingMedia";

describe("extractListingImageUrls", () => {
  it("collects primaryImage and primary_listing_photo.uri", () => {
    const urls = extractListingImageUrls({
      primaryImage: "https://cdn.example/a.jpg",
      primary_listing_photo: { image: { uri: "https://cdn.example/b.jpg" } },
    });
    expect(urls).toEqual(["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"]);
  });

  it("merges extraListingData.images and extraListingMedia", () => {
    const urls = extractListingImageUrls({
      primaryImage: "https://cdn.example/hero.jpg",
      extraListingData: {
        images: ["https://cdn.example/1.jpg", { image: { uri: "https://cdn.example/2.jpg" } }],
      },
      extraListingMedia: [{ url: "https://cdn.example/3.jpg" }],
    });
    expect(urls).toEqual([
      "https://cdn.example/hero.jpg",
      "https://cdn.example/1.jpg",
      "https://cdn.example/2.jpg",
      "https://cdn.example/3.jpg",
    ]);
  });

  it("dedupes identical URLs", () => {
    const urls = extractListingImageUrls({
      primaryImage: "https://cdn.example/same.jpg",
      images: ["https://cdn.example/same.jpg"],
    });
    expect(urls).toEqual(["https://cdn.example/same.jpg"]);
  });

  it("strips Facebook ctp thumbnail crop and dedupes against the full-res URL", () => {
    const base =
      "https://scontent.xx.fbcdn.net/v/t.jpg?stp=c0.169.1536.1536a_dst-jpg_tt6&cstp=mx1536x1536&_nc_cat=105&oe=ABC";
    const urls = extractListingImageUrls({
      primaryImage: `${base}&ctp=s261x260`,
      images: [base],
    });
    expect(urls).toEqual([base]);
    expect(urls[0]).not.toMatch(/ctp=/);
  });
});

describe("listingMirrorPhotoUrls", () => {
  it("upgrades stored thumbnails for the detail mirror", () => {
    const full = "https://scontent.xx.fbcdn.net/v/t.jpg?stp=keep_me&oe=SIG";
    expect(listingMirrorPhotoUrls([`${full}&ctp=s261x260`, full])).toEqual([full]);
  });
});

describe("upgradeFacebookListingPhotoUrl", () => {
  it("removes only the ctp query param", () => {
    const input =
      "https://scontent.xx.fbcdn.net/v/t.jpg?stp=keep_me&ctp=s261x260&oe=SIG";
    expect(upgradeFacebookListingPhotoUrl(input)).toBe(
      "https://scontent.xx.fbcdn.net/v/t.jpg?stp=keep_me&oe=SIG",
    );
  });

  it("leaves URLs without ctp unchanged", () => {
    const url = "https://cdn.example/car.jpg?stp=p261x260";
    expect(upgradeFacebookListingPhotoUrl(url)).toBe(url);
  });
});

describe("selectSellerClassifyImageUrls", () => {
  it("returns at most one upgraded HTTPS image", () => {
    expect(
      selectSellerClassifyImageUrls([
        "https://cdn.example/a.jpg?ctp=s261x260",
        "https://cdn.example/b.jpg",
        "http://insecure.example/c.jpg",
      ]),
    ).toEqual(["https://cdn.example/a.jpg"]);
  });
});
