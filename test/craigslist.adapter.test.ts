import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCraigslistItem, detectCraigslistDrift } from "../src/sources/craigslist";
import type { RegionKey } from "../src/types/domain";

const CTX = {
  region: "dallas_tx" as RegionKey,
  scrapedAt: "2026-07-22T13:30:00.000Z",
  sourceRunId: "run-cl-001",
};

const FIXTURES = join(import.meta.dirname, "fixtures", "craigslist");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
}

describe("parseCraigslistItem — Apify solidcode shape", () => {
  it("maps Apify car listing with attributes + imageUrls", () => {
    const r = parseCraigslistItem(loadFixture("apify-dallas-f150.json"), CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.listing.source).toBe("craigslist");
    expect(r.listing.year).toBe(2020);
    expect(r.listing.make).toBe("ford");
    expect(r.listing.model).toBe("f-150");
    expect(r.listing.trim).toBe("xlt");
    expect(r.listing.price).toBe(32500);
    expect(r.listing.mileage).toBe(45000);
    expect(r.listing.sourceListingId).toBe("7845123456");
    expect(r.listing.description).toContain("Clean title");
    expect(r.listing.images).toHaveLength(2);
    expect(r.listing.city).toBe("Fort Worth");
    expect(r.listing.postedAt).toBeDefined();
  });
});

describe("parseCraigslistItem — canonical §8.2 shape", () => {
  it("maps scraper contract fields including body_text", () => {
    const r = parseCraigslistItem(loadFixture("canonical-accord.json"), CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.listing.year).toBe(2019);
    expect(r.listing.make).toBe("honda");
    expect(r.listing.model).toBe("accord");
    expect(r.listing.trim).toBe("sport");
    expect(r.listing.price).toBe(18500);
    expect(r.listing.mileage).toBe(62000);
    expect(r.listing.city).toBe("Dallas");
    expect(r.listing.state).toBe("TX");
    expect(r.listing.description).toContain("garage kept");
    expect(r.listing.sellerName).toBe("private");
  });
});

describe("parseCraigslistItem — title fallback", () => {
  it("parses Y/M/M/S from title when structured fields absent", () => {
    const r = parseCraigslistItem(loadFixture("title-only-camry.json"), CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.listing.year).toBe(2018);
    expect(r.listing.make).toBe("toyota");
    expect(r.listing.model).toBe("camry");
    expect(r.listing.trim).toBe("le");
    expect(r.listing.mileage).toBe(72000);
    expect(r.listing.price).toBe(14900);
    expect(r.listing.sourceListingId).toBe("9988776655");
  });
});

describe("parseCraigslistItem — rejections", () => {
  it("rejects missing url", () => {
    const r = parseCraigslistItem({ title: "2019 Honda Accord Sport" }, CTX);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing_identifier");
  });

  it("rejects deleted listings", () => {
    const r = parseCraigslistItem(
      {
        url: "https://dallas.craigslist.org/cto/d/deleted/111.html",
        title: "2019 Honda Accord Sport",
        isDeleted: true,
      },
      CTX,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("adapter_error");
  });

  it("rejects pre-2000 year", () => {
    const r = parseCraigslistItem(
      {
        url: "https://dallas.craigslist.org/cto/d/old/222.html",
        title: "1999 Ford Mustang",
        year: 1999,
        make: "ford",
        model: "mustang",
      },
      CTX,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid_year");
  });
});

describe("detectCraigslistDrift", () => {
  it("flags unknown top-level fields", () => {
    const events = detectCraigslistDrift({
      url: "https://dallas.craigslist.org/cto/d/x/1.html",
      title: "2019 Honda Accord Sport",
      unexpectedApifyField: { nested: true },
    });
    expect(events).toEqual([
      {
        event_type: "unexpected_field",
        field_path: "unexpectedApifyField",
        sample_value: { nested: true },
      },
    ]);
  });

  it("does not flag known Apify + canonical fields", () => {
    const events = detectCraigslistDrift(loadFixture("apify-dallas-f150.json") as Record<string, unknown>);
    expect(events).toHaveLength(0);
  });
});
