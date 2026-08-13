/**
 * Item 72 — `cox_no_data` recovery on the Y/M/M path.
 *
 * Production evidence: 65% of `cox_no_data` misses are for a year/make/model
 * that prices fine on other listings, and ~85% of them came from an `alias_hit`.
 * The failure is the wrong Cox tokens (usually drivetrain or engine), not a car
 * Manheim cannot book. These tests lock the recovery: retire the bad alias,
 * re-ask Claude with the rejected combination named, re-price once.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMmrLookupOutcome } from "../src/valuation/workerClient";
import { loadMmrReferenceData } from "../src/valuation/loadMmrReferenceData";
import { deleteMmrStyleAlias } from "../src/persistence/mmrStyleAliases";
import { callAnthropicForYmms } from "../src/llm/anthropicClient";
import type { Env } from "../src/types/env";
import type * as MmrStyleAliasesModule from "../src/persistence/mmrStyleAliases";

vi.mock("../src/valuation/loadMmrReferenceData", () => ({
  loadMmrReferenceData: vi.fn(),
  resetReferenceDataCache: vi.fn(),
}));

vi.mock("../src/valuation/buildIngestCatalogOfflineDeps", () => ({
  buildIngestCatalogOfflineDeps: vi.fn(() => ({})),
}));

vi.mock("../src/persistence/supabase", () => ({
  getSupabaseClient: vi.fn(() => ({})),
}));

vi.mock("../src/persistence/mmrStyleAliases", async (importOriginal) => {
  const actual = await importOriginal<typeof MmrStyleAliasesModule>();
  return {
    ...actual,
    deleteMmrStyleAlias: vi.fn().mockResolvedValue(undefined),
    upsertMmrStyleAlias: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../src/persistence/llmYmmsDecisions", () => ({
  insertLlmYmmsDecision: vi.fn().mockResolvedValue(undefined),
}));

// 2019 Camry is split by engine in the Cox catalog — exactly the shape that
// produces `cox_no_data` when the listing text does not state the engine.
vi.mock("../src/persistence/coxCatalogTree", () => ({
  loadCoxCatalogTreeForMake: vi.fn().mockResolvedValue([
    { year: 2019, make: "TOYOTA", model: "CAMRY 4C", style: "4D SEDAN LE", searchText: "", variantKind: null },
    { year: 2019, make: "TOYOTA", model: "CAMRY V6", style: "4D SEDAN LE", searchText: "", variantKind: null },
  ]),
  hasCoxCatalogTreeForYear: vi.fn().mockResolvedValue(true),
}));

vi.mock("../src/llm/anthropicClient", () => ({
  callAnthropicForYmms: vi.fn(),
}));

const ENV = {
  INTEL_WORKER_URL: "https://intel.example.com",
  INTEL_WORKER_SECRET: "secret-xyz",
  LLM_YMMS_ENABLED: "true",
} as unknown as Env;

const REF = {
  makes: new Set(["Toyota"]),
  models: new Map([["Toyota", new Set(["Camry"])]]),
  makeAliases: new Map(),
  modelAliases: new Map(),
};

/** The alias that sent the wrong engine variant to Manheim. */
const BAD_ALIAS_RESOLUTION = {
  kind: "alias_hit" as const,
  make: "TOYOTA",
  model: "CAMRY V6",
  style: "4D SEDAN LE",
};

const LISTING = {
  year: 2019,
  make: "Toyota",
  model: "Camry",
  trim: "LE",
  mileage: 60_000,
  title: "2019 Toyota Camry LE",
};

const NEGATIVE_ENVELOPE = {
  ok: false,
  mmr_value: null,
  mileage_used: 0,
  is_inferred_mileage: false,
  cache_hit: false,
  source: "manheim",
  fetched_at: "2026-08-13T12:00:00.000Z",
  expires_at: null,
  mmr_payload: {},
  error_code: null,
  error_message: null,
};

const VALUE_ENVELOPE = {
  ...NEGATIVE_ENVELOPE,
  ok: true,
  mmr_value: 16_000,
  mileage_used: 60_000,
  expires_at: "2026-08-14T12:00:00.000Z",
  mmr_payload: { items: [] },
};

function response(envelope: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      success: true,
      data: envelope,
      requestId: "test-req",
      timestamp: "2026-08-13T12:00:00.000Z",
    }),
  };
}

function claudePicks(model: string, style: string, confidence = 0.82) {
  vi.mocked(callAnthropicForYmms).mockResolvedValue({
    kind: "ok",
    proposal: {
      make: "TOYOTA",
      model,
      style,
      confidence,
      reasoning: "Listing text indicates the 4-cylinder LE.",
      needsReview: false,
    },
    latencyMs: 900,
    model: "claude-sonnet-5",
  } as unknown as Awaited<ReturnType<typeof callAnthropicForYmms>>);
}

/** Comfortably inside the retry budget (RETRY_BUDGET_MS = 10s). */
function generousDeadline() {
  return Date.now() + 30_000;
}

function sentBodies(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map(
    ([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadMmrReferenceData).mockResolvedValue(REF);
});

describe("item 72 — cox_no_data retry", () => {
  it("retires the bad alias, re-asks Claude, and recovers a value on the second pick", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(NEGATIVE_ENVELOPE))
      .mockResolvedValueOnce(response(VALUE_ENVELOPE));
    vi.stubGlobal("fetch", fetchMock);
    claudePicks("CAMRY 4C", "4D SEDAN LE");

    const outcome = await getMmrLookupOutcome(LISTING, ENV, {
      llmResolution: BAD_ALIAS_RESOLUTION,
      retryDeadlineMs: generousDeadline(),
    });

    expect(outcome.kind).toBe("hit");
    if (outcome.kind !== "hit") return;
    expect(outcome.result.mmrValue).toBe(16_000);

    // The recovered identity is what gets persisted, not the rejected one.
    expect(outcome.result.lookupModel).toBe("CAMRY 4C");
    expect(outcome.result.lookupTrim).toBe("4D SEDAN LE");

    // Second attempt was a corrected guess — do not present it as an exact match.
    expect(outcome.result.confidence).toBe("low");
    expect(outcome.result.normalizationConfidence).toBe("partial");

    const bodies = sentBodies(fetchMock);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.model).toBe("CAMRY V6");
    expect(bodies[1]?.model).toBe("CAMRY 4C");

    expect(deleteMmrStyleAlias).toHaveBeenCalledWith(
      expect.anything(),
      { aliasKey: "toyota|camry|le", canonicalMake: "TOYOTA", canonicalModel: "CAMRY V6" },
    );
  });

  it("tells Claude which combination Manheim already rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(response(NEGATIVE_ENVELOPE)).mockResolvedValueOnce(response(VALUE_ENVELOPE)),
    );
    claudePicks("CAMRY 4C", "4D SEDAN LE");

    await getMmrLookupOutcome(LISTING, ENV, {
      llmResolution: BAD_ALIAS_RESOLUTION,
      retryDeadlineMs: generousDeadline(),
    });

    const prompt = vi.mocked(callAnthropicForYmms).mock.calls[0]?.[0]?.prompt;
    expect(prompt?.listingEvidenceText).toContain("CAMRY V6 / 4D SEDAN LE");
    // The rejected pick must stay out of the cached catalog prefix so item 66
    // prompt caching still hits on the retry.
    expect(prompt?.catalogCacheText).not.toContain("no book value");
  });

  it("keeps the miss when Claude repeats the rejected pick, without a second Manheim call", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(NEGATIVE_ENVELOPE));
    vi.stubGlobal("fetch", fetchMock);
    claudePicks("CAMRY V6", "4D SEDAN LE");

    const outcome = await getMmrLookupOutcome(LISTING, ENV, {
      llmResolution: BAD_ALIAS_RESOLUTION,
      retryDeadlineMs: generousDeadline(),
    });

    expect(outcome.kind).toBe("miss");
    if (outcome.kind !== "miss") return;
    expect(outcome.reason).toBe("cox_no_data");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the miss when the retry pick also has no book value", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(NEGATIVE_ENVELOPE))
      .mockResolvedValueOnce(response(NEGATIVE_ENVELOPE));
    vi.stubGlobal("fetch", fetchMock);
    claudePicks("CAMRY 4C", "4D SEDAN LE");

    const outcome = await getMmrLookupOutcome(LISTING, ENV, {
      llmResolution: BAD_ALIAS_RESOLUTION,
      retryDeadlineMs: generousDeadline(),
    });

    expect(outcome.kind).toBe("miss");
    if (outcome.kind !== "miss") return;
    expect(outcome.reason).toBe("cox_no_data");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips the retry when the batch deadline cannot absorb it", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(NEGATIVE_ENVELOPE));
    vi.stubGlobal("fetch", fetchMock);
    claudePicks("CAMRY 4C", "4D SEDAN LE");

    const outcome = await getMmrLookupOutcome(LISTING, ENV, {
      llmResolution: BAD_ALIAS_RESOLUTION,
      retryDeadlineMs: Date.now() + 2_000,
    });

    expect(outcome.kind).toBe("miss");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(callAnthropicForYmms).not.toHaveBeenCalled();
    expect(deleteMmrStyleAlias).not.toHaveBeenCalled();
  });

  it("does not retry when the caller passes no deadline (non-ingest callers unchanged)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(NEGATIVE_ENVELOPE));
    vi.stubGlobal("fetch", fetchMock);
    claudePicks("CAMRY 4C", "4D SEDAN LE");

    const outcome = await getMmrLookupOutcome(LISTING, ENV, {
      llmResolution: BAD_ALIAS_RESOLUTION,
    });

    expect(outcome.kind).toBe("miss");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(callAnthropicForYmms).not.toHaveBeenCalled();
  });

  it("does not retire an alias when the bad pick came from Claude rather than the alias table", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(response(NEGATIVE_ENVELOPE)).mockResolvedValueOnce(response(VALUE_ENVELOPE)),
    );
    claudePicks("CAMRY 4C", "4D SEDAN LE");

    const outcome = await getMmrLookupOutcome(LISTING, ENV, {
      llmResolution: {
        kind: "llm_hit",
        make: "TOYOTA",
        model: "CAMRY V6",
        style: "4D SEDAN LE",
        confidence: 0.7,
        reasoning: "guessed V6",
        catalogRowCount: 2,
        latencyMs: 800,
        anthropicModel: "claude-sonnet-5",
      },
      retryDeadlineMs: generousDeadline(),
    });

    expect(outcome.kind).toBe("hit");
    expect(deleteMmrStyleAlias).not.toHaveBeenCalled();
  });
});
