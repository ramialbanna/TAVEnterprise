import { describe, expect, it } from "vitest";
import {
  buildCatalogSubtreeText,
  buildYmmsUserPrompt,
  isValidCoxPick,
  YMMS_TOOL,
  type YmmsProposal,
} from "../ymmsPrompt";
import type { CoxCatalogTreeRow } from "../../valuation/matchListingToCoxCatalog";

function row(model: string, style: string): CoxCatalogTreeRow {
  return { year: 2022, make: "Ram", model, style, searchText: "", variantKind: null };
}

describe("buildCatalogSubtreeText", () => {
  it("groups styles under their model, deduped and sorted", () => {
    const rows = [
      row("1500", "4D Crew Cab Big Horn"),
      row("1500", "4D Crew Cab Laramie"),
      row("1500", "4D Crew Cab Big Horn"), // duplicate — must not repeat
      row("1500 Classic", "4D Crew Cab SLT"),
    ];

    const text = buildCatalogSubtreeText(rows);

    expect(text).toBe(
      [
        "1500",
        "  - 4D Crew Cab Big Horn",
        "  - 4D Crew Cab Laramie",
        "1500 Classic",
        "  - 4D Crew Cab SLT",
      ].join("\n"),
    );
  });

  it("returns an empty string for no rows", () => {
    expect(buildCatalogSubtreeText([])).toBe("");
  });
});

describe("buildYmmsUserPrompt", () => {
  it("includes listing evidence and the full catalog subtree", () => {
    const rows = [row("1500", "4D Crew Cab Big Horn")];
    const prompt = buildYmmsUserPrompt(
      {
        year: 2022,
        make: "Ram",
        model: "1500",
        trim: "bighorn",
        title: "2022 Ram 1500 Big Horn Crew Cab 4x4",
        description: null,
        price: 32000,
        priorMissReason: "model_variant_missing",
      },
      rows,
    );

    expect(prompt).toContain("Year: 2022");
    expect(prompt).toContain("Make (already resolved, do not change): Ram");
    expect(prompt).toContain("2022 Ram 1500 Big Horn Crew Cab 4x4");
    expect(prompt).toContain("Listing price: $32000");
    expect(prompt).toContain("model_variant_missing");
    expect(prompt).toContain("4D Crew Cab Big Horn");
  });

  it("falls back to (none) placeholders when title/description are absent", () => {
    const prompt = buildYmmsUserPrompt({ year: 2020, make: "Honda" }, []);
    expect(prompt).toContain("Listing title:\n(none)");
    expect(prompt).toContain("Listing description:\n(none)");
  });
});

describe("isValidCoxPick", () => {
  const rows = [row("1500", "4D Crew Cab Big Horn"), row("1500 Classic", "4D Crew Cab SLT")];

  function proposal(overrides: Partial<YmmsProposal> = {}): YmmsProposal {
    return {
      make: "Ram",
      model: "1500",
      style: "4D Crew Cab Big Horn",
      confidence: 0.9,
      reasoning: "test",
      needsReview: false,
      ...overrides,
    };
  }

  it("accepts an exact case-insensitive match against the given subtree", () => {
    expect(isValidCoxPick(proposal({ style: "4d crew cab big horn" }), rows)).toBe(true);
  });

  it("rejects a model/style combination that does not exist in the subtree", () => {
    expect(isValidCoxPick(proposal({ model: "1500 Classic" }), rows)).toBe(false);
  });

  it("rejects a fully hallucinated pick", () => {
    expect(isValidCoxPick(proposal({ model: "Rebel TRX", style: "Made Up Trim" }), rows)).toBe(false);
  });
});

describe("YMMS_TOOL", () => {
  it("requires all proposal fields", () => {
    expect(YMMS_TOOL.input_schema.required).toEqual([
      "make",
      "model",
      "style",
      "confidence",
      "reasoning",
      "needsReview",
    ]);
  });
});
