import { describe, it, expect } from "vitest";
import { deriveSegmentKey } from "../segmentKey";

describe("deriveSegmentKey", () => {
  it("produces the canonical form for a fully populated input", () => {
    const key = deriveSegmentKey({
      year:   2020,
      make:   "Toyota",
      model:  "Camry",
      trim:   "SE",
      region: "dallas_tx",
    });
    expect(key).toBe("2020:toyota:camry:se:dallas_tx");
  });

  it("uses 'all' when year is null", () => {
    const key = deriveSegmentKey({
      year:   null,
      make:   "Ford",
      model:  "F-150",
      trim:   null,
      region: null,
    });
    expect(key).toBe("all:ford:f-150:base:national");
  });

  it("uses 'base' when trim is null", () => {
    const key = deriveSegmentKey({
      year:   2024,
      make:   "Ford",
      model:  "F-150",
      trim:   null,
      region: "houston_tx",
    });
    expect(key).toBe("2024:ford:f-150:base:houston_tx");
  });

  it("uses 'national' when region is null", () => {
    const key = deriveSegmentKey({
      year:   2024,
      make:   "Honda",
      model:  "Accord",
      trim:   "EX",
      region: null,
    });
    expect(key).toBe("2024:honda:accord:ex:national");
  });

  it("collapses defaults when every nullable input is null", () => {
    const key = deriveSegmentKey({
      year:   null,
      make:   "Tesla",
      model:  "Model 3",
      trim:   null,
      region: null,
    });
    expect(key).toBe("all:tesla:model_3:base:national");
  });

  it("collapses internal whitespace runs to a single underscore", () => {
    const key = deriveSegmentKey({
      year:   2027,
      make:   "  Rivian  ",
      model:  "R1T",
      trim:   "Adventure   Package",
      region: "austin_tx",
    });
    expect(key).toBe("2027:rivian:r1t:adventure_package:austin_tx");
  });

  it("strips special characters except underscore and hyphen", () => {
    const key = deriveSegmentKey({
      year:   2022,
      make:   "Mercedes-Benz",
      model:  "C@300!",
      trim:   "AMG#Line",
      region: "san_antonio_tx",
    });
    expect(key).toBe("2022:mercedes-benz:c300:amgline:san_antonio_tx");
  });

  it("is case-insensitive across make/model/trim/region", () => {
    const a = deriveSegmentKey({
      year: 2020, make: "TOYOTA", model: "CAMRY", trim: "SE", region: "DALLAS_TX",
    });
    const b = deriveSegmentKey({
      year: 2020, make: "toyota", model: "camry", trim: "se", region: "dallas_tx",
    });
    expect(a).toBe(b);
  });

  it("is deterministic for equivalent inputs", () => {
    const args = {
      year:   2020,
      make:   " Toyota ",
      model:  "Camry",
      trim:   "SE",
      region: "dallas_tx",
    };
    const k1 = deriveSegmentKey(args);
    const k2 = deriveSegmentKey(args);
    expect(k1).toBe(k2);
  });

  it("does not enforce region validity — stores verbatim once normalized", () => {
    const key = deriveSegmentKey({
      year:   2020,
      make:   "Toyota",
      model:  "Camry",
      trim:   null,
      region: "miami_fl", // not in the canonical list, but caller validates
    });
    expect(key).toBe("2020:toyota:camry:base:miami_fl");
  });

  it("treats whitespace-only trim as null", () => {
    const key = deriveSegmentKey({
      year:   2020,
      make:   "Toyota",
      model:  "Camry",
      trim:   "   ",
      region: "dallas_tx",
    });
    expect(key).toBe("2020:toyota:camry:base:dallas_tx");
  });

  it("treats whitespace-only region as null", () => {
    const key = deriveSegmentKey({
      year:   2020,
      make:   "Toyota",
      model:  "Camry",
      trim:   "SE",
      region: "   ",
    });
    expect(key).toBe("2020:toyota:camry:se:national");
  });
});
