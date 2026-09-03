import { describe, expect, it } from "vitest";
import {
  SessionHaltedError,
  assertCanRun,
  chicagoParts,
  emptyState,
  halt,
  isCloudUnavailableError,
  isDeadBrowserError,
  isWithinHours,
  recordVisit,
  remainingCapacity,
} from "../scripts/lib/gologin-antiban.mjs";

describe("gologin antiban caps", () => {
  it("halts until a human clears the latch", () => {
    const state = halt(emptyState(), "checkpoint");
    expect(() => assertCanRun(state, { skipHours: true })).toThrow(SessionHaltedError);
  });

  it("is unlimited by default (0 hour/day cap)", () => {
    const state = emptyState();
    const now = new Date("2026-08-24T18:00:00-05:00");
    for (let i = 0; i < 200; i += 1) recordVisit(state, now);
    expect(remainingCapacity(state, {}, now)).toBe(Number.POSITIVE_INFINITY);
    expect(assertCanRun(state, { skipHours: true }, now)).toBe(Number.POSITIVE_INFINITY);
  });

  it("caps per hour and per day when restored", () => {
    const state = emptyState();
    const now = new Date("2026-08-24T18:00:00-05:00");
    for (let i = 0; i < 25; i += 1) recordVisit(state, now);
    expect(remainingCapacity(state, { maxPerHour: 25, maxPerDay: 40 }, now)).toBe(0);
    expect(() => assertCanRun(state, { skipHours: true, maxPerHour: 25, maxPerDay: 40 }, now)).toThrow(
      /cap reached/,
    );
  });

  it("treats a closed GoLogin Cloud tab as a dead browser, not a listing miss", () => {
    expect(isDeadBrowserError(new Error("Protocol error (Page.navigate): Session closed"))).toBe(true);
    expect(isDeadBrowserError(new Error("Navigating frame was detached"))).toBe(true);
    expect(isDeadBrowserError(new Error("net::ERR_NAME_NOT_RESOLVED"))).toBe(false);
  });

  it("backs off on GoLogin Cloud 503 instead of treating it as a halt", () => {
    expect(isCloudUnavailableError(new Error("Unexpected server response: 503"))).toBe(true);
    expect(isCloudUnavailableError(new Error("Protocol error (Page.navigate): Session closed"))).toBe(false);
  });

  it("blocks outside Chicago 07–21 when hours are on", () => {
    const night = new Date("2026-08-24T23:30:00-05:00");
    expect(isWithinHours(night)).toBe(false);
    expect(chicagoParts(night).hour).toBe(23);
    expect(() => assertCanRun(emptyState(), { skipHours: false }, night)).toThrow(/outside/);
    expect(assertCanRun(emptyState(), { skipHours: true }, night)).toBe(Number.POSITIVE_INFINITY);
  });
});
