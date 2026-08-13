import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapAutomotiveScraperItem } from "../src/apify/automotiveScraperAdapter";
import { parseCraigslistItem } from "../src/sources/craigslist";
import type { RegionKey } from "../src/types/domain";

const CTX = {
  region: "dallas_tx" as RegionKey,
  scrapedAt: "2026-08-07T18:00:00.000Z",
  sourceRunId: "run-cl-auto-001",
};

const FIXTURES = join(import.meta.dirname, "fixtures", "craigslist");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
}

describe("mapAutomotiveScraperItem", () => {
  it("maps schema.org Car → flat Craigslist fields (idempotent on flat keys)", () => {
    const raw = loadFixture("automotive-scraper-car.json") as Record<string, unknown>;
    const mapped = mapAutomotiveScraperItem(raw) as Record<string, unknown>;

    expect(mapped["@type"]).toBe("Car");
    expect(mapped.title).toBe("2022 Ram 1500 Big Horn/Lone Star");
    expect(mapped.year).toBe(2022);
    expect(mapped.make).toBe("Ram");
    expect(mapped.model).toBe("1500");
    expect(mapped.trim).toBe("Big Horn, Lone Star");
    expect(mapped.priceUsd).toBe(30328);
    expect(mapped.mileage).toBe(80430);
    expect(mapped.source_listing_id).toBe("7952069789");
    expect(mapped.body_text).toContain("Big Horn");
    expect(Array.isArray(mapped.images)).toBe(true);
    expect((mapped.images as string[]).length).toBeGreaterThan(0);
    expect(mapped.city).toBeTruthy();
    expect(mapped.state).toBe("TX");
    expect(String(mapped.url)).toContain("7952069789.html");

    // Original schema.org keys preserved
    expect(mapped.name).toBe(raw.name);
    expect(mapped.additionalProperties).toEqual(raw.additionalProperties);
  });

  it("passes through non-objects unchanged", () => {
    expect(mapAutomotiveScraperItem(null)).toBe(null);
    expect(mapAutomotiveScraperItem("x")).toBe("x");
    expect(mapAutomotiveScraperItem([1])).toEqual([1]);
  });

  it("does not overwrite existing flat fields", () => {
    const mapped = mapAutomotiveScraperItem({
      "@type": "Car",
      name: "ignored title",
      title: "Keep Me",
      year: 2019,
      make: "honda",
      model: "accord",
      priceUsd: 100,
      url: "https://dallas.craigslist.org/cto/d/x/1.html",
      brand: { name: "ford" },
      vehicleModelDate: "2022",
      offers: { price: 99999 },
    }) as Record<string, unknown>;

    expect(mapped.title).toBe("Keep Me");
    expect(mapped.year).toBe(2019);
    expect(mapped.make).toBe("honda");
    expect(mapped.model).toBe("accord");
    expect(mapped.priceUsd).toBe(100);
  });
});

describe("mapAutomotiveScraperItem → parseCraigslistItem", () => {
  it("accepts real automotive-scraper fixture", () => {
    const mapped = mapAutomotiveScraperItem(loadFixture("automotive-scraper-car.json"));
    const r = parseCraigslistItem(mapped, CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.listing.source).toBe("craigslist");
    expect(r.listing.year).toBe(2022);
    expect(r.listing.make).toBe("ram");
    expect(r.listing.model).toBe("1500");
    expect(r.listing.trim).toBe("big horn, lone star");
    expect(r.listing.price).toBe(30328);
    expect(r.listing.mileage).toBe(80430);
    expect(r.listing.sourceListingId).toBe("7952069789");
    expect(r.listing.description).toBeTruthy();
    expect(r.listing.images?.length).toBeGreaterThan(0);
    expect(r.listing.state).toBe("TX");
  });

  it("rejects missing url after map (no recoverable identity)", () => {
    const mapped = mapAutomotiveScraperItem({
      "@type": "Car",
      name: "2020 Ford Fusion SE",
      brand: { name: "ford" },
      model: "fusion",
      vehicleModelDate: "2020",
      offers: { price: 6999 },
    });
    const r = parseCraigslistItem(mapped, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing_identifier");
  });

  it("rejects pre-2000 year", () => {
    const mapped = mapAutomotiveScraperItem({
      "@type": "Car",
      name: "1999 Ford Mustang",
      url: "https://dallas.craigslist.org/cto/d/old/222.html",
      brand: { name: "ford" },
      model: "mustang",
      vehicleModelDate: "1999",
      offers: { price: 4000 },
      additionalProperties: { postingId: 222, year: 1999, make: "ford", model: "mustang" },
    });
    const r = parseCraigslistItem(mapped, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid_year");
  });
});
