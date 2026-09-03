import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapRaidrApiItem } from "../src/apify/payloadAdapter";
import {
  extractLlmListingTextFromIngestItem,
  mergeLlmListingTextContext,
  LLM_LISTING_TEXT_MAX_CHARS,
} from "../src/llm/listingTextContext";
import { buildLlmYmmsPrefetchInputs } from "../src/ingest/llmYmmsPrefetchInputs";

import type { AdapterContext } from "../src/sources/facebook";

const adapterCtx: AdapterContext = {
  region: "dallas_tx",
  scrapedAt: "2026-07-22T12:00:00.000Z",
  sourceRunId: "test-run",
};

describe("extractLlmListingTextFromIngestItem", () => {
  it("reads description and condition from extraListingData on raw Apify items", () => {
    const raw = {
      title: "2016 Ford F-150 · Short Bed",
      price: 18000,
      url: "https://www.facebook.com/marketplace/item/123/",
      extraListingData: {
        description:
          "2016 Ford F-150 SuperCrew XLT 4x4, 5.0L V8, short bed, clean title, 89k miles.",
        condition: "USED",
        location: { city: "Dallas", state: "TX" },
      },
    };

    expect(extractLlmListingTextFromIngestItem(raw)).toEqual({
      description:
        "2016 Ford F-150 SuperCrew XLT 4x4, 5.0L V8, short bed, clean title, 89k miles.",
      condition: "USED",
      location: "Dallas, TX",
    });
  });

  it("reads flat description after mapRaidrApiItem", () => {
    const samplePath = join(process.cwd(), "test", "fixtures", "apify-raidr-detail-item.json");
    const raw = JSON.parse(readFileSync(samplePath, "utf8"));
    const mapped = mapRaidrApiItem(raw) as Record<string, unknown>;

    const ctx = extractLlmListingTextFromIngestItem(mapped);
    expect(ctx.description).toContain("Exterior: Blue Pearl");
    expect(ctx.condition).toBe("USED");
    expect(ctx.location).toBe("Dallas, TX");
  });

  it("caps very long descriptions", () => {
    const long = "x".repeat(LLM_LISTING_TEXT_MAX_CHARS + 50);
    const ctx = extractLlmListingTextFromIngestItem({ description: long });
    expect(ctx.description!.length).toBe(LLM_LISTING_TEXT_MAX_CHARS + 1);
    expect(ctx.description!.endsWith("…")).toBe(true);
  });

  it("passes through stated mileage only when numeric on the item", () => {
    expect(extractLlmListingTextFromIngestItem({ mileage: 89000 }).listingMileage).toBe(89000);
    expect(extractLlmListingTextFromIngestItem({ mileage: "89000" }).listingMileage).toBeUndefined();
  });

  it("mergeLlmListingTextContext falls back to adapter-parsed listing fields", () => {
    const merged = mergeLlmListingTextContext(
      {},
      {
        description: "2015 BMW X3 AWD 4dr xDrive28d Automatic",
        mileage: 92000,
        city: "Dallas",
        state: "TX",
      },
    );
    expect(merged.description).toContain("xDrive28d");
    expect(merged.listingMileage).toBe(92000);
    expect(merged.location).toBe("Dallas, TX");
  });
});

describe("buildLlmYmmsPrefetchInputs", () => {
  it("includes seller description on sparse-title Facebook items", () => {
    const item = {
      title: "2016 Ford F-150 · Short Bed",
      price: 18000,
      url: "https://www.facebook.com/marketplace/item/456/",
      description:
        "SuperCrew XLT 4x4 with the 5.0L V8 — not a regular cab, not an XL trim.",
    };

    const map = buildLlmYmmsPrefetchInputs([item], "facebook", adapterCtx);
    expect(map.size).toBe(1);
    const input = map.get(0)!;
    expect(input.title).toContain("F-150");
    expect(input.description).toContain("SuperCrew XLT 4x4");
  });

  it("uses description from parsed listing when raw item omits it", () => {
    const item = {
      title: "2015 BMW X3",
      price: 12000,
      url: "https://www.facebook.com/marketplace/item/789/",
      // adapter-only path: description lands on listing via parseFacebookItem field
      description: "2015 BMW X3 AWD 4dr xDrive28d Automatic",
    };

    const map = buildLlmYmmsPrefetchInputs([item], "facebook", adapterCtx);
    expect(map.size).toBe(1);
    expect(map.get(0)?.description).toContain("xDrive28d");
  });

  it("includes Craigslist mapped items with body_text (item 67)", () => {
    const item = {
      url: "https://dallas.craigslist.org/cto/d/x/7952046730.html",
      title: "2020 Ford Fusion SE",
      year: 2020,
      make: "ford",
      model: "fusion",
      trim: "SE",
      priceUsd: 6999,
      body_text: "One owner Fusion SE with clean title and recent tires.",
      city: "Dallas",
      state: "TX",
    };

    const map = buildLlmYmmsPrefetchInputs([item], "craigslist", adapterCtx);
    expect(map.size).toBe(1);
    const input = map.get(0)!;
    expect(input.year).toBe(2020);
    expect(input.make).toBe("ford");
    expect(input.model).toBe("fusion");
    expect(input.description).toContain("clean title");
  });

  it("skips unknown sources", () => {
    const map = buildLlmYmmsPrefetchInputs(
      [{ title: "2020 Ford Fusion", url: "https://x", price: 1 }],
      "offerup",
      adapterCtx,
    );
    expect(map.size).toBe(0);
  });

  it("skips blocked Facebook sellers for LLM prefetch, including stored seller on empty payload (item 74)", () => {
    const item = {
      title: "2020 Toyota Camry",
      price: 15000,
      url: "https://www.facebook.com/marketplace/item/999/",
    };
    const blockedLookup = {
      keys: new Set(["url:https://www.facebook.com/marketplace/profile/dealer-abc"]),
    };
    const stored = new Map([
      [
        "https://www.facebook.com/marketplace/item/999/",
        {
          sellerUrl: "https://www.facebook.com/marketplace/profile/dealer-abc/",
          sellerName: "Dealer",
        },
      ],
    ]);
    const map = buildLlmYmmsPrefetchInputs([item], "facebook", adapterCtx, blockedLookup, {
      storedSellersByUrl: stored,
    });
    expect(map.size).toBe(0);
  });

  it("skips heuristic dealer listings for LLM prefetch when skipHeuristicDealers is set (item 71)", () => {
    const item = {
      title: "2018 Ford F-150 XLT",
      price: 22000,
      url: "https://www.facebook.com/marketplace/item/dealer-skip/",
      description: "We finance! Visit our lot. Stock #A99",
      sellerName: "Metro Auto Group",
    };
    const kept = buildLlmYmmsPrefetchInputs([item], "facebook", adapterCtx);
    expect(kept.size).toBe(1);
    const skipped = buildLlmYmmsPrefetchInputs([item], "facebook", adapterCtx, null, {
      skipHeuristicDealers: true,
    });
    expect(skipped.size).toBe(0);
  });

  it("skips salvage and rebuilt title listings for LLM prefetch", () => {
    const item = {
      title: "2018 Ford F-150 XLT",
      price: 9000,
      url: "https://www.facebook.com/marketplace/item/salvage-1/",
      description: "Salvage title, runs and drives.",
    };
    const map = buildLlmYmmsPrefetchInputs([item], "facebook", adapterCtx);
    expect(map.size).toBe(0);
  });

  it("skips listings below the valuation year floor (item 72)", () => {
    const item = {
      title: "2010 Toyota Camry SE",
      price: 4500,
      url: "https://www.facebook.com/marketplace/item/1000/",
    };
    const map = buildLlmYmmsPrefetchInputs([item], "facebook", adapterCtx);
    expect(map.size).toBe(0);
  });

  it("still registers listings at the valuation year floor (item 72)", () => {
    const item = {
      title: "2011 Toyota Camry SE",
      price: 6500,
      url: "https://www.facebook.com/marketplace/item/1001/",
    };
    const map = buildLlmYmmsPrefetchInputs([item], "facebook", adapterCtx);
    expect(map.size).toBe(1);
    expect(map.get(0)?.year).toBe(2011);
  });
});
