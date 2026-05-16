import { z } from "zod";
import { REGION_KEYS } from "./types/domain";

export const SOURCE_NAMES = [
  "facebook",
  "craigslist",
  "autotrader",
  "cars_com",
  "offerup",
] as const;

/**
 * Hard upper bound on items per ingest envelope. Shared so every producer
 * (HTTP /ingest and the Apify webhook bridge) enforces the same contract —
 * the bridge previously fed up to MAX_ITEMS_PER_RUN items straight to
 * ingestCore, silently bypassing this limit.
 */
export const MAX_INGEST_ITEMS = 500;

// Wrapper schema: validates the ingest envelope only.
// items contents are left as unknown — each source adapter validates its own shape.
export const IngestRequestSchema = z.object({
  source:     z.enum(SOURCE_NAMES),
  run_id:     z.string().min(1).max(128),
  region:     z.enum(REGION_KEYS),
  scraped_at: z.string().datetime(),
  items:      z.array(z.unknown()).min(1).max(MAX_INGEST_ITEMS),
});

export type IngestRequest = z.infer<typeof IngestRequestSchema>;
