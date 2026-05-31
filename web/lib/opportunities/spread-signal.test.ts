import { describe, expect, it } from "vitest";

import { formatSpreadSignal } from "./spread-signal";

describe("formatSpreadSignal", () => {
  it("labels positive spread as under wholesale", () => {
    expect(formatSpreadSignal(2400)).toEqual({
      text: "$2,400 under",
      tone: "positive",
      direction: "under",
    });
  });

  it("labels negative spread as over wholesale", () => {
    expect(formatSpreadSignal(-1500)).toEqual({
      text: "$1,500 over",
      tone: "negative",
      direction: "over",
    });
  });

  it("handles zero and null", () => {
    expect(formatSpreadSignal(0).text).toBe("At wholesale");
    expect(formatSpreadSignal(null).text).toBe("—");
  });
});
