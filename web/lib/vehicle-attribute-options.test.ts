import { describe, expect, it } from "vitest";

import {
  selectOptionsWithLegacy,
  VEHICLE_BODY_TYPE_OPTIONS,
} from "./vehicle-attribute-options";

describe("selectOptionsWithLegacy", () => {
  it("returns options unchanged when current value is empty", () => {
    expect(selectOptionsWithLegacy(VEHICLE_BODY_TYPE_OPTIONS, "")).toEqual([
      ...VEHICLE_BODY_TYPE_OPTIONS,
    ]);
  });

  it("returns options unchanged when current value matches case-insensitively", () => {
    expect(selectOptionsWithLegacy(VEHICLE_BODY_TYPE_OPTIONS, "sedan")).toEqual([
      ...VEHICLE_BODY_TYPE_OPTIONS,
    ]);
  });

  it("prepends legacy free-text when not in the list", () => {
    expect(selectOptionsWithLegacy(VEHICLE_BODY_TYPE_OPTIONS, "1.5L Turbo")).toEqual([
      "1.5L Turbo",
      ...VEHICLE_BODY_TYPE_OPTIONS,
    ]);
  });
});
