import { describe, expect, it } from "vitest";

import type { BlockedSellerReview } from "@/lib/app-api/schemas";

import {
  applyBlockedSellerQuery,
  countBlockedSellerOrigins,
  DEFAULT_QUERY,
  displaySellerName,
  filterBlockedSellers,
  queryIsFiltered,
  sortBlockedSellers,
} from "./blocked-sellers-query";

function review(partial: Partial<BlockedSellerReview>): BlockedSellerReview {
  return {
    id: partial.id ?? "bs-1",
    relatedIds: partial.relatedIds ?? [],
    sellerName: partial.sellerName ?? "randy white",
    sellerUrl: "sellerUrl" in partial ? (partial.sellerUrl ?? null) : "https://facebook.com/marketplace/profile/1",
    reason: partial.reason ?? "dealer",
    origin: partial.origin ?? "auto",
    listingCount: partial.listingCount ?? 1,
    createdAt: partial.createdAt ?? "2026-09-04T12:00:00Z",
    listings: partial.listings ?? [
      {
        id: "nl-1",
        title: "2018 Honda Civic",
        listingUrl: "https://facebook.com/marketplace/item/1",
        price: 9000,
        year: 2018,
        make: "Honda",
        model: "Civic",
        firstSeenAt: "2026-09-01T12:00:00Z",
        opportunityHref: null,
      },
    ],
  };
}

const rows: BlockedSellerReview[] = [
  review({
    id: "auto-one",
    sellerName: "randy white",
    origin: "auto",
    listingCount: 1,
    createdAt: "2026-09-06T12:00:00Z",
  }),
  review({
    id: "buyer-many",
    sellerName: "imd motors dallas",
    sellerUrl: "https://facebook.com/marketplace/profile/2",
    origin: "buyer",
    listingCount: 4,
    createdAt: "2026-09-01T12:00:00Z",
    listings: [
      {
        id: "nl-lot",
        title: "2020 Ford F-150",
        listingUrl: null,
        price: 18000,
        year: 2020,
        make: "Ford",
        model: "F-150",
        firstSeenAt: "2026-09-01T12:00:00Z",
        opportunityHref: null,
      },
    ],
  }),
  review({
    id: "name-only",
    sellerName: "jose muniz",
    sellerUrl: null,
    origin: "auto",
    listingCount: 1,
    createdAt: "2026-09-05T12:00:00Z",
    listings: [
      {
        id: "nl-name",
        title: "2016 Toyota Camry",
        listingUrl: null,
        price: 7000,
        year: 2016,
        make: "Toyota",
        model: "Camry",
        firstSeenAt: "2026-09-05T12:00:00Z",
        opportunityHref: null,
      },
    ],
  }),
];

describe("displaySellerName", () => {
  it("title-cases a name and falls back when missing", () => {
    expect(displaySellerName("randy white")).toBe("Randy White");
    expect(displaySellerName(null)).toBe("Unknown seller");
  });
});

describe("queryIsFiltered", () => {
  it("is false for the default query and true when any filter is set", () => {
    expect(queryIsFiltered(DEFAULT_QUERY)).toBe(false);
    expect(queryIsFiltered({ ...DEFAULT_QUERY, search: "honda" })).toBe(true);
    expect(queryIsFiltered({ ...DEFAULT_QUERY, origin: "auto" })).toBe(true);
  });
});

describe("filterBlockedSellers", () => {
  it("filters by origin, listing count, and profile", () => {
    expect(filterBlockedSellers(rows, { ...DEFAULT_QUERY, origin: "buyer" }).map((r) => r.id)).toEqual([
      "buyer-many",
    ]);
    expect(filterBlockedSellers(rows, { ...DEFAULT_QUERY, listings: "one" })).toHaveLength(2);
    expect(filterBlockedSellers(rows, { ...DEFAULT_QUERY, listings: "many" }).map((r) => r.id)).toEqual([
      "buyer-many",
    ]);
    expect(filterBlockedSellers(rows, { ...DEFAULT_QUERY, profile: "name_only" }).map((r) => r.id)).toEqual([
      "name-only",
    ]);
  });

  it("searches name, url, and listing title case-insensitively", () => {
    expect(filterBlockedSellers(rows, { ...DEFAULT_QUERY, search: "Randy" }).map((r) => r.id)).toEqual([
      "auto-one",
    ]);
    expect(filterBlockedSellers(rows, { ...DEFAULT_QUERY, search: "Camry" }).map((r) => r.id)).toEqual([
      "name-only",
    ]);
    expect(
      filterBlockedSellers(rows, { ...DEFAULT_QUERY, search: "marketplace/profile/2" }).map((r) => r.id),
    ).toEqual(["buyer-many"]);
  });
});

describe("sortBlockedSellers", () => {
  it("sorts newest first by default createdAt desc", () => {
    expect(sortBlockedSellers(rows, "createdAt", "desc").map((r) => r.id)).toEqual([
      "auto-one",
      "name-only",
      "buyer-many",
    ]);
  });

  it("sorts by name and listing count", () => {
    expect(sortBlockedSellers(rows, "sellerName", "asc").map((r) => r.id)).toEqual([
      "buyer-many",
      "name-only",
      "auto-one",
    ]);
    expect(sortBlockedSellers(rows, "listingCount", "desc").map((r) => r.id)[0]).toBe("buyer-many");
  });
});

describe("applyBlockedSellerQuery", () => {
  it("filters then sorts", () => {
    const result = applyBlockedSellerQuery(rows, {
      ...DEFAULT_QUERY,
      origin: "auto",
      sortKey: "createdAt",
      sortDir: "asc",
    });
    expect(result.map((r) => r.id)).toEqual(["name-only", "auto-one"]);
  });
});

describe("countBlockedSellerOrigins", () => {
  it("counts auto and buyer rows", () => {
    expect(countBlockedSellerOrigins(rows)).toEqual({ all: 3, auto: 2, buyer: 1 });
  });
});
