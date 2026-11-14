import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCoxNoDataRetryPass } from "../src/ingest/coxNoDataRetryPass";
import { retryMmrAfterCoxNoData } from "../src/valuation/workerClient";
import { writeValuationSnapshot } from "../src/persistence/valuationSnapshots";
import type { Env } from "../src/types/env";

vi.mock("../src/valuation/workerClient", () => ({
  retryMmrAfterCoxNoData: vi.fn(),
}));

vi.mock("../src/persistence/valuationSnapshots", () => ({
  writeValuationSnapshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/ingest/ingestMaxbuyEvaluate", () => ({
  buildIngestMaxbuyEvaluateBody: vi.fn().mockReturnValue(null),
  scheduleIngestMaxbuyEvaluate: vi.fn(),
}));

// Synthetic fixtures only — no vendor data.
const SYNTHETIC_VALUE = 12_345;
const ENV = {} as Env;
const DB = {} as never;
const CTX = { waitUntil: vi.fn() } as unknown as ExecutionContext;

const CANDIDATE = {
  normalizedListingId: "norm-1",
  listing: {
    url: "https://example.test/listing/1",
    year: 2018,
    make: "Ford",
    model: "f-150",
    trim: "xlt",
    mileage: 80_000,
    title: "2018 Ford F-150 XLT",
    price: 20_000,
    source: "facebook" as const,
    scrapedAt: "2026-09-03T00:00:00.000Z",
  },
  llmText: {},
  rejectedModel: "F150 2WD",
  rejectedStyle: "SUPERCREW XLT",
};

const HIT = {
  kind: "hit" as const,
  result: {
    mmrValue: SYNTHETIC_VALUE,
    lookupMake: "FORD",
    lookupModel: "F150 4WD V6",
    lookupTrim: "CREW CAB 3.5L XLT",
    method: "year_make_model" as const,
    confidence: "high" as const,
    rawResponse: {},
  },
};

function captureLogs() {
  const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  return {
    spy,
    events: () => spy.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>),
    raw: () => spy.mock.calls.map((c) => String(c[0])).join("\n"),
  };
}

describe("runCoxNoDataRetryPass — licensed value redaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recovery log carries has_value, never the licensed scalar", async () => {
    const logs = captureLogs();
    try {
      vi.mocked(retryMmrAfterCoxNoData).mockResolvedValueOnce(HIT as never);
      const result = await runCoxNoDataRetryPass({
        db: DB, env: ENV, execCtx: CTX, candidates: [CANDIDATE], ctx: { runId: "run-1" },
      });
      expect(result).toEqual({ attempted: 1, recovered: 1 });
      const recovered = logs.events().find((e) => e.event === "valuation.recovered_after_no_data");
      expect(recovered?.has_value).toBe(true);
      expect(recovered).not.toHaveProperty("mmr_value");
      expect(logs.raw()).not.toContain(String(SYNTHETIC_VALUE));
    } finally {
      logs.spy.mockRestore();
    }
  });

  it("snapshot failure log omits DB message/details that echo the row", async () => {
    const logs = captureLogs();
    try {
      vi.mocked(retryMmrAfterCoxNoData).mockResolvedValueOnce(HIT as never);
      vi.mocked(writeValuationSnapshot).mockRejectedValueOnce({
        code: "23514",
        message: `violates check constraint, value ${SYNTHETIC_VALUE}`,
        details: `Failing row contains (norm-1, ${SYNTHETIC_VALUE}).`,
        hint: `mmr_value ${SYNTHETIC_VALUE}`,
      });
      const result = await runCoxNoDataRetryPass({
        db: DB, env: ENV, execCtx: CTX, candidates: [CANDIDATE], ctx: { runId: "run-1" },
      });
      expect(result).toEqual({ attempted: 1, recovered: 0 });
      const failed = logs.events().find((e) => e.event === "ingest.cox_no_data_retry_failed");
      expect(failed?.error).toEqual({ code: "23514" });
      expect(logs.raw()).not.toContain(String(SYNTHETIC_VALUE));
    } finally {
      logs.spy.mockRestore();
    }
  });
});
