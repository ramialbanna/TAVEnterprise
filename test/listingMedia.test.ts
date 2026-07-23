import { describe, it, expect } from "vitest";
import { extractListingImageUrls } from "../src/apify/listingMedia";

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
});
