import { describe, expect, it } from "vitest";

import { resolveLastResortCatalogPick } from "../workerClient";
import type { LlmYmmsResolution } from "../resolveListingWithLLM";
import type { CatalogMatchSuggestion } from "../resolveListingToCatalog";

const CALL_META = { latencyMs: 10, anthropicModel: "claude-sonnet-5" };

function needsReview(canonical?: { make: string; model: string; style: string }): LlmYmmsResolution {
  return {
    kind: "llm_needs_review",
    proposal: {
      make: "bmw",
      model: "X SERIES",
      style: "X5 4D SUV 40I",
      confidence: 0.4,
      reasoning: "unsure",
      needsReview: true,
    },
    catalogRowCount: 182,
    ...(canonical && { canonical }),
    ...CALL_META,
  };
}

function suggestion(overrides: Partial<CatalogMatchSuggestion> = {}): CatalogMatchSuggestion {
  return {
    make: "Honda",
    model: "CR-V AWD",
    style: "4D Sport Utility LX",
    score: 55,
    estimatedVariant: true,
    estimatedStyle: true,
    ...overrides,
  };
}

describe("resolveLastResortCatalogPick", () => {
  it("prefers a needs-review pick over an offline suggestion", () => {
    const pick = resolveLastResortCatalogPick(
      needsReview({ make: "B M W", model: "X SERIES", style: "X5 4D SUV 40I" }),
      [suggestion()],
    );
    expect(pick).toEqual({
      make: "B M W",
      model: "X SERIES",
      style: "X5 4D SUV 40I",
      source: "llm_needs_review",
    });
  });

  it("uses Cox's spelling from the matched row, not Claude's proposal", () => {
    const pick = resolveLastResortCatalogPick(
      needsReview({ make: "B M W", model: "X SERIES", style: "X5 4D SUV 40I" }),
      undefined,
    );
    expect(pick?.make).toBe("B M W");
  });

  it("falls back to the top offline suggestion when the pick was not catalog-valid", () => {
    const pick = resolveLastResortCatalogPick(needsReview(), [
      suggestion(),
      suggestion({ model: "CR-V FWD", score: 50 }),
    ]);
    expect(pick).toEqual({
      make: "Honda",
      model: "CR-V AWD",
      style: "4D Sport Utility LX",
      source: "catalog_suggestion",
    });
  });

  it("returns null when there is no catalog candidate to offer", () => {
    expect(resolveLastResortCatalogPick({ kind: "fallback", reason: "catalog_not_synced" }, [])).toBeNull();
    expect(
      resolveLastResortCatalogPick({ kind: "fallback", reason: "catalog_not_synced" }, undefined),
    ).toBeNull();
  });

  it("ignores a suggestion missing a model or style, since a partial pick is not usable", () => {
    const pick = resolveLastResortCatalogPick({ kind: "fallback", reason: "timeout" }, [
      suggestion({ style: null }),
    ]);
    expect(pick).toBeNull();
  });

  it("offers nothing for an invalid pick with no suggestions, so the caller still abstains", () => {
    const invalid: LlmYmmsResolution = {
      kind: "llm_invalid_pick",
      proposal: {
        make: "Honda",
        model: "Made Up",
        style: "Nonsense",
        confidence: 0.9,
        reasoning: "",
        needsReview: false,
      },
      catalogRowCount: 40,
      ...CALL_META,
    };
    expect(resolveLastResortCatalogPick(invalid, [])).toBeNull();
  });

  it("skips an unbookable needs-review pick when a proven suggestion exists", () => {
    const pick = resolveLastResortCatalogPick(
      needsReview({ make: "B M W", model: "X SERIES", style: "X5 4D SUV 40I" }),
      [
        suggestion({ make: "B M W", model: "X SERIES", style: "4D SUV X3 SDRIVE30I", score: 50 }),
        suggestion({ make: "B M W", model: "X SERIES", style: "4D SUV X3 XDRIVE30I", score: 40 }),
      ],
      [{ make: "B M W", model: "X SERIES", style: "4D SUV X3 XDRIVE30I" }],
    );
    expect(pick).toEqual({
      make: "B M W",
      model: "X SERIES",
      style: "4D SUV X3 XDRIVE30I",
      source: "catalog_suggestion",
    });
  });

  it("rewrites a needs-review pick to Cox's booked spelling", () => {
    const pick = resolveLastResortCatalogPick(
      needsReview({ make: "bmw", model: "x series", style: "4d suv x3 xdrive30i" }),
      [],
      [{ make: "B M W", model: "X SERIES", style: "4D SUV X3 XDRIVE30I" }],
    );
    expect(pick).toEqual({
      make: "B M W",
      model: "X SERIES",
      style: "4D SUV X3 XDRIVE30I",
      source: "llm_needs_review",
    });
  });

  it("returns null when every candidate is unbookable and the allowlist is loaded", () => {
    expect(
      resolveLastResortCatalogPick(needsReview({ make: "B M W", model: "X SERIES", style: "X5 4D SUV 40I" }), [
        suggestion({ make: "B M W", model: "X SERIES", style: "4D SUV X3 SDRIVE30I" }),
      ], [{ make: "FORD", model: "F-150", style: "SUPERCREW XLT" }]),
    ).toBeNull();
  });

  it("does not constrain last-resort when the allowlist is empty", () => {
    const pick = resolveLastResortCatalogPick(
      needsReview({ make: "B M W", model: "X SERIES", style: "X5 4D SUV 40I" }),
      [],
      [],
    );
    expect(pick?.style).toBe("X5 4D SUV 40I");
  });

  it("does not walk to a far-behind booked sibling — that is the blind retry we rejected", () => {
    const pick = resolveLastResortCatalogPick(
      { kind: "fallback", reason: "timeout" },
      [
        suggestion({ make: "FORD", model: "F-150", style: "SUPERCREW LARIAT", score: 75 }),
        suggestion({ make: "FORD", model: "F-150", style: "SUPERCREW XLT", score: 40 }),
      ],
      [{ make: "FORD", model: "F-150", style: "SUPERCREW XLT" }],
    );
    expect(pick).toBeNull();
  });

  it("prefers the booked close suggestion whose style contains the listing trim", () => {
    const pick = resolveLastResortCatalogPick(
      { kind: "fallback", reason: "timeout" },
      [
        suggestion({ make: "FORD", model: "F-150", style: "SUPERCREW LARIAT", score: 55 }),
        suggestion({ make: "FORD", model: "F-150", style: "SUPERCREW XLT", score: 52 }),
      ],
      [
        { make: "FORD", model: "F-150", style: "SUPERCREW LARIAT" },
        { make: "FORD", model: "F-150", style: "SUPERCREW XLT" },
      ],
      "XLT",
    );
    expect(pick).toEqual({
      make: "FORD",
      model: "F-150",
      style: "SUPERCREW XLT",
      source: "catalog_suggestion",
    });
  });

  it("does not send a booked different trim when the listing named XLT", () => {
    const pick = resolveLastResortCatalogPick(
      { kind: "fallback", reason: "timeout" },
      [
        suggestion({ make: "FORD", model: "F-150", style: "SUPERCREW LARIAT", score: 55 }),
        suggestion({ make: "FORD", model: "F-150", style: "SUPERCREW PLATINUM", score: 50 }),
      ],
      [{ make: "FORD", model: "F-150", style: "SUPERCREW LARIAT" }],
      "XLT",
    );
    expect(pick).toBeNull();
  });
});
