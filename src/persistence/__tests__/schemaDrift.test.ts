import { describe, it, expect } from "vitest";
import { capSchemaDriftSample, takeUnseenDriftEvents } from "../schemaDrift";

describe("capSchemaDriftSample", () => {
  it("leaves small scalars and objects alone", () => {
    expect(capSchemaDriftSample("live")).toBe("live");
    expect(capSchemaDriftSample(true)).toBe(true);
    expect(capSchemaDriftSample({ ok: 1 })).toEqual({ ok: 1 });
  });

  it("truncates large objects instead of storing the full payload", () => {
    const huge = { photo: "x".repeat(500) };
    const capped = capSchemaDriftSample(huge);
    expect(typeof capped).toBe("string");
    expect(String(capped).length).toBe(200);
  });
});

describe("takeUnseenDriftEvents", () => {
  it("keeps the first sample of each field_path for the run", () => {
    const seen = new Set<string>();
    const first = takeUnseenDriftEvents(
      [
        { field_path: "isPending", sample_value: false },
        { field_path: "badge", sample_value: 1 },
      ],
      seen,
    );
    const second = takeUnseenDriftEvents(
      [
        { field_path: "isPending", sample_value: true },
        { field_path: "badge", sample_value: 2 },
        { field_path: "other", sample_value: "x" },
      ],
      seen,
    );
    expect(first.map((e) => e.field_path)).toEqual(["isPending", "badge"]);
    expect(second.map((e) => e.field_path)).toEqual(["other"]);
  });
});
