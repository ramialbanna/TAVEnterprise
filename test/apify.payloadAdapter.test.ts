import { describe, it, expect } from "vitest";
import { mapRaidrApiItem } from "../src/apify/payloadAdapter";
import { parseFacebookItem, detectFacebookDrift } from "../src/sources/facebook";
import type { RegionKey } from "../src/types/domain";

const CTX = {
  region: "dallas_tx" as RegionKey,
  scrapedAt: "2026-05-14T18:25:00.000Z",
  sourceRunId: "test-run",
};

// Representative raidr-api item — actual shape observed in dataset
// LEbtvd0wuNiSZ1DDH from run V17qPHYuTwc59QbF6, with the seller field
// added so the unit test exercises every translation rule.
function raidrItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    __typename: "MarketplaceListing",
    __isMarketplaceListingRenderable: "MarketplaceListing",
    id: "1686857085840236",
    marketplace_listing_title: "2020 Toyota Camry SE 62k miles",
    custom_title: "2020 Toyota Camry SE 62k miles",
    listing_price: {
      amount: "18500.00",
      amount_with_offset_in_currency: "1850000",
      formatted_amount: "$18,500",
    },
    marketplace_listing_seller: { __typename: "User", id: "X", name: "Dealer Joe" },
    listing_date: 1778443122,
    listing_date_ms: 1778443122000,
    location: { reverse_geocode: { city: "Boerne", state: "TX" } },
    primary_listing_photo: { image: { uri: "https://scontent…" } },
    is_live: true,
    is_pending: false,
    is_sold: false,
    if_gk_just_listed_tag_on_search_feed: false,
    delivery_types: [],
    origin_group: "BROWSE_FEED",
    _fetchedAt: "2026-05-14T18:24:50.000Z",
    ...overrides,
  };
}

// ── URL construction ──────────────────────────────────────────────────────────

describe("mapRaidrApiItem — URL", () => {
  it("constructs facebook.com/marketplace/item/<id>/ URL from id", () => {
    const out = mapRaidrApiItem(raidrItem()) as Record<string, unknown>;
    expect(out.url).toBe("https://www.facebook.com/marketplace/item/1686857085840236/");
  });

  it("leaves url undefined when id is missing", () => {
    const item = raidrItem();
    delete item.id;
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.url).toBeUndefined();
  });

  it("preserves an existing url field — does not overwrite", () => {
    const item = raidrItem({ url: "https://www.facebook.com/marketplace/item/9999/" });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.url).toBe("https://www.facebook.com/marketplace/item/9999/");
  });

  it("preserves an existing listingUrl alias — does not overwrite", () => {
    const item = raidrItem({ listingUrl: "https://m.facebook.com/marketplace/item/9999/" });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.url).toBeUndefined(); // not added; existing alias respected
  });

  it("URL-encodes the id when constructing", () => {
    const item = raidrItem({ id: "abc/xyz?weird" });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.url).toBe("https://www.facebook.com/marketplace/item/abc%2Fxyz%3Fweird/");
  });
});

// ── Title fallback ────────────────────────────────────────────────────────────

describe("mapRaidrApiItem — title", () => {
  it("prefers marketplace_listing_title over custom_title when both present", () => {
    const item = raidrItem({ marketplace_listing_title: "MLT", custom_title: "CT" });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.title).toBe("MLT");
  });

  it("falls back to custom_title when marketplace_listing_title is missing", () => {
    const item = raidrItem();
    delete item.marketplace_listing_title;
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.title).toBe("2020 Toyota Camry SE 62k miles"); // custom_title
  });

  it("leaves title undefined when both sources are absent", () => {
    const item = raidrItem();
    delete item.marketplace_listing_title;
    delete item.custom_title;
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.title).toBeUndefined();
  });

  it("preserves an existing title field — does not overwrite", () => {
    const item = raidrItem({ title: "Already-flat title" });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.title).toBe("Already-flat title");
  });
});

// ── Price extraction ──────────────────────────────────────────────────────────

describe("mapRaidrApiItem — price", () => {
  it("extracts listing_price.amount as the price string", () => {
    const out = mapRaidrApiItem(raidrItem()) as Record<string, unknown>;
    expect(out.price).toBe("18500.00");
  });

  it("falls back to listing_price.formatted_amount when amount missing", () => {
    const item = raidrItem({
      listing_price: { formatted_amount: "$22,500" },
    });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.price).toBe("$22,500");
  });

  it("leaves price undefined when listing_price is absent", () => {
    const item = raidrItem();
    delete item.listing_price;
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.price).toBeUndefined();
  });

  it("does not override an existing flat-shape price scalar", () => {
    const item = raidrItem({ price: 19500 });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.price).toBe(19500); // scalar preserved, not replaced from nested
  });
});

// ── Posted-at conversion ──────────────────────────────────────────────────────

describe("mapRaidrApiItem — postedAt", () => {
  it("converts listing_date_ms to an ISO timestamp", () => {
    const out = mapRaidrApiItem(raidrItem()) as Record<string, unknown>;
    expect(out.postedAt).toBe(new Date(1778443122000).toISOString());
  });

  it("falls back to listing_date (epoch seconds) when listing_date_ms absent", () => {
    const item = raidrItem();
    delete item.listing_date_ms;
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.postedAt).toBe(new Date(1778443122 * 1000).toISOString());
  });

  it("rejects implausible listing_date_ms values", () => {
    const item = raidrItem({ listing_date_ms: -1 });
    delete item.listing_date;
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.postedAt).toBeUndefined();
  });

  it("rejects non-numeric listing_date_ms", () => {
    const item = raidrItem({ listing_date_ms: "not a number" });
    delete item.listing_date;
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.postedAt).toBeUndefined();
  });
});

// ── Seller name ───────────────────────────────────────────────────────────────

describe("mapRaidrApiItem — sellerName", () => {
  it("extracts marketplace_listing_seller.name as sellerName", () => {
    const out = mapRaidrApiItem(raidrItem()) as Record<string, unknown>;
    expect(out.sellerName).toBe("Dealer Joe");
  });

  it("leaves sellerName undefined when marketplace_listing_seller is null", () => {
    const item = raidrItem({ marketplace_listing_seller: null });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.sellerName).toBeUndefined();
  });

  it("preserves an existing flat sellerName", () => {
    const item = raidrItem({ sellerName: "Existing Name" });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.sellerName).toBe("Existing Name");
  });
});

// ── Mileage / VIN tolerated as absent ─────────────────────────────────────────

describe("mapRaidrApiItem — mileage / vin tolerated", () => {
  it("does not synthesise mileage when absent (adapter parses from title)", () => {
    const out = mapRaidrApiItem(raidrItem()) as Record<string, unknown>;
    expect(out.mileage).toBeUndefined();
  });

  it("does not synthesise vin when absent (Facebook listings rarely have VIN)", () => {
    const out = mapRaidrApiItem(raidrItem()) as Record<string, unknown>;
    expect(out.vin).toBeUndefined();
  });
});

// ── Preservation of original keys ─────────────────────────────────────────────

describe("mapRaidrApiItem — preserves original keys", () => {
  it("keeps every raidr-api field on the output (for drift detection / audit)", () => {
    const item = raidrItem();
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    for (const k of Object.keys(item)) {
      expect(out).toHaveProperty(k);
    }
    // id specifically — adapter uses extractSourceListingId
    expect(out.id).toBe("1686857085840236");
  });

  it("returns non-object input as-is", () => {
    expect(mapRaidrApiItem(null)).toBeNull();
    expect(mapRaidrApiItem("string")).toBe("string");
    expect(mapRaidrApiItem(42)).toBe(42);
    expect(mapRaidrApiItem([1, 2])).toEqual([1, 2]);
  });
});

// ── End-to-end: mapped raidr-api item → Facebook adapter ──────────────────────

describe("mapped raidr-api item is consumable by parseFacebookItem", () => {
  it("toyota camry: passes adapter (no missing_identifier) and normalizes year/make/model", () => {
    const mapped = mapRaidrApiItem(
      raidrItem({ marketplace_listing_title: "2020 Toyota Camry SE 62k miles" }),
    );
    const r = parseFacebookItem(mapped, CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.year).toBe(2020);
    expect(r.listing.make).toBe("toyota");
    expect(r.listing.model).toBe("camry");
    expect(r.listing.mileage).toBe(62_000);
    expect(r.listing.url).toBe(
      "https://www.facebook.com/marketplace/item/1686857085840236/",
    );
    // sellerName is mapped onto the raw item by mapRaidrApiItem but is NOT
    // part of NormalizedListingInput as emitted by parseFacebookItem today
    // — adapter does not extract seller fields into the listing. Asserted
    // at the mapper level in the "sellerName" describe block above.
  });

  it("aircraft listing with a current-era year: clears missing_identifier gate, rejects at missing_ymm", () => {
    // Variant of the real V17qPHYuTwc59QbF6 dataset item, with a year that
    // passes the adapter's year-validity gate (2000-2035) so the make
    // matcher is exercised. Piper is not a canonical make in
    // src/sources/facebook.ts, so the adapter should reject with
    // missing_ymm rather than the upstream missing_identifier failure that
    // exists without this mapper.
    const mapped = mapRaidrApiItem(
      raidrItem({
        marketplace_listing_title: "2022 Piper cherokee 140",
        custom_title: "2022 Piper cherokee 140",
        listing_price: { amount: "85000.00", formatted_amount: "$85,000" },
      }),
    );
    const r = parseFacebookItem(mapped, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing_ymm");
  });

  it("1966 Piper item (real run dataset): now rejects at invalid_year rather than missing_identifier", () => {
    // Direct regression: the exact dataset item from run V17qPHYuTwc59QbF6
    // previously failed at extractUrl with missing_identifier. With the
    // mapper in place, the adapter sees a valid URL and parses the title,
    // then rejects at the year-validity gate (year < 2000).
    const mapped = mapRaidrApiItem(
      raidrItem({
        marketplace_listing_title: "1966 Piper cherokee 140",
        custom_title: "1966 Piper cherokee 140",
        listing_price: { amount: "85000.00", formatted_amount: "$85,000" },
      }),
    );
    const r = parseFacebookItem(mapped, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid_year");
  });
});

// ── Detail-mode fields (extraListingData) ─────────────────────────────────────

function detailItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = raidrItem();
  return {
    ...base,
    custom_sub_titles_with_rendering_flags: [{ subtitle: "64K miles" }],
    extraListingData: {
      title: "2020 Toyota Camry SE",
      description: "Clean title, runs great. New tires. No issues.",
      vehicle_odometer_data: { unit: "MILES", value: 62000 },
      vehicle_identification_number: null,
      vehicle_make_display_name: "Toyota",
      vehicle_model_display_name: "Camry",
      vehicle_trim_display_name: "SE Sedan 4D",
      vehicle_transmission_type: "AUTOMATIC",
      vehicle_fuel_type: "GASOLINE",
      vehicle_condition: null,
      location: { city: "Plano", state: "TX", postal_code: "75093" },
    },
    ...overrides,
  };
}

describe("mapRaidrApiItem — detail-mode mileage", () => {
  it("extracts mileage from extraListingData.vehicle_odometer_data.value when unit is MILES", () => {
    const out = mapRaidrApiItem(detailItem()) as Record<string, unknown>;
    expect(out.mileage).toBe(62000);
  });

  it("ignores vehicle_odometer_data when unit is not MILES (e.g. KM)", () => {
    const item = detailItem({
      extraListingData: {
        vehicle_odometer_data: { unit: "KILOMETRES", value: 100000 },
      },
    });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.mileage).toBeUndefined();
  });

  it("ignores vehicle_odometer_data when value is missing or non-numeric", () => {
    const item = detailItem({
      extraListingData: { vehicle_odometer_data: { unit: "MILES", value: null } },
    });
    expect((mapRaidrApiItem(item) as Record<string, unknown>).mileage).toBeUndefined();

    const item2 = detailItem({
      extraListingData: { vehicle_odometer_data: { unit: "MILES" } },
    });
    expect((mapRaidrApiItem(item2) as Record<string, unknown>).mileage).toBeUndefined();
  });

  it("preserves an existing flat mileage scalar", () => {
    const item = detailItem({ mileage: 50000 });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.mileage).toBe(50000);
  });
});

describe("mapRaidrApiItem — detail-mode VIN", () => {
  it("extracts vin from extraListingData.vehicle_identification_number when 17-char standard VIN", () => {
    const item = detailItem({
      extraListingData: {
        vehicle_identification_number: "1HGCM82633A004352",
      },
    });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.vin).toBe("1HGCM82633A004352");
  });

  it("uppercases lowercase VINs", () => {
    const item = detailItem({
      extraListingData: {
        vehicle_identification_number: "1hgcm82633a004352",
      },
    });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.vin).toBe("1HGCM82633A004352");
  });

  it("ignores malformed VINs (wrong length, disallowed chars)", () => {
    const tooShort = detailItem({ extraListingData: { vehicle_identification_number: "1HGCM" } });
    expect((mapRaidrApiItem(tooShort) as Record<string, unknown>).vin).toBeUndefined();

    const withI = detailItem({ extraListingData: { vehicle_identification_number: "I1234567890123456" } });
    expect((mapRaidrApiItem(withI) as Record<string, unknown>).vin).toBeUndefined();
  });

  it("leaves vin undefined when vehicle_identification_number is null", () => {
    const out = mapRaidrApiItem(detailItem()) as Record<string, unknown>;
    expect(out.vin).toBeUndefined();
  });
});

describe("mapRaidrApiItem — detail-mode make/model/trim", () => {
  it("extracts make/model/trim from extraListingData.vehicle_*_display_name fields (trim cleaned of body suffix)", () => {
    const out = mapRaidrApiItem(detailItem()) as Record<string, unknown>;
    expect(out.make).toBe("Toyota");
    expect(out.model).toBe("Camry");
    // "SE Sedan 4D" → cleaned to "SE" via cleanTrim (strips body words + door tag)
    expect(out.trim).toBe("SE");
  });

  it("leaves make/model/trim flat fields untouched when extraListingData is absent (basic-mode)", () => {
    const out = mapRaidrApiItem(raidrItem()) as Record<string, unknown>;
    expect(out.make).toBeUndefined();
    expect(out.model).toBeUndefined();
    expect(out.trim).toBeUndefined();
  });

  it("does not overwrite a pre-existing flat make field", () => {
    const item = detailItem({ make: "Honda" });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.make).toBe("Honda");
  });
});

describe("mapRaidrApiItem — cleanTrim on vehicle_trim_display_name", () => {
  function trimFor(displayName: string): unknown {
    const item = detailItem({
      extraListingData: { vehicle_trim_display_name: displayName },
    });
    return (mapRaidrApiItem(item) as Record<string, unknown>).trim;
  }

  it('"LT Sport Utility 4D" → "LT"', () => {
    expect(trimFor("LT Sport Utility 4D")).toBe("LT");
  });

  it('"Lariat Pickup 4D 5 ft" → "Lariat"', () => {
    expect(trimFor("Lariat Pickup 4D 5 ft")).toBe("Lariat");
  });

  it('"Unlimited Sport S SUV 4D" → "Unlimited Sport S"', () => {
    expect(trimFor("Unlimited Sport S SUV 4D")).toBe("Unlimited Sport S");
  });

  it('"Denali" preserved as "Denali"', () => {
    expect(trimFor("Denali")).toBe("Denali");
  });

  it('"Custom" preserved as "Custom"', () => {
    expect(trimFor("Custom")).toBe("Custom");
  });

  it('"Long Bed" preserved as "Long Bed" (no body-word match)', () => {
    expect(trimFor("Long Bed")).toBe("Long Bed");
  });

  it('"TRD Off-Road Pickup 4D 5 ft" → "TRD Off-Road"', () => {
    expect(trimFor("TRD Off-Road Pickup 4D 5 ft")).toBe("TRD Off-Road");
  });

  it('"SEL Premium" preserved as "SEL Premium"', () => {
    expect(trimFor("SEL Premium")).toBe("SEL Premium");
  });

  it('"Calligraphy Sport Utility 4D" → "Calligraphy"', () => {
    expect(trimFor("Calligraphy Sport Utility 4D")).toBe("Calligraphy");
  });

  it("falls back to undefined when the cleaned trim is empty", () => {
    // Adversarial: a string that is body-words only would clean to empty.
    // cleanTrim must return the original (or undefined) rather than ""
    // to avoid producing an empty-string trim that downstream code
    // would treat as present-but-invalid.
    const item = detailItem({
      extraListingData: { vehicle_trim_display_name: "" },
    });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.trim).toBeUndefined();
  });

  it("does not mutate marketplace_listing_title or custom_title", () => {
    const item = detailItem({
      marketplace_listing_title: "2018 Chevrolet Suburban 1500 LT Sport Utility 4D",
      custom_title: "Custom Title Preserved",
      extraListingData: { vehicle_trim_display_name: "LT Sport Utility 4D" },
    });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.marketplace_listing_title).toBe("2018 Chevrolet Suburban 1500 LT Sport Utility 4D");
    expect(out.custom_title).toBe("Custom Title Preserved");
    expect(out.trim).toBe("LT");
  });
});

describe("mapRaidrApiItem — detail-mode description and location", () => {
  it("extracts description from extraListingData.description", () => {
    const out = mapRaidrApiItem(detailItem()) as Record<string, unknown>;
    expect(out.description).toBe("Clean title, runs great. New tires. No issues.");
  });

  it("leaves description undefined when extraListingData.description is empty", () => {
    const item = detailItem({ extraListingData: { description: "" } });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.description).toBeUndefined();
  });

  it("extracts city/state from extraListingData.location when present", () => {
    const out = mapRaidrApiItem(detailItem()) as Record<string, unknown>;
    expect(out.city).toBe("Plano");
    expect(out.state).toBe("TX");
  });

  it("falls back to top-level location.reverse_geocode for city/state when extraListingData.location absent", () => {
    const item = raidrItem({
      location: { reverse_geocode: { city: "Dallas", state: "TX" } },
    });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.city).toBe("Dallas");
    expect(out.state).toBe("TX");
  });
});

describe("mapRaidrApiItem — subtitle mileage fallback (basic mode)", () => {
  it("extracts mileage from custom_sub_titles_with_rendering_flags[].subtitle '64K miles'", () => {
    const item = raidrItem({
      custom_sub_titles_with_rendering_flags: [{ subtitle: "64K miles" }],
    });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.mileage).toBe(64000);
  });

  it("extracts mileage from '129K miles · Dealership'", () => {
    const item = raidrItem({
      custom_sub_titles_with_rendering_flags: [{ subtitle: "129K miles · Dealership" }],
    });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.mileage).toBe(129000);
  });

  it("leaves mileage undefined when subtitle is empty string", () => {
    const item = raidrItem({
      custom_sub_titles_with_rendering_flags: [{ subtitle: "" }],
    });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    expect(out.mileage).toBeUndefined();
  });

  it("leaves mileage undefined when subtitles list is missing", () => {
    const out = mapRaidrApiItem(raidrItem()) as Record<string, unknown>;
    expect(out.mileage).toBeUndefined();
  });

  it("prefers extraListingData.vehicle_odometer_data over subtitle when both present", () => {
    const item = detailItem({
      custom_sub_titles_with_rendering_flags: [{ subtitle: "99K miles" }],
    });
    const out = mapRaidrApiItem(item) as Record<string, unknown>;
    // detail mode value wins over subtitle
    expect(out.mileage).toBe(62000);
  });
});

describe("mapRaidrApiItem — basic-mode mapping still works (regression)", () => {
  it("basic-mode item without extraListingData still maps url/title/price/postedAt/sellerName", () => {
    const out = mapRaidrApiItem(raidrItem()) as Record<string, unknown>;
    expect(out.url).toBe("https://www.facebook.com/marketplace/item/1686857085840236/");
    expect(out.title).toBe("2020 Toyota Camry SE 62k miles");
    expect(out.price).toBe("18500.00");
    expect(out.sellerName).toBe("Dealer Joe");
    expect(out.postedAt).toBe(new Date(1778443122000).toISOString());
  });
});

// ── KNOWN_FACEBOOK_FIELDS coverage on the raidr-api shape ─────────────────────

describe("detectFacebookDrift on raidr-api item", () => {
  it("produces zero unexpected_field events on a typical raidr-api item", () => {
    const events = detectFacebookDrift(raidrItem());
    expect(events).toEqual([]);
  });
});
