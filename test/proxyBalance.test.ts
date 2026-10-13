import { describe, expect, it } from "vitest";
import {
  PROXY_POLL_FAST_MS,
  PROXY_POLL_SLOW_MS,
  PROXY_UNCHANGED_BACKOFF_MS,
  nextProxyPollState,
  residentialBalanceFromTraffic,
} from "@scripts/proxy-balance";

const GB = 1024 ** 3;
const MINUTE = 60_000;

describe("residentialBalanceFromTraffic", () => {
  it("reads used, limit and remaining GB", () => {
    expect(
      residentialBalanceFromTraffic({
        residentialTrafficData: { trafficUsedBytes: 1.5 * GB, trafficLimitBytes: 2 * GB },
      }),
    ).toEqual({ usedGb: 1.5, limitGb: 2, remainingGb: 0.5 });
  });

  it("never reports a negative balance", () => {
    expect(
      residentialBalanceFromTraffic({
        residentialTrafficData: { trafficUsedBytes: 2.1 * GB, trafficLimitBytes: 2 * GB },
      }).remainingGb,
    ).toBe(0);
  });

  it("returns nulls when the response has no residential numbers", () => {
    expect(residentialBalanceFromTraffic({})).toEqual({ usedGb: null, limitGb: null, remainingGb: null });
  });
});

describe("nextProxyPollState", () => {
  it("polls every minute on the first reading", () => {
    expect(nextProxyPollState(null, 1.2, 0)).toEqual({
      lastRemainingGb: 1.2,
      changedAtMs: 0,
      intervalMs: PROXY_POLL_FAST_MS,
    });
  });

  it("stays at one minute while the balance keeps dropping", () => {
    let state = nextProxyPollState(null, 1.2, 0);
    for (let minute = 1; minute <= 30; minute += 1) {
      state = nextProxyPollState(state, 1.2 - minute * 0.001, minute * MINUTE);
      expect(state.intervalMs).toBe(PROXY_POLL_FAST_MS);
    }
  });

  it("stays at one minute until the balance has been unchanged for 15 minutes", () => {
    let state = nextProxyPollState(null, 0, 0);
    state = nextProxyPollState(state, 0, PROXY_UNCHANGED_BACKOFF_MS - MINUTE);
    expect(state.intervalMs).toBe(PROXY_POLL_FAST_MS);
    state = nextProxyPollState(state, 0, PROXY_UNCHANGED_BACKOFF_MS);
    expect(state.intervalMs).toBe(PROXY_POLL_SLOW_MS);
    expect(state.changedAtMs).toBe(0);
  });

  it("goes back to one minute as soon as the balance changes", () => {
    let state = nextProxyPollState(null, 0, 0);
    state = nextProxyPollState(state, 0, 20 * MINUTE);
    expect(state.intervalMs).toBe(PROXY_POLL_SLOW_MS);
    state = nextProxyPollState(state, 5, 35 * MINUTE);
    expect(state).toEqual({ lastRemainingGb: 5, changedAtMs: 35 * MINUTE, intervalMs: PROXY_POLL_FAST_MS });
  });
});
