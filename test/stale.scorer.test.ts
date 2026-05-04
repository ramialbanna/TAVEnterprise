import { describe, it, expect } from "vitest";
import { computeStaleScore } from "../src/stale/scorer";

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

describe("computeStaleScore", () => {
  it("score < 2, status=new for listings seen under 1 day ago", () => {
    const r = computeStaleScore(daysAgo(0.1));
    expect(r.score).toBeLessThan(2);
    expect(r.status).toBe("new");
  });

  it("status=active for listings 1–3 days old", () => {
    expect(computeStaleScore(daysAgo(2)).status).toBe("active");
  });

  it("status=aging at 3 days", () => {
    expect(computeStaleScore(daysAgo(3)).status).toBe("aging");
  });

  it("status=aging at 5 days", () => {
    expect(computeStaleScore(daysAgo(5)).status).toBe("aging");
  });

  it("status=stale_suspected at 7 days", () => {
    expect(computeStaleScore(daysAgo(7)).status).toBe("stale_suspected");
  });

  it("status=stale_confirmed at 14 days", () => {
    expect(computeStaleScore(daysAgo(14)).status).toBe("stale_confirmed");
  });

  it("score=100 at 30+ days", () => {
    const r = computeStaleScore(daysAgo(30));
    expect(r.score).toBe(100);
  });

  it("score is monotonically non-decreasing", () => {
    const ages = [0, 1, 2, 3, 5, 7, 10, 14, 20, 30];
    const scores = ages.map(d => computeStaleScore(daysAgo(d)).score);
    for (let i = 1; i < scores.length; i++) {
      const prev = scores[i - 1] ?? 0;
      const curr = scores[i] ?? 0;
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it("score stays at 100 beyond 30 days", () => {
    expect(computeStaleScore(daysAgo(60)).score).toBe(100);
  });
});
