import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  runMmrRateLimitRetryPass,
  RATE_LIMIT_RETRY_DELAY_MS,
  MAX_RATE_LIMIT_RETRIES_PER_SLICE,
} from "../src/ingest/mmrRateLimitRetryPass";
import { getMmrLookupOutcome } from "../src/valuation/workerClient";
import { writeValuationSnapshot } from "../src/persistence/valuationSnapshots";
import type { Env } from "../src/types/env";

vi.mock("../src/valuation/workerClient", () => ({
  getMmrLookupOutcome: vi.fn(),
}));

vi.mock("../src/persistence/valuationSnapshots", () => ({
  writeValuationSnapshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/ingest/ingestMaxbuyEvaluate", () => ({
  buildIngestMaxbuyEvaluateBody: vi.fn().mockReturnValue(null),
  scheduleIngestMaxbuyEvaluate: vi.fn(),
}));

const ENV = {} as Env;
const DB = {} as never;
const CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext;
const LOG_CTX = { runId: "run-1" };

const LISTING = {
  url: "https://facebook.com/marketplace/item/1",
  year: 2018,
  make: "Ford",
  model: "f-150",
  trim: "xlt",
  mileage: 80_000,
  title: "2018 Ford F-150 XLT",
  price: 25_000,
  source: "facebook" as const,
  scrapedAt: "2026-09-03T00:00:00.000Z",
};

const HIT = {
  kind: "hit" as const,
  result: {
    mmrValue: 24_000,
    lookupMake: "FORD",
    lookupModel: "F150 4WD V6",
    lookupTrim: "CREW CAB 3.5L XLT",
    method: "year_make_model" as const,
    confidence: "high" as const,
    rawResponse: {},
  },
};

describe("runMmrRateLimitRetryPass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-prices with the precomputed llmResolution and writes a hit snapshot", async () => {
    vi.mocked(getMmrLookupOutcome).mockResolvedValueOnce(HIT);

    const result = await runMmrRateLimitRetryPass({
      db: DB,
      env: ENV,
      execCtx: CTX,
      candidates: [
        {
          normalizedListingId: "norm-1",
          listing: LISTING,
          llmResolution: {
            kind: "alias_hit",
            make: "FORD",
            model: "F150 4WD V6",
            style: "CREW CAB 3.5L XLT",
          },
          llmText: {},
        },
      ],
      ctx: LOG_CTX,
    });

    expect(result).toEqual({ attempted: 1, recovered: 1 });
    expect(getMmrLookupOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ make: "Ford", model: "f-150", trim: "xlt" }),
      ENV,
      expect.objectContaining({
        llmResolution: expect.objectContaining({ kind: "alias_hit" }),
        normalizedListingId: "norm-1",
      }),
    );
    expect(writeValuationSnapshot).toHaveBeenCalledOnce();
  });

  it("staggers retries after the first candidate", async () => {
    vi.useFakeTimers();
    vi.mocked(getMmrLookupOutcome)
      .mockResolvedValueOnce({ kind: "miss", reason: "cox_rate_limited", method: "year_make_model" })
      .mockResolvedValueOnce(HIT);

    const pass = runMmrRateLimitRetryPass({
      db: DB,
      env: ENV,
      execCtx: CTX,
      candidates: [
        {
          normalizedListingId: "norm-1",
          listing: LISTING,
          llmResolution: { kind: "fallback", reason: "llm_disabled" },
          llmText: {},
        },
        {
          normalizedListingId: "norm-2",
          listing: { ...LISTING, url: "https://facebook.com/marketplace/item/2" },
          llmResolution: { kind: "fallback", reason: "llm_disabled" },
          llmText: {},
        },
      ],
      ctx: LOG_CTX,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(getMmrLookupOutcome).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_RETRY_DELAY_MS);
    await pass;

    expect(getMmrLookupOutcome).toHaveBeenCalledTimes(2);
  });

  it("caps retries per slice", () => {
    expect(MAX_RATE_LIMIT_RETRIES_PER_SLICE).toBe(10);
  });
});
