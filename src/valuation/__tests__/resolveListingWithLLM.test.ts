import { describe, expect, it, vi } from "vitest";
import {
  resolveListingWithLLM,
  llmResolutionToAuditFields,
  isLlmAttemptFailure,
  type LlmYmmsDeps,
  type LlmYmmsResolution,
} from "../resolveListingWithLLM";
import type { AnthropicCallResult } from "../../llm/anthropicClient";
import type { CoxCatalogTreeRow } from "../matchListingToCoxCatalog";
import type { MmrStyleAlias } from "../../persistence/mmrStyleAliases";

const ROWS: CoxCatalogTreeRow[] = [
  { year: 2022, make: "Ram", model: "1500", style: "4D Crew Cab Big Horn", searchText: "", variantKind: "cab_bed" },
  { year: 2022, make: "Ram", model: "1500", style: "4D Crew Cab Laramie", searchText: "", variantKind: "cab_bed" },
];

function baseDeps(overrides: Partial<LlmYmmsDeps> = {}): LlmYmmsDeps {
  return {
    enabled: true,
    callAnthropic: vi.fn(async (): Promise<AnthropicCallResult> => {
      throw new Error("callAnthropic not stubbed for this test");
    }),
    lookupStyleAlias: vi.fn(async (): Promise<MmrStyleAlias | null> => null),
    hasTreeForYear: vi.fn(async () => true),
    loadTreeRows: vi.fn(async () => ROWS),
    ...overrides,
  };
}

const INPUT = {
  year: 2022,
  make: "Ram",
  model: "1500 Bighorn",
  trim: "big horn",
  title: "2022 Ram 1500 Big Horn Crew Cab 4x4",
};

describe("resolveListingWithLLM", () => {
  it("short-circuits with fallback llm_disabled when the flag is off, without touching any dep", async () => {
    const deps = baseDeps({ enabled: false });
    const result = await resolveListingWithLLM(INPUT, deps);
    expect(result).toEqual({ kind: "fallback", reason: "llm_disabled" });
    expect(deps.lookupStyleAlias).not.toHaveBeenCalled();
    expect(deps.callAnthropic).not.toHaveBeenCalled();
  });

  it("returns alias_hit and never calls Claude when the alias table already has a mapping", async () => {
    const alias: MmrStyleAlias = {
      alias: "ram|1500 bighorn|big horn",
      canonicalMake: "Ram",
      canonicalModel: "1500",
      canonicalStyle: "4D Crew Cab Big Horn",
      source: "ingest_learned",
    };
    const deps = baseDeps({ lookupStyleAlias: vi.fn(async () => alias) });

    const result = await resolveListingWithLLM(INPUT, deps);

    expect(result).toEqual({
      kind: "alias_hit",
      make: "Ram",
      model: "1500",
      style: "4D Crew Cab Big Horn",
    });
    expect(deps.callAnthropic).not.toHaveBeenCalled();
  });

  it("falls back with catalog_not_synced when the tree has no rows for this year", async () => {
    const deps = baseDeps({ hasTreeForYear: vi.fn(async () => false) });
    const result = await resolveListingWithLLM(INPUT, deps);
    expect(result).toEqual({ kind: "fallback", reason: "catalog_not_synced" });
    expect(deps.callAnthropic).not.toHaveBeenCalled();
  });

  it("falls back with catalog_not_synced when the make has zero rows for this year", async () => {
    const deps = baseDeps({ loadTreeRows: vi.fn(async () => []) });
    const result = await resolveListingWithLLM(INPUT, deps);
    expect(result).toEqual({ kind: "fallback", reason: "catalog_not_synced" });
  });

  it("returns llm_hit for a confident, valid, non-review proposal", async () => {
    const deps = baseDeps({
      callAnthropic: vi.fn(async (): Promise<AnthropicCallResult> => ({
        kind: "ok",
        proposal: {
          make: "Ram",
          model: "1500",
          style: "4D Crew Cab Big Horn",
          confidence: 0.9,
          reasoning: "Crew Cab + Big Horn in title",
          needsReview: false,
        },
        latencyMs: 1200,
        model: "claude-sonnet-5",
      })),
    });

    const result = await resolveListingWithLLM(INPUT, deps);

    expect(result).toEqual({
      kind: "llm_hit",
      make: "Ram",
      model: "1500",
      style: "4D Crew Cab Big Horn",
      confidence: 0.9,
      reasoning: "Crew Cab + Big Horn in title",
      latencyMs: 1200,
      anthropicModel: "claude-sonnet-5",
      catalogRowCount: ROWS.length,
    });
  });

  it("returns llm_needs_review for a valid pick at or below the auto-accept threshold", async () => {
    const deps = baseDeps({
      callAnthropic: vi.fn(async (): Promise<AnthropicCallResult> => ({
        kind: "ok",
        proposal: {
          make: "Ram",
          model: "1500",
          style: "4D Crew Cab Laramie",
          confidence: 0.4,
          reasoning: "Ambiguous between Big Horn and Laramie",
          needsReview: true,
        },
        latencyMs: 900,
        model: "claude-sonnet-5",
      })),
    });

    const result = await resolveListingWithLLM(INPUT, deps);
    expect(result.kind).toBe("llm_needs_review");
  });

  it("returns llm_hit for a valid pick above threshold even when needsReview is true (item 61)", async () => {
    const deps = baseDeps({
      callAnthropic: vi.fn(async (): Promise<AnthropicCallResult> => ({
        kind: "ok",
        proposal: {
          make: "Ram",
          model: "1500",
          style: "4D Crew Cab Big Horn",
          confidence: 0.85,
          reasoning: "Big Horn in title; hedging on drivetrain only",
          needsReview: true,
        },
        latencyMs: 900,
        model: "claude-sonnet-5",
      })),
    });

    const result = await resolveListingWithLLM(INPUT, deps);
    expect(result.kind).toBe("llm_hit");
  });

  it("returns llm_needs_review at exactly 0.5 confidence (strictly greater than 0.5 required)", async () => {
    const deps = baseDeps({
      callAnthropic: vi.fn(async (): Promise<AnthropicCallResult> => ({
        kind: "ok",
        proposal: {
          make: "Ram",
          model: "1500",
          style: "4D Crew Cab Big Horn",
          confidence: 0.5,
          reasoning: "borderline",
          needsReview: false,
        },
        latencyMs: 900,
        model: "claude-sonnet-5",
      })),
    });

    const result = await resolveListingWithLLM(INPUT, deps);
    expect(result.kind).toBe("llm_needs_review");
  });

  it("returns llm_hit at 0.51 confidence", async () => {
    const deps = baseDeps({
      callAnthropic: vi.fn(async (): Promise<AnthropicCallResult> => ({
        kind: "ok",
        proposal: {
          make: "Ram",
          model: "1500",
          style: "4D Crew Cab Big Horn",
          confidence: 0.51,
          reasoning: "just above threshold",
          needsReview: true,
        },
        latencyMs: 900,
        model: "claude-sonnet-5",
      })),
    });

    const result = await resolveListingWithLLM(INPUT, deps);
    expect(result.kind).toBe("llm_hit");
  });

  it("returns llm_invalid_pick when the proposal is not in the given subtree, even if needsReview is false", async () => {
    const deps = baseDeps({
      callAnthropic: vi.fn(async (): Promise<AnthropicCallResult> => ({
        kind: "ok",
        proposal: {
          make: "Ram",
          model: "Rebel TRX",
          style: "Made Up Trim",
          confidence: 0.95,
          reasoning: "hallucinated",
          needsReview: false,
        },
        latencyMs: 800,
        model: "claude-sonnet-5",
      })),
    });

    const result = await resolveListingWithLLM(INPUT, deps);
    expect(result.kind).toBe("llm_invalid_pick");
  });

  it("maps every non-ok Anthropic call kind to the matching fallback reason", async () => {
    const cases: Array<[AnthropicCallResult["kind"], string]> = [
      ["not_configured", "not_configured"],
      ["timeout", "timeout"],
      ["rate_limited", "rate_limited"],
      ["http_error", "http_error"],
      ["invalid_response", "invalid_response"],
    ];

    for (const [callKind, expectedReason] of cases) {
      const deps = baseDeps({
        callAnthropic: vi.fn(async (): Promise<AnthropicCallResult> =>
          callKind === "http_error" ? { kind: "http_error", status: 503 } : ({ kind: callKind } as AnthropicCallResult),
        ),
      });
      const result = await resolveListingWithLLM(INPUT, deps);
      expect(result).toEqual({ kind: "fallback", reason: expectedReason });
    }
  });
});

describe("isLlmAttemptFailure", () => {
  it("is true only for reasons meaning Claude was actually called and failed", () => {
    expect(isLlmAttemptFailure({ kind: "fallback", reason: "timeout" })).toBe(true);
    expect(isLlmAttemptFailure({ kind: "fallback", reason: "rate_limited" })).toBe(true);
    expect(isLlmAttemptFailure({ kind: "fallback", reason: "http_error" })).toBe(true);
    expect(isLlmAttemptFailure({ kind: "fallback", reason: "invalid_response" })).toBe(true);
  });

  it("is false for reasons meaning the LLM path was never attempted", () => {
    expect(isLlmAttemptFailure({ kind: "fallback", reason: "llm_disabled" })).toBe(false);
    expect(isLlmAttemptFailure({ kind: "fallback", reason: "not_configured" })).toBe(false);
    expect(isLlmAttemptFailure({ kind: "fallback", reason: "catalog_not_synced" })).toBe(false);
  });

  it("is false for hit/review/invalid kinds", () => {
    const hit: LlmYmmsResolution = {
      kind: "llm_hit",
      make: "Ram",
      model: "1500",
      style: "Big Horn",
      confidence: 0.9,
      reasoning: "x",
      latencyMs: 1,
      anthropicModel: "m",
      catalogRowCount: 2,
    };
    expect(isLlmAttemptFailure(hit)).toBe(false);
  });
});

describe("llmResolutionToAuditFields", () => {
  it("flattens an alias_hit", () => {
    expect(
      llmResolutionToAuditFields({ kind: "alias_hit", make: "Ram", model: "1500", style: "Big Horn" }),
    ).toEqual({ outcome: "alias_hit", proposedMake: "Ram", proposedModel: "1500", proposedStyle: "Big Horn" });
  });

  it("flattens a fallback with its reason", () => {
    expect(llmResolutionToAuditFields({ kind: "fallback", reason: "timeout" })).toEqual({
      outcome: "fallback",
      fallbackReason: "timeout",
    });
  });

  it("flattens an llm_invalid_pick, pulling fields from the nested proposal", () => {
    const result = llmResolutionToAuditFields({
      kind: "llm_invalid_pick",
      proposal: {
        make: "Ram",
        model: "Rebel TRX",
        style: "Made Up",
        confidence: 0.5,
        reasoning: "r",
        needsReview: false,
      },
      catalogRowCount: 5,
    });
    expect(result).toEqual({
      outcome: "llm_invalid_pick",
      proposedMake: "Ram",
      proposedModel: "Rebel TRX",
      proposedStyle: "Made Up",
      confidence: 0.5,
      reasoning: "r",
      catalogRowCount: 5,
    });
  });
});
