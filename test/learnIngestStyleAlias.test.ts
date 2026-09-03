import { describe, expect, it, vi } from "vitest";

import { maybeLearnIngestStyleAlias } from "../src/valuation/learnIngestStyleAlias";
import { upsertMmrStyleAlias } from "../src/persistence/mmrStyleAliases";

vi.mock("../src/persistence/mmrStyleAliases", () => ({
  buildListingStyleAliasKey: vi.fn(
    (
      make: string | null | undefined,
      model: string | null | undefined,
      trim: string | null | undefined,
      axisTokens?: readonly string[] | null,
    ) => {
      const base = [make, model, trim].map((part) => (part ?? "").trim().toLowerCase()).join("|");
      const axes = (axisTokens ?? []).map((token) => token.trim().toLowerCase()).filter(Boolean);
      return axes.length > 0 ? `${base}|${axes.join("|")}` : base;
    },
  ),
  upsertMmrStyleAlias: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/persistence/coxCatalogTree", () => ({
  loadCoxCatalogTreeForMake: vi.fn(async (_db, _year, make: string) => {
    if (make.toUpperCase().includes("JEEP")) {
      return [
        {
          year: 2018,
          make: "JEEP",
          model: "WRANGLER UNLIMITED V6",
          style: "4D SUV SPORT",
          searchText: "",
          variantKind: null,
        },
      ];
    }
    return [
      {
        year: 2022,
        make: "RAM",
        model: "1500",
        style: "4D Crew Cab Big Horn",
        searchText: "",
        variantKind: null,
      },
    ];
  }),
}));

describe("maybeLearnIngestStyleAlias (item 65)", () => {
  const db = {} as never;

  it("upserts ingest_learned alias on llm_hit when trim is present", async () => {
    const learned = await maybeLearnIngestStyleAlias(db, {
      year: 2022,
      listingMake: "Ram",
      listingModel: "1500 Bighorn",
      listingTrim: "big horn",
      llmResolution: {
        kind: "llm_hit",
        make: "RAM",
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
      canonicalMake: "RAM",
      canonicalModel: "1500",
      canonicalStyle: "4D Crew Cab Big Horn",
      source: "ingest_learned",
    });
  });

  it("uses title trim in alias key when listing trim is empty", async () => {
    vi.mocked(upsertMmrStyleAlias).mockClear();
    const learned = await maybeLearnIngestStyleAlias(db, {
      year: 2018,
      listingMake: "jeep",
      listingModel: "wrangler unlimited",
      listingTrim: null,
      listingTitle: "2018 Jeep Wrangler Unlimited · All New Sport SUV 4D",
      llmResolution: {
        kind: "llm_hit",
        make: "JEEP",
        model: "WRANGLER UNLIMITED V6",
        style: "4D SUV SPORT",
        confidence: 0.9,
        reasoning: "Sport trim",
        latencyMs: 900,
        anthropicModel: "claude-sonnet-5",
        catalogRowCount: 10,
      },
    });

    expect(learned).toBe(true);
    expect(upsertMmrStyleAlias).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ aliasKey: "jeep|wrangler unlimited|sport" }),
    );
  });

  it("appends drivetrain and cab to the learned key when the listing names them", async () => {
    vi.mocked(upsertMmrStyleAlias).mockClear();
    const learned = await maybeLearnIngestStyleAlias(db, {
      year: 2022,
      listingMake: "Ram",
      listingModel: "1500 Bighorn",
      listingTrim: "big horn",
      listingTitle: "2022 Ram 1500 Big Horn Crew Cab 4x4",
      llmResolution: {
        kind: "llm_hit",
        make: "RAM",
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
    expect(upsertMmrStyleAlias).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ aliasKey: "ram|1500 bighorn|big horn|4wd|crew" }),
    );
  });

  it("no-ops for alias_hit (already learned)", async () => {
    vi.mocked(upsertMmrStyleAlias).mockClear();
    const learned = await maybeLearnIngestStyleAlias(db, {
      year: 2022,
      listingMake: "Ram",
      listingModel: "1500",
      listingTrim: "big horn",
      llmResolution: {
        kind: "alias_hit",
        make: "RAM",
        model: "1500",
        style: "4D Crew Cab Big Horn",
      },
    });

    expect(learned).toBe(false);
    expect(upsertMmrStyleAlias).not.toHaveBeenCalled();
  });

  it("no-ops when trim cannot be resolved (no catch-all aliases)", async () => {
    vi.mocked(upsertMmrStyleAlias).mockClear();
    const learned = await maybeLearnIngestStyleAlias(db, {
      year: 2022,
      listingMake: "Ram",
      listingModel: "1500",
      listingTrim: null,
      listingTitle: "2022 Ram 1500",
      llmResolution: {
        kind: "offline_hit",
        make: "RAM",
        model: "1500",
        style: "4D Crew Cab Big Horn",
        score: 90,
        catalogRowCount: 10,
      },
    });

    expect(learned).toBe(false);
    expect(upsertMmrStyleAlias).not.toHaveBeenCalled();
  });

  it("no-ops when canonical tokens are not in catalog tree", async () => {
    vi.mocked(upsertMmrStyleAlias).mockClear();
    const learned = await maybeLearnIngestStyleAlias(db, {
      year: 2018,
      listingMake: "jeep",
      listingModel: "wrangler unlimited",
      listingTrim: "sport",
      llmResolution: {
        kind: "llm_hit",
        make: "JEEP",
        model: "WRANGLER UNLIMITED",
        style: "4D SUV SAHARA",
        confidence: 0.9,
        reasoning: "wrong model",
        latencyMs: 900,
        anthropicModel: "claude-sonnet-5",
        catalogRowCount: 10,
      },
    });

    expect(learned).toBe(false);
    expect(upsertMmrStyleAlias).not.toHaveBeenCalled();
  });

  it("no-ops for llm_needs_review", async () => {
    vi.mocked(upsertMmrStyleAlias).mockClear();
    const learned = await maybeLearnIngestStyleAlias(db, {
      year: 2020,
      listingMake: "Ford",
      listingModel: "F-150",
      listingTrim: "xlt",
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
        latencyMs: 900,
        anthropicModel: "claude-sonnet-5",
      },
    });

    expect(learned).toBe(false);
    expect(upsertMmrStyleAlias).not.toHaveBeenCalled();
  });

  it("no-ops when listing make/model are empty", async () => {
    vi.mocked(upsertMmrStyleAlias).mockClear();
    const learned = await maybeLearnIngestStyleAlias(db, {
      year: 2020,
      listingMake: "  ",
      listingModel: "",
      listingTrim: "xlt",
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
