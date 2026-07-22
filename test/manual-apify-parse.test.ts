/**
 * Manual helper — not part of normal CI. Used by scripts/try-apify-llm-one.mjs
 * when APIFY_ITEM_PATH points at a raw Apify dataset item JSON file.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { mapRaidrApiItem } from "../src/apify/payloadAdapter";
import { parseFacebookItem } from "../src/sources/facebook";

describe("manual Apify item parse", () => {
  it.skipIf(!process.env.APIFY_ITEM_PATH)("parses mapped item like ingest", () => {
    const raw = JSON.parse(readFileSync(process.env.APIFY_ITEM_PATH!, "utf8"));
    const mapped = mapRaidrApiItem(raw) as Record<string, unknown>;
    const result = parseFacebookItem(mapped, {
      region: "dallas_tx",
      scrapedAt: new Date().toISOString(),
      sourceRunId: "manual-apify-llm-one",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // eslint-disable-next-line no-console -- manual script reads stdout
    console.log(JSON.stringify(result.listing));
  });
});
