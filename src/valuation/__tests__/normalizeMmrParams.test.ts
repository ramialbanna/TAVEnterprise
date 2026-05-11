import { describe, it, expect } from "vitest";
import {
  normalizeMmrParams,
  type ReferenceData,
} from "../normalizeMmrParams";

// ── Shared reference fixture ───────────────────────────────────────────────────
// Chevrolet: exact, with Silverado 1500 / Silverado 2500HD as models
// Honda:     exact, with Civic / CR-V as models; "crv" alias
// chevy/chev: make aliases → Chevrolet
// Toyota:    exact, no models seeded (tests partial)

const REF: ReferenceData = {
  makes: new Set(["Chevrolet", "Honda", "Toyota"]),
  models: new Map([
    ["Chevrolet", new Set(["Silverado 1500", "Silverado 2500HD", "Malibu"])],
    ["Honda",     new Set(["Civic", "CR-V"])],
  ]),
  makeAliases: new Map([
    ["chevy", "Chevrolet"],
    ["chev",  "Chevrolet"],
  ]),
  modelAliases: new Map([
    ["Honda", new Map([["crv", "CR-V"]])],
  ]),
};

// ── Exact resolution ──────────────────────────────────────────────────────────

describe("normalizeMmrParams — exact", () => {
  it("returns exact confidence when make and model match reference data", () => {
    const result = normalizeMmrParams(
      { make: "Chevrolet", model: "Malibu" },
      REF,
    );
    expect(result).toEqual({
      canonicalMake: "Chevrolet",
      canonicalModel: "Malibu",
      trim: null,
      normalizationConfidence: "exact",
    });
  });

  it("is case-insensitive for both make and model", () => {
    const result = normalizeMmrParams(
      { make: "chevrolet", model: "malibu" },
      REF,
    );
    expect(result.canonicalMake).toBe("Chevrolet");
    expect(result.canonicalModel).toBe("Malibu");
    expect(result.normalizationConfidence).toBe("exact");
  });

  it("trims surrounding whitespace before matching", () => {
    const result = normalizeMmrParams(
      { make: "  Honda  ", model: "  Civic  " },
      REF,
    );
    expect(result.canonicalMake).toBe("Honda");
    expect(result.canonicalModel).toBe("Civic");
    expect(result.normalizationConfidence).toBe("exact");
  });
});

// ── Alias resolution ──────────────────────────────────────────────────────────

describe("normalizeMmrParams — alias", () => {
  it("resolves alias make + exact model → alias confidence", () => {
    const result = normalizeMmrParams(
      { make: "chevy", model: "Malibu" },
      REF,
    );
    expect(result.canonicalMake).toBe("Chevrolet");
    expect(result.canonicalModel).toBe("Malibu");
    expect(result.normalizationConfidence).toBe("alias");
  });

  it("resolves alias make + alias model → alias confidence", () => {
    const result = normalizeMmrParams(
      { make: "Honda", model: "crv" },
      REF,
    );
    expect(result.canonicalMake).toBe("Honda");
    expect(result.canonicalModel).toBe("CR-V");
    expect(result.normalizationConfidence).toBe("alias");
  });

  it("resolves alias make (case-insensitive) → Chevrolet", () => {
    const result = normalizeMmrParams(
      { make: "CHEVY", model: "Malibu" },
      REF,
    );
    expect(result.canonicalMake).toBe("Chevrolet");
    expect(result.normalizationConfidence).toBe("alias");
  });
});

// ── Partial resolution ────────────────────────────────────────────────────────

describe("normalizeMmrParams — partial", () => {
  it("returns partial when make resolves but model does not", () => {
    const result = normalizeMmrParams(
      { make: "Chevrolet", model: "UnknownModel" },
      REF,
    );
    expect(result.canonicalMake).toBe("Chevrolet");
    expect(result.canonicalModel).toBeNull();
    expect(result.normalizationConfidence).toBe("partial");
  });

  it("returns partial when make resolves but no models are seeded for it", () => {
    // Toyota is in makes but has no entry in models map
    const result = normalizeMmrParams(
      { make: "Toyota", model: "Camry" },
      REF,
    );
    expect(result.canonicalMake).toBe("Toyota");
    expect(result.canonicalModel).toBeNull();
    expect(result.normalizationConfidence).toBe("partial");
  });

  it("returns partial when make resolves but model is absent", () => {
    const result = normalizeMmrParams(
      { make: "Honda", model: undefined },
      REF,
    );
    expect(result.canonicalMake).toBe("Honda");
    expect(result.canonicalModel).toBeNull();
    expect(result.normalizationConfidence).toBe("partial");
  });

  it("returns partial (not alias) when alias make resolves but model does not", () => {
    const result = normalizeMmrParams(
      { make: "chev", model: "NotAModel" },
      REF,
    );
    expect(result.canonicalMake).toBe("Chevrolet");
    expect(result.canonicalModel).toBeNull();
    expect(result.normalizationConfidence).toBe("partial");
  });
});

// ── None / unresolved ─────────────────────────────────────────────────────────

describe("normalizeMmrParams — none", () => {
  it("returns none when make is not in reference or aliases", () => {
    const result = normalizeMmrParams(
      { make: "Porsche", model: "911" },
      REF,
    );
    expect(result.canonicalMake).toBeNull();
    expect(result.canonicalModel).toBeNull();
    expect(result.normalizationConfidence).toBe("none");
  });

  it("returns none when make is null", () => {
    const result = normalizeMmrParams({ make: null, model: "Civic" }, REF);
    expect(result.normalizationConfidence).toBe("none");
    expect(result.canonicalMake).toBeNull();
  });

  it("returns none when make is empty string", () => {
    const result = normalizeMmrParams({ make: "" }, REF);
    expect(result.normalizationConfidence).toBe("none");
  });

  it("returns none when make is whitespace only", () => {
    const result = normalizeMmrParams({ make: "   " }, REF);
    expect(result.normalizationConfidence).toBe("none");
  });

  it("returns none when both make and model are undefined", () => {
    const result = normalizeMmrParams({}, REF);
    expect(result.normalizationConfidence).toBe("none");
  });
});

// ── Ambiguity guard ───────────────────────────────────────────────────────────

describe("normalizeMmrParams — ambiguity guard", () => {
  it("does not resolve ambiguous model family name absent from alias table", () => {
    // "silverado" by itself is ambiguous (1500 vs 2500HD) — not in alias table,
    // so it should not match any canonical model.
    const result = normalizeMmrParams(
      { make: "Chevrolet", model: "silverado" },
      REF,
    );
    expect(result.canonicalModel).toBeNull();
    expect(result.normalizationConfidence).toBe("partial");
  });
});

// ── Trim passthrough ──────────────────────────────────────────────────────────

describe("normalizeMmrParams — trim", () => {
  it("preserves trim value for storage on exact match", () => {
    const result = normalizeMmrParams(
      { make: "Honda", model: "Civic", trim: "EX-L" },
      REF,
    );
    expect(result.trim).toBe("EX-L");
    expect(result.normalizationConfidence).toBe("exact");
  });

  it("preserves trim value for storage on none (unresolved make)", () => {
    const result = normalizeMmrParams(
      { make: "Porsche", model: "911", trim: "Turbo S" },
      REF,
    );
    expect(result.trim).toBe("Turbo S");
    expect(result.normalizationConfidence).toBe("none");
  });

  it("returns null trim when trim is not provided", () => {
    const result = normalizeMmrParams(
      { make: "Honda", model: "Civic" },
      REF,
    );
    expect(result.trim).toBeNull();
  });

  it("does not infer trim from model string", () => {
    // Even when model string contains trim-like tokens, trim stays null if not provided
    const result = normalizeMmrParams(
      { make: "Honda", model: "Civic EX-L" },
      REF,
    );
    expect(result.trim).toBeNull();
  });
});
