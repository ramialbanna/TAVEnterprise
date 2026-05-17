import { describe, it, expect } from "vitest";
import { extractTitleTrim } from "../extractTitleTrim";

describe("extractTitleTrim", () => {
  it("pulls a multi-word body token from the title", () => {
    expect(extractTitleTrim("2019 Ram 2500 Long Bed")).toBe("Long Bed");
  });

  it("pulls an EV range trim", () => {
    expect(extractTitleTrim("2023 Tesla Model 3 Standard Range")).toBe("Standard Range");
  });

  it("pulls a common pickup trim", () => {
    expect(extractTitleTrim("2020 Ram 1500 Big Horn Crew Cab")).toBe("Big Horn");
  });

  it("prefers the longest match when several tokens are present", () => {
    // "Crew Cab" (8) beats "LT" — longest, most specific wins.
    expect(extractTitleTrim("2018 Chevrolet Silverado 1500 LT Crew Cab")).toBe("Crew Cab");
  });

  it("is case-insensitive", () => {
    expect(extractTitleTrim("2017 ford f-150 lariat")).toBe("Lariat");
  });

  it("returns null when the title has no recognized trim/body token", () => {
    expect(extractTitleTrim("2011 Ram 2500")).toBeNull();
  });

  it("returns null for empty / nullish input", () => {
    expect(extractTitleTrim("")).toBeNull();
    expect(extractTitleTrim(null)).toBeNull();
    expect(extractTitleTrim(undefined)).toBeNull();
  });

  it("matches whole words only (no substring false positives)", () => {
    // "XL" must not match inside "XLERATOR" etc.
    expect(extractTitleTrim("2015 Honda XLERATOR Edition")).toBeNull();
  });
});
