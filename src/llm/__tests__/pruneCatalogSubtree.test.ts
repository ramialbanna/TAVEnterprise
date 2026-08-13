import { describe, expect, it } from "vitest";
import { pruneCatalogSubtreeForLlm } from "../pruneCatalogSubtree";
import type { CoxCatalogTreeRow } from "../../valuation/matchListingToCoxCatalog";

function row(make: string, model: string, style: string): CoxCatalogTreeRow {
  return { year: 2020, make, model, style, searchText: "", variantKind: null };
}

describe("pruneCatalogSubtreeForLlm (§70)", () => {
  const fordRows = [
    row("Ford", "F-150", "4D SuperCrew XLT"),
    row("Ford", "F-150", "4D SuperCrew Lariat"),
    row("Ford", "Explorer", "4D XLT"),
    row("Ford", "Mustang", "2D GT"),
  ];

  it("returns all rows for makes outside Ford/Chevy", () => {
    const rows = [row("Toyota", "Camry", "4D SE")];
    expect(pruneCatalogSubtreeForLlm({ make: "Toyota", model: "Camry", title: "2020 Camry" }, rows)).toEqual(rows);
  });

  it("keeps only Ford models matching parser hint or title", () => {
    const pruned = pruneCatalogSubtreeForLlm(
      { make: "Ford", model: "F-150", title: "2016 Ford F-150 SuperCrew XLT" },
      fordRows,
    );
    expect(pruned.every((entry) => entry.model === "F-150")).toBe(true);
    expect(pruned.length).toBe(2);
  });

  it("falls back to full subtree when no model matches", () => {
    const pruned = pruneCatalogSubtreeForLlm(
      { make: "Ford", model: "Maverick", title: "2022 Ford truck" },
      fordRows,
    );
    expect(pruned.length).toBe(fordRows.length);
  });
});
