import { describe, it, expect } from "vitest";
import { generateRequestId } from "../requestId";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("generateRequestId", () => {
  it("returns a v4 UUID", () => {
    const id = generateRequestId();
    expect(id).toMatch(UUID_V4_RE);
  });

  it("returns a unique value on each call", () => {
    const ids = new Set([
      generateRequestId(),
      generateRequestId(),
      generateRequestId(),
    ]);
    expect(ids.size).toBe(3);
  });
});
