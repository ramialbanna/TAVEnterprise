import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAXBUY_INTELLIGENCE_CONTRACT_VERSION,
  MAXBUY_NEVER_PERSIST_MMR_FIELDS,
  MAXBUY_SAFE_PERSIST_MMR_FIELDS,
} from "../src/maxbuy/constants";
import { MmrResponseEnvelopeSchema } from "../src/types/intelligence";

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "fixtures/mmr-v1-envelope.json"), "utf8"),
);

describe("MaxBuy MMR contract (mmr-v1)", () => {
  it("pins contract version", () => {
    expect(MAXBUY_INTELLIGENCE_CONTRACT_VERSION).toBe("mmr-v1");
  });

  it("parses frozen fixture with MmrResponseEnvelopeSchema", () => {
    const parsed = MmrResponseEnvelopeSchema.parse(FIXTURE);
    expect(parsed.ok).toBe(true);
    expect(parsed.mmr_value).toBe(18_500);
    expect(parsed.source).toBe("manheim");
  });

  it("documents safe-persist fields without mmr_payload", () => {
    const schemaKeys = Object.keys(MmrResponseEnvelopeSchema.shape);
    for (const field of MAXBUY_SAFE_PERSIST_MMR_FIELDS) {
      expect(schemaKeys).toContain(field);
    }
    for (const field of MAXBUY_NEVER_PERSIST_MMR_FIELDS) {
      expect(MAXBUY_SAFE_PERSIST_MMR_FIELDS).not.toContain(field);
    }
  });

  it("rejects fixture missing required envelope fields", () => {
    const broken = { ...FIXTURE };
    delete (broken as { mileage_used?: number }).mileage_used;
    expect(() => MmrResponseEnvelopeSchema.parse(broken)).toThrow();
  });
});
