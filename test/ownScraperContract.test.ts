// Contract test for the TAV-owned Facebook Marketplace scraper
// (repo facebook-marketplace-scraper, contract schemaVersion "1.0").
// Fixtures are that repo's golden items, copied unchanged.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapRaidrApiItem } from "../src/apify/payloadAdapter";
import { detectFacebookDrift, parseFacebookItem } from "../src/sources/facebook";

const golden = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(`test/fixtures/own-scraper/${name}.json`, "utf8")) as Record<string, unknown>;

// The scraper also sends _raw (capped at 64 KB); goldens omit it.
const withRaw = (item: Record<string, unknown>) => ({ ...item, _raw: { search: { id: item.id }, detail: { id: item.id } } });

const CTX = { region: "dallas_tx" as const, scrapedAt: "2026-11-19T15:04:05.000Z", sourceRunId: "run-own-01" };

describe("own scraper contract (schemaVersion 1.0)", () => {
  it("dealer golden maps to adapter input with url, title, price, sellerUrl, description, mileage, make", () => {
    const r = parseFacebookItem(mapRaidrApiItem(withRaw(golden("detail-vehicle-dealer"))), CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing).toMatchObject({
      url: expect.stringMatching(/^https:\/\/www\.facebook\.com\/marketplace\/item\/\d+/),
      title: expect.any(String),
      price: expect.any(Number),
      // All-digit seller id → profile URL the blocklist and GoLogin key on.
      sellerUrl: expect.stringMatching(/\/marketplace\/profile\/\d+/),
      description: expect.any(String),
      mileage: 52321,
      make: "chrysler",
    });
  });

  it("private golden with a pfbid seller id maps without a sellerUrl (GoLogin queue fills it)", () => {
    const r = parseFacebookItem(mapRaidrApiItem(withRaw(golden("detail-vehicle-private"))), CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.listing.sellerUrl).toBeUndefined();
    expect(r.listing).toMatchObject({ make: "chevrolet", model: "malibu", mileage: 147698, description: expect.any(String) });
  });

  it("no schema drift event for schemaVersion/_tav/_raw", () => {
    for (const name of ["detail-vehicle-private", "detail-vehicle-dealer", "detail-vehicle-salvage"]) {
      const item = mapRaidrApiItem(withRaw(golden(name))) as Record<string, unknown>;
      expect(detectFacebookDrift(item)).toEqual([]);
    }
  });
});
