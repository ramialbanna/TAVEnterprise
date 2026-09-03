import { describe, expect, it } from "vitest";

import {
  catalogStyleContainsListingTrim,
  findProvenBookableCombo,
  isProvenBookableCombo,
  provenBookableKey,
} from "../provenBookable";

const COMBOS = [
  { make: "B M W", model: "X SERIES", style: "4D SUV X3 XDRIVE30I" },
  { make: "FORD", model: "F-150", style: "SUPERCREW XLT" },
  { make: "CHEVROLET", model: "1500 SILVERADO 4WD V8", style: "CREW CAB 5.3L LT" },
];

describe("provenBookableKey", () => {
  it("ignores punctuation and case so listing tokens can match Cox spelling", () => {
    expect(provenBookableKey("bmw", "x series", "4d suv x3 xdrive30i")).toBe(
      provenBookableKey("B M W", "X SERIES", "4D SUV X3 XDRIVE30I"),
    );
  });
});

describe("findProvenBookableCombo", () => {
  it("returns the booked row on an exact token match", () => {
    expect(findProvenBookableCombo(COMBOS, COMBOS[1]!)).toEqual(COMBOS[1]);
  });

  it("returns Cox's spelling when the pick squash-equals a booked row", () => {
    expect(
      findProvenBookableCombo(COMBOS, {
        make: "bmw",
        model: "x-series",
        style: "4d suv x3 xdrive30i",
      }),
    ).toEqual(COMBOS[0]);
  });

  it("returns null for listing garbage that has never booked", () => {
    expect(
      findProvenBookableCombo(COMBOS, {
        make: "bmw",
        model: "x5",
        style: "Performance",
      }),
    ).toBeNull();
    expect(
      isProvenBookableCombo(COMBOS, {
        make: "GMC",
        model: "🩷 gmc",
        style: "SLT",
      }),
    ).toBe(false);
  });

  it("returns null when the allowlist is empty, so callers fail open", () => {
    expect(findProvenBookableCombo([], COMBOS[0]!)).toBeNull();
  });
});

describe("catalogStyleContainsListingTrim", () => {
  it("matches XLT as its own token in a Cox style", () => {
    expect(catalogStyleContainsListingTrim("SUPERCREW XLT 4WD", "XLT")).toBe(true);
    expect(catalogStyleContainsListingTrim("SUPERCREW XLT 4WD", "xlt")).toBe(true);
  });

  it("does not treat LT as a hit inside XLT", () => {
    expect(catalogStyleContainsListingTrim("SUPERCREW XLT 4WD", "LT")).toBe(false);
  });

  it("requires every listing-trim token to appear", () => {
    expect(catalogStyleContainsListingTrim("SUPERCREW KING RANCH", "King Ranch")).toBe(true);
    expect(catalogStyleContainsListingTrim("SUPERCREW XLT", "King Ranch")).toBe(false);
  });
});
