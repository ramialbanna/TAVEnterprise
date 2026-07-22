import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapRaidrApiItem } from "../src/apify/payloadAdapter";
import {
  extractLlmListingTextFromIngestItem,
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
});
