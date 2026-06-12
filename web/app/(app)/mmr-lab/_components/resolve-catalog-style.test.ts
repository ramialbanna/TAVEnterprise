import { describe, expect, it } from "vitest";
import { resolveCatalogStyle } from "./resolve-catalog-style";

describe("resolveCatalogStyle", () => {
  const styles = ["4D SUV LONG RANGE", "4D SUV PERFORMANCE"];

  it("returns exact match when trim equals catalog style", () => {
    expect(resolveCatalogStyle(styles, "4D SUV PERFORMANCE")).toEqual({
      style: "4D SUV PERFORMANCE",
      isEstimated: false,
    });
  });

  it("returns approximate match when trim is close but not exact", () => {
    const resolved = resolveCatalogStyle(styles, "Performance");
    expect(resolved?.style).toBe("4D SUV PERFORMANCE");
    expect(resolved?.isEstimated).toBe(true);
  });

  it("falls back to first style when trim is empty", () => {
    expect(resolveCatalogStyle(styles, null)).toEqual({
      style: "4D SUV LONG RANGE",
      isEstimated: true,
    });
  });
});
