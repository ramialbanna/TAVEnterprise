import { describe, expect, it } from "vitest";

import { applyYmmCascadeChange } from "./apply-ymm-cascade";
import type { MmrSelection } from "./search-panel";

const filled: MmrSelection = {
  year: "2022",
  make: "FORD",
  model: "EXPLORER 2WD 4C",
  style: "4D SUV XLT",
};

describe("applyYmmCascadeChange", () => {
  it("year change preserves make/model/style", () => {
    expect(
      applyYmmCascadeChange(filled, { ...filled, year: "2023" }),
    ).toEqual({
      year: "2023",
      make: "FORD",
      model: "EXPLORER 2WD 4C",
      style: "4D SUV XLT",
    });
  });

  it("make change clears model and style", () => {
    expect(
      applyYmmCascadeChange(filled, { ...filled, make: "CHEVROLET" }),
    ).toEqual({
      ...filled,
      make: "CHEVROLET",
      model: "",
      style: "",
    });
  });

  it("model change clears style only", () => {
    expect(
      applyYmmCascadeChange(filled, { ...filled, model: "TAHOE 2WD" }),
    ).toEqual({
      ...filled,
      model: "TAHOE 2WD",
      style: "",
    });
  });
});
