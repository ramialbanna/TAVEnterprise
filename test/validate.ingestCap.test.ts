import { describe, it, expect } from "vitest";
import { IngestRequestSchema, MAX_INGEST_ITEMS } from "../src/validate";

function envelope(itemCount: number) {
  return {
    source: "facebook",
    run_id: "run-cap-test",
    region: "dallas_tx",
    scraped_at: "2026-05-16T20:00:00.000Z",
    items: Array.from({ length: itemCount }, (_, i) => ({ url: `https://fb.com/${i}` })),
  };
}

describe("IngestRequestSchema item cap", () => {
  it("exposes MAX_INGEST_ITEMS = 500 as the shared contract limit", () => {
    expect(MAX_INGEST_ITEMS).toBe(500);
  });

  it("accepts exactly MAX_INGEST_ITEMS items", () => {
    expect(IngestRequestSchema.safeParse(envelope(MAX_INGEST_ITEMS)).success).toBe(true);
  });

  it("rejects MAX_INGEST_ITEMS + 1 items", () => {
    expect(IngestRequestSchema.safeParse(envelope(MAX_INGEST_ITEMS + 1)).success).toBe(false);
  });
});
