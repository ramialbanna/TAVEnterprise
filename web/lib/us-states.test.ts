import { describe, expect, it } from "vitest";

import {
  isKnownUsStateCode,
  normalizeStoredUsState,
  US_STATES,
} from "./us-states";

describe("US_STATES", () => {
  it("lists all 50 states", () => {
    expect(US_STATES).toHaveLength(50);
  });
});

describe("normalizeStoredUsState", () => {
  it("returns empty for blank input", () => {
    expect(normalizeStoredUsState(null)).toBe("");
    expect(normalizeStoredUsState("")).toBe("");
    expect(normalizeStoredUsState("   ")).toBe("");
  });

  it("normalizes 2-letter codes to uppercase", () => {
    expect(normalizeStoredUsState("tx")).toBe("TX");
    expect(normalizeStoredUsState("TX")).toBe("TX");
  });

  it("maps full state names to codes", () => {
    expect(normalizeStoredUsState("Texas")).toBe("TX");
    expect(normalizeStoredUsState("new york")).toBe("NY");
  });

  it("preserves unrecognized legacy free-text", () => {
    expect(normalizeStoredUsState("Dallas County")).toBe("Dallas County");
  });
});

describe("isKnownUsStateCode", () => {
  it("recognizes valid codes", () => {
    expect(isKnownUsStateCode("TX")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isKnownUsStateCode("Dallas County")).toBe(false);
    expect(isKnownUsStateCode("Texas")).toBe(false);
  });
});
