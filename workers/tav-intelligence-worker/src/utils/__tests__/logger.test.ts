import { describe, it, expect, vi, afterEach } from "vitest";
import { log } from "../logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("log", () => {
  it("emits a single JSON line including event + requestId + extras", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    log("test.event", { requestId: "req-9", foo: "bar" });

    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0]?.[0];
    expect(typeof arg).toBe("string");
    const parsed = JSON.parse(arg as string);
    expect(parsed).toEqual({
      event:     "test.event",
      requestId: "req-9",
      foo:       "bar",
    });
  });
});
