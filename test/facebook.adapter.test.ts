import { describe, it, expect } from "vitest";
import { parseFacebookItem, detectFacebookDrift } from "../src/sources/facebook";
import type { RegionKey } from "../src/types/domain";

const CTX = {
  region: "dallas_tx" as RegionKey,
  scrapedAt: "2024-01-15T12:00:00.000Z",
  sourceRunId: "run-001",
};

// ── Group A: Valid cases ──────────────────────────────────────────────────────

describe("parseFacebookItem — valid cases", () => {
  it("A1: full listing with all fields", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/1", title: "2019 Honda Accord Sport 82k miles", price: "$18,500" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.year).toBe(2019);
    expect(r.listing.make).toBe("honda");
    expect(r.listing.model).toBe("accord");
    expect(r.listing.trim).toBe("sport");
    expect(r.listing.mileage).toBe(82000);
    expect(r.listing.price).toBe(18500);
    expect(r.listing.url).toBe("https://fb.com/1");
    expect(r.listing.source).toBe("facebook");
    expect(r.listing.region).toBe("dallas_tx");
    expect(r.listing.scrapedAt).toBe(CTX.scrapedAt);
  });

  it("A2: F-150 with numeric model and mileage comma-formatted", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/2", title: "2020 Ford F-150 XLT 45,000 miles", price: "32000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.model).toBe("f-150");
    expect(r.listing.trim).toBe("xlt");
    expect(r.listing.mileage).toBe(45000);
    expect(r.listing.price).toBe(32000);
  });

  it("A3: apostrophe 2-digit year", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/3", title: "'19 Chevrolet Silverado 1500", price: "$28,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.year).toBe(2019);
    expect(r.listing.make).toBe("chevrolet");
  });

  it("A4: make alias chevy → chevrolet, year at end", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/4", title: "Chevy Malibu 2021", price: "$16,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.year).toBe(2021);
    expect(r.listing.make).toBe("chevrolet");
    expect(r.listing.model).toBe("malibu");
  });

  it("A5: no price — accepted with price undefined", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/5", title: "2018 Toyota Camry SE" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.price).toBeUndefined();
  });

  it("A6: VW alias → volkswagen, mileage in 28k format", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/6", title: "2022 VW Jetta 28k miles", price: "$21,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.make).toBe("volkswagen");
    expect(r.listing.mileage).toBe(28000);
  });

  it("A7: URL from listingUrl alias", () => {
    const r = parseFacebookItem(
      { listingUrl: "https://fb.com/7", title: "2020 Mazda CX-5 Sport 55k", price: "$24,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.url).toBe("https://fb.com/7");
    expect(r.listing.model).toBe("cx-5");
  });

  it("A8: URL from marketplaceUrl alias, Rivian make", () => {
    const r = parseFacebookItem(
      { marketplaceUrl: "https://fb.com/8", title: "2021 Rivian R1T 18k miles", price: "$58,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.url).toBe("https://fb.com/8");
    expect(r.listing.make).toBe("rivian");
  });

  it("A9: URL from link alias, Lucid make", () => {
    const r = parseFacebookItem(
      { link: "https://fb.com/9", title: "2023 Lucid Air 12k miles", price: "$72,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.url).toBe("https://fb.com/9");
    expect(r.listing.make).toBe("lucid");
  });

  it("A10: Polestar make", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/10", title: "2021 Polestar 2 22k miles", price: "$35,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.make).toBe("polestar");
  });

  it("A11: Land Rover bigram make", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/11", title: "2019 Land Rover Discovery Sport", price: "$38,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.make).toBe("land rover");
    expect(r.listing.model).toBe("discovery");
  });

  it("A12: CR-V with hyphenated model and trim EX-L", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/12", title: "2021 Honda CR-V EX-L 22,500 miles", price: "$29,500" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.model).toBe("cr-v");
    expect(r.listing.trim).toBe("ex-l");
    expect(r.listing.mileage).toBe(22500);
  });

  it("A13: Ram 1500 Big Horn", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/13", title: "2020 Ram 1500 Big Horn 62k miles", price: "$34,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.make).toBe("ram");
    expect(r.listing.model).toBe("1500");
  });

  it("A14: sourceListingId extracted from id field", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/14", id: "12345", title: "2020 Ford Fusion SE", price: "$18,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.sourceListingId).toBe("12345");
  });

  it("A15: no mileage — accepted with mileage undefined", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/15", title: "2019 Honda Accord" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.mileage).toBeUndefined();
  });

  // ── Drivetrain / engine-config cleanup (Cox YMM vocab match) ────────────────
  // Cox MMR YMMT path matches model strings to its vocabulary. Drivetrain tokens
  // (awd/2wd/4wd/rwd/fwd/4x4/4x2) and engine-config tokens (4c/v6/v8/i4/i6) in
  // the model field cause 404s. The adapter must stop model extraction at these
  // tokens. Legitimate model suffixes that look numeric (e.g. "1500" in
  // "Silverado 1500") must be preserved.

  it("A16: model — drops trailing AWD drivetrain token", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/16", title: "2025 Acura ADX AWD 12k miles", price: "$38,500" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.make).toBe("acura");
    expect(r.listing.model).toBe("adx");
  });

  it("A17: model — drops trailing 2WD drivetrain token", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/17", title: "2020 Ford Explorer 2WD 4C 80k miles", price: "$22,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.make).toBe("ford");
    expect(r.listing.model).toBe("explorer");
  });

  it("A18: model — drops 4x4 drivetrain marker", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/18", title: "2022 Toyota Tacoma 4x4 60k miles", price: "$30,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.make).toBe("toyota");
    expect(r.listing.model).toBe("tacoma");
  });

  it("A19: model — preserves numeric model suffix (Silverado 1500)", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/19", title: "2022 Chevrolet Silverado 1500 80k miles", price: "$32,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.make).toBe("chevrolet");
    expect(r.listing.model).toBe("silverado 1500");
  });

  it("A20: model — drops V6 engine-config token", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/20", title: "2021 Honda Accord V6 50k miles", price: "$22,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.make).toBe("honda");
    expect(r.listing.model).toBe("accord");
  });
});

// ── Group B: Edge cases ───────────────────────────────────────────────────────

describe("parseFacebookItem — edge cases", () => {
  it("B1: year not matched in price amount", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/b1", title: "2018 Honda Civic asking $20,189" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.year).toBe(2018);
  });

  it("B2: future model year (current+1) accepted", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/b2", title: "2024 Ford Mustang", price: "$40,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.year).toBe(2024);
  });

  it("B3: price in 18.5k format", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/b3", title: "2019 Toyota Corolla", price: "18.5k" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.price).toBe(18500);
  });

  it("B4: mileage in 82.5k format", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/b4", title: "2019 Toyota Corolla 82.5k miles", price: "$14,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.mileage).toBe(82500);
  });

  it("B5: mileage 0 (new/demo)", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/b5", title: "2023 Toyota Camry 0 miles", price: "$28,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.mileage).toBe(0);
  });

  it("B6: Mercedes alias without hyphen", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/b6", title: "2019 Mercedes E-Class", price: "$35,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.make).toBe("mercedes-benz");
  });

  it("B7: price with cents $18,500.00", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/b7", title: "2019 Honda Accord", price: "$18,500.00" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.price).toBe(18500);
  });

  it("B8: title with leading/trailing whitespace", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/b8", title: "  2020 Toyota Camry SE  " },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.title).toBe("2020 Toyota Camry SE");
  });

  it("B9: Dodge Ram → make=ram", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/b9", title: "2020 Dodge Ram 1500 Laramie", price: "$42,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.make).toBe("ram");
  });

  it("B10: mileage out of range → undefined, not rejected", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/b10", title: "2019 Honda Accord", mileage: "600000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.mileage).toBeUndefined();
  });

  it("B11: price 'Message for price' → undefined", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/b11", title: "2021 Honda Civic", price: "Message for price" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.price).toBeUndefined();
  });

  it("B12: BMW 3-Series with hyphenated model", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/b12", title: "2021 BMW 3-Series 330i 28k", price: "$38,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.make).toBe("bmw");
    expect(r.listing.model).toBe("3-series");
  });

  it("B13: apostrophe year '19 at start", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/b13", title: "'19 Honda Accord Sport", price: "$20,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.year).toBe(2019);
  });
});

// ── Group C: Bad data — must reject ──────────────────────────────────────────

describe("parseFacebookItem — bad data", () => {
  it("C1: empty object → missing_identifier", () => {
    const r = parseFacebookItem({}, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing_identifier");
  });

  it("C2: all URL fields empty → missing_identifier", () => {
    const r = parseFacebookItem({ url: "", listingUrl: "", link: "" }, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing_identifier");
  });

  it("C3: no title field → missing_title", () => {
    const r = parseFacebookItem({ url: "https://fb.com/c3" }, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing_title");
  });

  it("C4: empty title string → missing_title", () => {
    const r = parseFacebookItem({ url: "https://fb.com/c4", title: "" }, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing_title");
  });

  it("C5: title 4 chars → title_too_short", () => {
    const r = parseFacebookItem({ url: "https://fb.com/c5", title: "Car" }, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("title_too_short");
  });

  it("C6: title with no YMM → missing_ymm", () => {
    const r = parseFacebookItem({ url: "https://fb.com/c6", title: "Clean car for sale" }, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing_ymm");
  });

  it("C7: year + unrecognized make → missing_ymm", () => {
    const r = parseFacebookItem({ url: "https://fb.com/c7", title: "2019 Zephyr GT" }, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing_ymm");
  });

  it("C8: make + year but no model → missing_ymm", () => {
    const r = parseFacebookItem({ url: "https://fb.com/c8", title: "Honda 2019" }, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing_ymm");
  });

  it("C9: make + model but no year → missing_ymm", () => {
    const r = parseFacebookItem({ url: "https://fb.com/c9", title: "Honda Accord Sport" }, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing_ymm");
  });

  it("C10: year < 2000 → invalid_year (1985)", () => {
    const r = parseFacebookItem({ url: "https://fb.com/c10", title: "1985 Ford Mustang" }, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid_year");
  });

  it("C10b: year 1999 → invalid_year (below 2000 floor)", () => {
    const r = parseFacebookItem({ url: "https://fb.com/c10b", title: "1999 Ford Mustang" }, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid_year");
  });

  it("C10c: year 2000 → valid (new floor)", () => {
    const r = parseFacebookItem({ url: "https://fb.com/c10c", title: "2000 Toyota Camry LE", price: "$5,000" }, CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.year).toBe(2000);
  });

  it("C11: year > 2035 → invalid_year", () => {
    const r = parseFacebookItem({ url: "https://fb.com/c11", title: "2099 Tesla Model X" }, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid_year");
  });

  it("C12: price $0 → invalid_price", () => {
    const r = parseFacebookItem({ url: "https://fb.com/c12", title: "2019 Honda Accord", price: "$0" }, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid_price");
  });

  it("C13: negative price → invalid_price", () => {
    const r = parseFacebookItem({ url: "https://fb.com/c13", title: "2019 Honda Accord", price: "-500" }, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid_price");
  });

  it("C14: price 'Free' → invalid_price", () => {
    const r = parseFacebookItem({ url: "https://fb.com/c14", title: "2019 Honda Accord", price: "Free" }, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid_price");
  });

  it("C15: price > 500000 → invalid_price", () => {
    const r = parseFacebookItem({ url: "https://fb.com/c15", title: "2019 Honda Accord", price: "999999" }, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid_price");
  });

  it("C16: null item → adapter_error", () => {
    const r = parseFacebookItem(null, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("adapter_error");
  });

  it("C17: string item → adapter_error", () => {
    const r = parseFacebookItem("a string", CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("adapter_error");
  });

  it("C18: number item → adapter_error", () => {
    const r = parseFacebookItem(42, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("adapter_error");
  });
});

// ── Group D: Partial data ─────────────────────────────────────────────────────

describe("parseFacebookItem — partial data", () => {
  it("D1: no price field → price undefined", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/d1", title: "2019 Toyota Camry SE" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.price).toBeUndefined();
  });

  it("D2: no mileage anywhere → mileage undefined", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/d2", title: "2019 Toyota Camry SE", price: "$18,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.mileage).toBeUndefined();
  });

  it("D3: no trim discernible → trim undefined", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/d3", title: "2019 Toyota Camry", price: "$18,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.trim).toBeUndefined();
  });

  it("D4: url present, no id fields → sourceListingId undefined", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/d4", title: "2019 Toyota Camry", price: "$18,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.sourceListingId).toBeUndefined();
  });
});

// ── Group E: No-VIN cases ─────────────────────────────────────────────────────

describe("parseFacebookItem — no VIN (Facebook norm)", () => {
  it("E1: standard listing no vin field → vin undefined", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/e1", title: "2019 Honda Accord Sport", price: "$18,000" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.vin).toBeUndefined();
  });

  it("E2: vin empty string → vin undefined", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/e2", title: "2019 Honda Accord Sport", vin: "" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.vin).toBeUndefined();
  });

  it("E3: vin 'not available' → vin undefined", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/e3", title: "2019 Honda Accord Sport", vin: "not available" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.vin).toBeUndefined();
  });

  it("E4: VIN in description is NOT extracted", () => {
    const r = parseFacebookItem(
      {
        url: "https://fb.com/e4",
        title: "2019 Honda Accord Sport",
        description: "VIN: 1HGCV1F34KA123456, great condition",
      },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.vin).toBeUndefined();
  });

  it("E5: valid 17-char VIN propagates to NormalizedListingInput, uppercased", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/e5", title: "2025 Ford F-350 Lariat", vin: "1ft8w3bt1sec27066" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.vin).toBe("1FT8W3BT1SEC27066");
  });

  it("E6: VIN with surrounding whitespace is trimmed before validation", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/e6", title: "2025 Ford F-350 Lariat", vin: "  1FT8W3BT1SEC27066  " },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.vin).toBe("1FT8W3BT1SEC27066");
  });

  it("E7: 17-char VIN containing forbidden char (I) → undefined", () => {
    const r = parseFacebookItem(
      // 17 chars, contains 'I' which is forbidden by ISO 3779
      { url: "https://fb.com/e7", title: "2019 Honda Accord Sport", vin: "1HGCV1F34KA12345I" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.vin).toBeUndefined();
  });

  it("E8: VIN of wrong length → undefined", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/e8", title: "2019 Honda Accord Sport", vin: "TOOSHORT" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.vin).toBeUndefined();
  });

  it("E9: uppercase 'VIN' field key works as alias", () => {
    const r = parseFacebookItem(
      { url: "https://fb.com/e9", title: "2025 Ford F-350 Lariat", VIN: "1FT8W3BT1SEC27066" },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.vin).toBe("1FT8W3BT1SEC27066");
  });
});

// ── Group F: Schema drift detection ──────────────────────────────────────────

describe("detectFacebookDrift", () => {
  it("F1: all known fields → no drift events", () => {
    const events = detectFacebookDrift({
      url: "https://fb.com/1",
      title: "2020 Toyota Camry",
      price: "$18,000",
      mileage: "62000",
      description: "clean title",
    });
    expect(events).toHaveLength(0);
  });

  it("F2: one unknown field → one unexpected_field event", () => {
    const events = detectFacebookDrift({
      url: "https://fb.com/2",
      title: "2020 Toyota Camry",
      verification_status: "verified",
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.event_type).toBe("unexpected_field");
    expect(events[0]!.field_path).toBe("verification_status");
    expect(events[0]!.sample_value).toBe("verified");
  });

  it("F3: multiple unknown fields → one event per field", () => {
    const events = detectFacebookDrift({
      url: "https://fb.com/3",
      title: "2021 Honda Civic",
      badge_count: 3,
      seller_rating: 4.8,
    });
    expect(events).toHaveLength(2);
    const paths = events.map(e => e.field_path).sort();
    expect(paths).toEqual(["badge_count", "seller_rating"]);
  });

  it("F4: mix of known and unknown fields → only unknowns reported", () => {
    const events = detectFacebookDrift({
      url: "https://fb.com/4",        // known
      title: "2022 Ford F-150",       // known
      price: "$35,000",               // known
      promoted_listing: true,         // unknown
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.field_path).toBe("promoted_listing");
  });

  it("F5: empty object → no events", () => {
    expect(detectFacebookDrift({})).toHaveLength(0);
  });
});
