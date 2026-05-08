import { describe, it, expect } from "vitest";
import { extractManheimDistribution } from "../manheimResponseParser";

// ── Fixtures drawn from real staging KV payloads (2026-05-07) ─────────────────

// Matches the VIN endpoint shape (items[0]):
//   /valuations/vin/:vin?odometer=N
const VIN_ITEM = {
  adjustedPricing: {
    wholesale: { above: 2400, average: 2100, below: 1775 },
  },
  wholesale: { above: 1125, average: 800, below: 500 },
  sampleSize: "6",
};

// Matches the YMM search endpoint shape (items[0]):
//   /valuations/search/:year/:make/:model?odometer=N&include=ci
const YMM_ITEM = {
  adjustedPricing: {
    wholesale: { above: 21200, average: 19400, below: 17600 },
    confidenceInterval: { confidenceIndicator: 3 },
  },
  wholesale: { above: 18900, average: 17050, below: 15250 },
  sampleSize: "140",
};

// Full envelope as returned by the intelligence worker (items array wrapper).
const VIN_PAYLOAD = { href: "https://api.manheim.com/...", count: 1, items: [VIN_ITEM] };
const YMM_PAYLOAD = { href: "https://api.manheim.com/...", count: 17, items: [YMM_ITEM] };

// ── Full payload — all fields extracted ───────────────────────────────────────

describe("extractManheimDistribution — full VIN payload", () => {
  it("extracts wholesaleAvg from adjustedPricing.wholesale.average", () => {
    expect(extractManheimDistribution(VIN_PAYLOAD).wholesaleAvg).toBe(2100);
  });

  it("extracts wholesaleClean from adjustedPricing.wholesale.above", () => {
    expect(extractManheimDistribution(VIN_PAYLOAD).wholesaleClean).toBe(2400);
  });

  it("extracts wholesaleRough from adjustedPricing.wholesale.below", () => {
    expect(extractManheimDistribution(VIN_PAYLOAD).wholesaleRough).toBe(1775);
  });

  it("parses sampleCount from sampleSize string", () => {
    expect(extractManheimDistribution(VIN_PAYLOAD).sampleCount).toBe(6);
  });

  it("retailClean is null when adjustedPricing.retail is absent", () => {
    expect(extractManheimDistribution(VIN_PAYLOAD).retailClean).toBeNull();
    expect(extractManheimDistribution(VIN_PAYLOAD).retailAvg).toBeNull();
    expect(extractManheimDistribution(VIN_PAYLOAD).retailRough).toBeNull();
  });
});

// ── Cox MMR 1.4 retail tier (when MANHEIM_INCLUDE_RETAIL=true) ────────────────

describe("extractManheimDistribution — adjustedPricing.retail present", () => {
  const VIN_WITH_RETAIL = {
    adjustedPricing: {
      wholesale: { above: 2400, average: 2100, below: 1775 },
      retail:    { above: 3300, average: 3000, below: 2750 },
    },
    sampleSize: "6",
  };
  const PAYLOAD_WITH_RETAIL = { items: [VIN_WITH_RETAIL] };

  it("extracts retailAvg from adjustedPricing.retail.average", () => {
    expect(extractManheimDistribution(PAYLOAD_WITH_RETAIL).retailAvg).toBe(3000);
  });

  it("extracts retailClean from adjustedPricing.retail.above", () => {
    expect(extractManheimDistribution(PAYLOAD_WITH_RETAIL).retailClean).toBe(3300);
  });

  it("extracts retailRough from adjustedPricing.retail.below", () => {
    expect(extractManheimDistribution(PAYLOAD_WITH_RETAIL).retailRough).toBe(2750);
  });

  it("returns null per tier when only one retail tier is present", () => {
    const partial = { items: [{ adjustedPricing: { retail: { average: 3000 } }, sampleSize: "1" }] };
    const dist    = extractManheimDistribution(partial);
    expect(dist.retailAvg).toBe(3000);
    expect(dist.retailClean).toBeNull();
    expect(dist.retailRough).toBeNull();
  });

  it("returns null for a retail tier whose value is zero or negative", () => {
    const bad = { items: [{ adjustedPricing: { retail: { average: 0, above: -1 } } }] };
    const dist = extractManheimDistribution(bad);
    expect(dist.retailAvg).toBeNull();
    expect(dist.retailClean).toBeNull();
  });
});

describe("extractManheimDistribution — full YMM payload", () => {
  it("extracts wholesaleAvg", () => {
    expect(extractManheimDistribution(YMM_PAYLOAD).wholesaleAvg).toBe(19400);
  });

  it("extracts wholesaleClean", () => {
    expect(extractManheimDistribution(YMM_PAYLOAD).wholesaleClean).toBe(21200);
  });

  it("extracts wholesaleRough", () => {
    expect(extractManheimDistribution(YMM_PAYLOAD).wholesaleRough).toBe(17600);
  });

  it("parses large sampleCount string", () => {
    expect(extractManheimDistribution(YMM_PAYLOAD).sampleCount).toBe(140);
  });
});

// ── Root-level response (no items array) ─────────────────────────────────────

describe("extractManheimDistribution — root-level response", () => {
  it("reads from root when items is absent", () => {
    const flat = { adjustedPricing: { wholesale: { average: 5000, above: 5500, below: 4500 } }, sampleSize: "12" };
    const dist = extractManheimDistribution(flat);
    expect(dist.wholesaleAvg).toBe(5000);
    expect(dist.wholesaleClean).toBe(5500);
    expect(dist.sampleCount).toBe(12);
  });

  it("reads from root when items is empty", () => {
    const payload = { items: [], adjustedPricing: { wholesale: { average: 3000, above: 3300, below: 2700 } }, sampleSize: "0" };
    const dist = extractManheimDistribution(payload);
    expect(dist.wholesaleAvg).toBe(3000);
    expect(dist.sampleCount).toBe(0);
  });
});

// ── Partial payloads ──────────────────────────────────────────────────────────

describe("extractManheimDistribution — partial payload", () => {
  it("returns wholesaleAvg when only average is present, clean/rough null", () => {
    const partial = { items: [{ adjustedPricing: { wholesale: { average: 8000 } }, sampleSize: "3" }] };
    const dist = extractManheimDistribution(partial);
    expect(dist.wholesaleAvg).toBe(8000);
    expect(dist.wholesaleClean).toBeNull();
    expect(dist.wholesaleRough).toBeNull();
    expect(dist.sampleCount).toBe(3);
  });

  it("returns all null when adjustedPricing is absent", () => {
    const noAdj = { items: [{ wholesale: { average: 9000 }, sampleSize: "5" }] };
    const dist = extractManheimDistribution(noAdj);
    expect(dist.wholesaleAvg).toBeNull();
    expect(dist.wholesaleClean).toBeNull();
    expect(dist.wholesaleRough).toBeNull();
    // sampleCount still parseable even without adjustedPricing
    expect(dist.sampleCount).toBe(5);
  });

  it("returns null for a pricing tier when its value is 0", () => {
    const zeroBelow = { items: [{ adjustedPricing: { wholesale: { average: 1000, above: 1200, below: 0 } } }] };
    expect(extractManheimDistribution(zeroBelow).wholesaleRough).toBeNull();
    expect(extractManheimDistribution(zeroBelow).wholesaleAvg).toBe(1000);
  });

  it("returns null for a pricing tier when its value is negative", () => {
    const neg = { items: [{ adjustedPricing: { wholesale: { average: 1000, above: -500, below: 800 } } }] };
    expect(extractManheimDistribution(neg).wholesaleClean).toBeNull();
    expect(extractManheimDistribution(neg).wholesaleRough).toBe(800);
  });
});

// ── sampleSize edge cases ─────────────────────────────────────────────────────

describe("extractManheimDistribution — sampleSize edge cases", () => {
  const withSample = (s: unknown) => ({ items: [{ sampleSize: s }] });

  it("parses '0' as 0 (extended coverage, no same-trim sales)", () => {
    expect(extractManheimDistribution(withSample("0")).sampleCount).toBe(0);
  });

  it("returns null when sampleSize is absent", () => {
    expect(extractManheimDistribution({ items: [{}] }).sampleCount).toBeNull();
  });

  it("returns null when sampleSize is a number (unexpected type)", () => {
    expect(extractManheimDistribution(withSample(6)).sampleCount).toBeNull();
  });

  it("returns null when sampleSize is an empty string", () => {
    expect(extractManheimDistribution(withSample("")).sampleCount).toBeNull();
  });

  it("returns null when sampleSize is a non-numeric string", () => {
    expect(extractManheimDistribution(withSample("n/a")).sampleCount).toBeNull();
  });
});

// ── Null / empty / malformed input ────────────────────────────────────────────

describe("extractManheimDistribution — null / empty input", () => {
  it("returns all null for null input", () => {
    const dist = extractManheimDistribution(null);
    expect(dist.wholesaleAvg).toBeNull();
    expect(dist.wholesaleClean).toBeNull();
    expect(dist.wholesaleRough).toBeNull();
    expect(dist.retailClean).toBeNull();
    expect(dist.sampleCount).toBeNull();
  });

  it("returns all null for undefined input", () => {
    const dist = extractManheimDistribution(undefined);
    expect(dist.wholesaleAvg).toBeNull();
    expect(dist.sampleCount).toBeNull();
  });

  it("returns all null for empty object", () => {
    const dist = extractManheimDistribution({});
    expect(dist.wholesaleAvg).toBeNull();
    expect(dist.sampleCount).toBeNull();
  });

  it("returns all null for a string input", () => {
    const dist = extractManheimDistribution("not-a-payload");
    expect(dist.wholesaleAvg).toBeNull();
  });
});
