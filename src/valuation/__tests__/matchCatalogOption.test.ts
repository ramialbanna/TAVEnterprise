import { describe, expect, it } from "vitest";

import {
  matchCatalogOption,
  pickCatalogOptionFuzzy,
  squashCatalogToken,
} from "../matchCatalogOption";

/** The makes Cox spells with spaces or hyphens where our parser does not. */
const COX_MAKES = [
  "ALFA ROMEO",
  "AM GENERAL",
  "ASTON MARTIN",
  "B M W",
  "CHEVROLET",
  "FORD",
  "LAND ROVER",
  "MERCEDES-BENZ",
  "MV-1",
  "ROLLS-ROYCE",
];

describe("squashCatalogToken", () => {
  it("drops spaces and punctuation", () => {
    expect(squashCatalogToken("B M W")).toBe("bmw");
    expect(squashCatalogToken("MERCEDES-BENZ")).toBe("mercedesbenz");
    expect(squashCatalogToken("MV-1")).toBe("mv1");
  });

  it("keeps distinct makes distinct", () => {
    const squashed = COX_MAKES.map(squashCatalogToken);
    expect(new Set(squashed).size).toBe(COX_MAKES.length);
  });
});

describe("matchCatalogOption — item 72 punctuation-insensitive tier", () => {
  it("matches our `bmw` to Cox's `B M W`", () => {
    expect(matchCatalogOption(COX_MAKES, "bmw")).toBe("B M W");
    expect(matchCatalogOption(COX_MAKES, "BMW")).toBe("B M W");
  });

  it("matches the other spaced and hyphenated makes", () => {
    expect(matchCatalogOption(COX_MAKES, "mercedes-benz")).toBe("MERCEDES-BENZ");
    expect(matchCatalogOption(COX_MAKES, "mercedesbenz")).toBe("MERCEDES-BENZ");
    expect(matchCatalogOption(COX_MAKES, "land rover")).toBe("LAND ROVER");
    expect(matchCatalogOption(COX_MAKES, "rollsroyce")).toBe("ROLLS-ROYCE");
  });

  it("still prefers an exact match over a squashed one", () => {
    expect(matchCatalogOption(["RAV4 AWD", "RAV4AWD"], "RAV4 AWD")).toBe("RAV4 AWD");
  });

  it("does not invent a match for an unknown make", () => {
    expect(matchCatalogOption(COX_MAKES, "peugeot")).toBeNull();
    expect(matchCatalogOption(COX_MAKES, "")).toBeNull();
  });
});

describe("pickCatalogOptionFuzzy", () => {
  it("resolves the make that previously fell through to no catalog at all", () => {
    expect(pickCatalogOptionFuzzy(COX_MAKES, "bmw")).toBe("B M W");
  });

  it("keeps the existing verbose-model behaviour", () => {
    expect(pickCatalogOptionFuzzy(["Sportage"], "sportage fe")).toBe("Sportage");
  });
});
