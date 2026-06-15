import { describe, expect, it } from "vitest";

import { applyYmmCascadeChange } from "./apply-ymm-cascade";
import type { MmrSelection } from "./search-panel";

const filled: MmrSelection = {
  year: "2022",
  make: "FORD",
  model: "EXPLORER 2WD 4C",
  style: "4D SUV XLT",
  mileage: "8000",
};

describe("applyYmmCascadeChange", () => {
  it("year change preserves make/model/style and keeps mileage", () => {
    expect(
      applyYmmCascadeChange(filled, { ...filled, year: "2023" }),
    ).toEqual({
      year: "2023",
      make: "FORD",
      model: "EXPLORER 2WD 4C",
      style: "4D SUV XLT",
      mileage: "8000",
    });
  });

  it("make change clears model and style and keeps mileage", () => {
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

  it("mileage edit is kept when provided", () => {
    expect(
      applyYmmCascadeChange(filled, { ...filled, mileage: "12000" }),
    ).toEqual({
      ...filled,
      mileage: "12000",
    });
  });
});
