import { describe, expect, it } from "vitest";
import {
  buildCatalogSubtreeText,
  buildYmmsAnthropicPrompt,
  buildYmmsCatalogCacheText,
  buildYmmsListingEvidenceText,
  buildYmmsUserPrompt,
  classifyYmmsProposalIngestOutcome,
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

describe("buildYmmsCatalogCacheText", () => {
  it("includes year, make, and the full catalog subtree only", () => {
    const rows = [row("1500", "4D Crew Cab Big Horn")];
    const text = buildYmmsCatalogCacheText({ year: 2022, make: "Ram" }, rows);

    expect(text).toContain("Year: 2022");
    expect(text).toContain("Make (already resolved, do not change): Ram");
    expect(text).toContain("4D Crew Cab Big Horn");
    expect(text).not.toContain("Listing title");
    expect(text).not.toContain("hypothesis");
  });
});

describe("buildYmmsListingEvidenceText", () => {
  it("includes per-listing evidence without the catalog subtree", () => {
    const text = buildYmmsListingEvidenceText({
      year: 2022,
      make: "Ram",
      model: "1500",
      trim: "bighorn",
      title: "2022 Ram 1500 Big Horn Crew Cab 4x4",
      description: "Clean title",
      price: 32000,
      priorMissReason: "model_variant_missing",
    });

    expect(text).toContain("hypothesis");
    expect(text).toContain("2022 Ram 1500 Big Horn Crew Cab 4x4");
    expect(text).toContain("Clean title");
    expect(text).not.toContain("All Cox models + styles");
  });
});

describe("buildYmmsAnthropicPrompt", () => {
  it("splits catalog cache from listing evidence", () => {
    const rows = [row("1500", "4D Crew Cab Big Horn")];
    const parts = buildYmmsAnthropicPrompt(
      { year: 2022, make: "Ram", title: "2022 Ram 1500" },
      rows,
    );

    expect(parts.catalogCacheText).toContain("4D Crew Cab Big Horn");
    expect(parts.listingEvidenceText).toContain("2022 Ram 1500");
  });
});

describe("buildYmmsUserPrompt", () => {
  it("includes listing evidence and the full catalog subtree (catalog first)", () => {
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

    const catalogIdx = prompt.indexOf("4D Crew Cab Big Horn");
    const titleIdx = prompt.indexOf("2022 Ram 1500 Big Horn Crew Cab 4x4");
    expect(catalogIdx).toBeGreaterThan(-1);
    expect(titleIdx).toBeGreaterThan(catalogIdx);

    expect(prompt).toContain("Year: 2022");
    expect(prompt).toContain("Make (already resolved, do not change): Ram");
    expect(prompt).toContain("hypothesis");
    expect(prompt).toContain("Listing price: $32000");
    expect(prompt).toContain("model_variant_missing");
  });

  it("falls back to (none) placeholders when title/description are absent", () => {
    const prompt = buildYmmsUserPrompt({ year: 2020, make: "Honda" }, []);
    expect(prompt).toContain("Listing title (evidence):\n(none)");
    expect(prompt).toContain("Listing description (evidence):\n(none)");
  });

  it("includes rich seller text fields for ambiguous truck titles", () => {
    const rows = [row("F-150", "4D SuperCrew XLT 4WD")];
    const prompt = buildYmmsUserPrompt(
      {
        year: 2016,
        make: "Ford",
        model: "F-150",
        trim: "short bed",
        title: "2016 Ford F-150 · Short Bed",
        description: "SuperCrew XLT 4x4, 5.0L V8, clean Carfax.",
        condition: "USED",
        listingMileage: 89000,
        location: "Dallas, TX",
      },
      rows,
    );

    expect(prompt).toContain("SuperCrew XLT 4x4");
    expect(prompt).toContain("Listing condition (evidence):\nUSED");
    expect(prompt).toContain("89000 mi");
    expect(prompt).toContain("Dallas, TX");
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

describe("classifyYmmsProposalIngestOutcome", () => {
  const rows = [row("1500", "4D Crew Cab Big Horn")];

  it("returns llm_hit above 0.5 even when needsReview is true", () => {
    expect(
      classifyYmmsProposalIngestOutcome(
        {
          make: "Ram",
          model: "1500",
          style: "4D Crew Cab Big Horn",
          confidence: 0.85,
          reasoning: "x",
          needsReview: true,
        },
        rows,
      ),
    ).toBe("llm_hit");
  });

  it("returns llm_needs_review at exactly 0.5", () => {
    expect(
      classifyYmmsProposalIngestOutcome(
        {
          make: "Ram",
          model: "1500",
          style: "4D Crew Cab Big Horn",
          confidence: 0.5,
          reasoning: "x",
          needsReview: false,
        },
        rows,
      ),
    ).toBe("llm_needs_review");
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
