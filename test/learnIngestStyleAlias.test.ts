import { describe, expect, it, vi } from "vitest";

import { maybeLearnIngestStyleAlias } from "../src/valuation/learnIngestStyleAlias";
import { upsertMmrStyleAlias } from "../src/persistence/mmrStyleAliases";

vi.mock("../src/persistence/mmrStyleAliases", () => ({
  buildListingStyleAliasKey: vi.fn(
    (make: string | null | undefined, model: string | null | undefined, trim: string | null | undefined) =>
      [make, model, trim].map((part) => (part ?? "").trim().toLowerCase()).join("|"),
  ),
  upsertMmrStyleAlias: vi.fn().mockResolvedValue(undefined),
}));

describe("maybeLearnIngestStyleAlias (item 65)", () => {
  const db = {} as never;

  it("upserts ingest_learned alias on llm_hit", async () => {
    const learned = await maybeLearnIngestStyleAlias(db, {
      listingMake: "Ram",
      listingModel: "1500 Bighorn",
      listingTrim: "big horn",
      llmResolution: {
        kind: "llm_hit",
        make: "Ram",
        model: "1500",
        style: "4D Crew Cab Big Horn",
        confidence: 0.9,
        reasoning: "title match",
        latencyMs: 900,
        anthropicModel: "claude-sonnet-5",
        catalogRowCount: 10,
      },
    });

    expect(learned).toBe(true);
    expect(upsertMmrStyleAlias).toHaveBeenCalledWith(db, {
      aliasKey: "ram|1500 bighorn|big horn",
      canonicalMake: "Ram",
      canonicalModel: "1500",
      canonicalStyle: "4D Crew Cab Big Horn",
      source: "ingest_learned",
    });
  });

  it("no-ops for alias_hit (already learned)", async () => {
    vi.mocked(upsertMmrStyleAlias).mockClear();
    const learned = await maybeLearnIngestStyleAlias(db, {
      listingMake: "Ram",
      listingModel: "1500",
      listingTrim: null,
      llmResolution: {
        kind: "alias_hit",
        make: "Ram",
        model: "1500",
        style: "4D Crew Cab Big Horn",
      },
    });

    expect(learned).toBe(false);
    expect(upsertMmrStyleAlias).not.toHaveBeenCalled();
  });

  it("no-ops for llm_needs_review", async () => {
    vi.mocked(upsertMmrStyleAlias).mockClear();
    const learned = await maybeLearnIngestStyleAlias(db, {
      listingMake: "Ford",
      listingModel: "F-150",
      listingTrim: null,
      llmResolution: {
        kind: "llm_needs_review",
        proposal: {
          make: "Ford",
          model: "F-150",
          style: "4D SuperCrew XLT",
          confidence: 0.4,
          needsReview: true,
          reasoning: "unsure cab",
        },
        catalogRowCount: 50,
      },
    });

    expect(learned).toBe(false);
    expect(upsertMmrStyleAlias).not.toHaveBeenCalled();
  });

  it("no-ops when listing make/model are empty", async () => {
    vi.mocked(upsertMmrStyleAlias).mockClear();
    const learned = await maybeLearnIngestStyleAlias(db, {
      listingMake: "  ",
      listingModel: "",
      listingTrim: null,
      llmResolution: {
        kind: "llm_hit",
        make: "Ford",
        model: "F-150",
        style: "4D SuperCrew XLT",
        confidence: 0.9,
        reasoning: "ok",
        latencyMs: 1,
        anthropicModel: "claude-sonnet-5",
        catalogRowCount: 1,
      },
    });

    expect(learned).toBe(false);
    expect(upsertMmrStyleAlias).not.toHaveBeenCalled();
  });
});
