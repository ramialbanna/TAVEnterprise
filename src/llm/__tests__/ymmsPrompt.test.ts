import { describe, expect, it } from "vitest";
import {
  buildCatalogSubtreeText,
  buildYmmsAnthropicPrompt,
  buildYmmsCatalogCacheText,
  buildYmmsListingEvidenceText,
  buildYmmsUserPrompt,
  classifyYmmsProposalIngestOutcome,
  findCoxPickRow,
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
    expect(prompt).not.toContain("Dallas, TX");
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

describe("findCoxPickRow — item 72 catalog vocabulary", () => {
  const bmwRows: CoxCatalogTreeRow[] = [
    { year: 2022, make: "B M W", model: "X SERIES", style: "X5 4D SUV M50I", searchText: "", variantKind: null },
    { year: 2022, make: "B M W", model: "X SERIES", style: "X5 4D SUV 40I", searchText: "", variantKind: null },
  ];

  /** Exactly what production returned on 2026-08-13: right pick, wrong make spelling. */
  const bmwProposal: YmmsProposal = {
    make: "bmw",
    model: "X SERIES",
    style: "X5 4D SUV M50I",
    confidence: 0.97,
    reasoning: "listing says X5 M50i",
    needsReview: false,
  };

  it("accepts a pick whose make differs from Cox only by spacing", () => {
    expect(findCoxPickRow(bmwProposal, bmwRows)?.style).toBe("X5 4D SUV M50I");
  });

  it("returns Cox's spelling so Manheim receives catalog tokens", () => {
    expect(findCoxPickRow(bmwProposal, bmwRows)?.make).toBe("B M W");
  });

  it("classifies that pick as a hit rather than an invalid pick", () => {
    expect(classifyYmmsProposalIngestOutcome(bmwProposal, bmwRows)).toBe("llm_hit");
  });

  it("still rejects a style that does not exist under the make", () => {
    expect(findCoxPickRow({ ...bmwProposal, style: "X5 4D SUV 55I" }, bmwRows)).toBeNull();
  });

  it("refuses a loose match when it cannot pick between siblings", () => {
    // Neither row matches exactly, and both collapse to the same squashed
    // tokens — choosing either would be a coin flip between two styles.
    const ambiguous: CoxCatalogTreeRow[] = [
      { year: 2022, make: "B M W", model: "X SERIES", style: "X5 40I", searchText: "", variantKind: null },
      { year: 2022, make: "BMW", model: "XSERIES", style: "X-5 40I", searchText: "", variantKind: null },
    ];
    expect(
      findCoxPickRow({ ...bmwProposal, make: "bmw", model: "XSERIES", style: "X540I" }, ambiguous),
    ).toBeNull();
  });

  it("prefers an exact match over a squashed one", () => {
    const rows: CoxCatalogTreeRow[] = [
      { year: 2022, make: "B M W", model: "X SERIES", style: "X5 40I", searchText: "", variantKind: null },
      { year: 2022, make: "B M W", model: "XSERIES", style: "X540I", searchText: "", variantKind: null },
    ];
    const picked = findCoxPickRow(
      { ...bmwProposal, make: "B M W", model: "X SERIES", style: "X5 40I" },
      rows,
    );
    expect(picked?.model).toBe("X SERIES");
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
