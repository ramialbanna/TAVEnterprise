import { describe, expect, it } from "vitest";
import { listingMirrorPhotoUrls, upgradeFacebookListingPhotoUrl } from "./listing-photo";

describe("upgradeFacebookListingPhotoUrl", () => {
  it("removes only the ctp query param", () => {
    const input = "https://scontent.xx.fbcdn.net/v/t.jpg?stp=keep_me&ctp=s261x260&oe=SIG";
    expect(upgradeFacebookListingPhotoUrl(input)).toBe(
      "https://scontent.xx.fbcdn.net/v/t.jpg?stp=keep_me&oe=SIG",
    );
  });

  it("leaves URLs without ctp unchanged", () => {
    const url = "https://cdn.example/car.jpg?stp=p261x260";
    expect(upgradeFacebookListingPhotoUrl(url)).toBe(url);
  });
});

describe("listingMirrorPhotoUrls", () => {
  it("strips ctp and dedupes thumbnail against full-res", () => {
    const full = "https://scontent.xx.fbcdn.net/v/t.jpg?stp=keep_me&oe=SIG";
    expect(listingMirrorPhotoUrls([`${full}&ctp=s261x260`, ` ${full} `])).toEqual([full]);
  });
});
