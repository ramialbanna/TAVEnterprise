import { describe, expect, it, vi } from "vitest";
import { patchOpportunityFields } from "../src/persistence/opportunities";
import { OpportunityWorkflowError } from "../src/persistence/opportunityWorkflow";
import type { AppUser } from "../src/persistence/users";

const actor: AppUser = {
  id: "user-1",
  email: "alice@tav.com",
  displayName: "Alice",
  role: "closer",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

type Chain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function makeDb(existing: Record<string, unknown> | null): { db: unknown; chain: Chain } {
  const chain: Chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: existing, error: null })),
    update: vi.fn(() => chain),
  };
  const db = { from: vi.fn(() => chain) };
  return { db, chain };
}

describe("patchOpportunityFields", () => {
  it("throws opportunity_not_found when listing is missing", async () => {
    const { db } = makeDb(null);
    await expect(
      patchOpportunityFields(db as never, "missing", actor, { color: "Red" }),
    ).rejects.toBeInstanceOf(OpportunityWorkflowError);
  });

  it("throws opportunity_not_found with db error when load fails", async () => {
    const chain: Partial<Chain> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: null, error: new Error("relation missing") })),
    };
    const db = { from: vi.fn(() => chain) };
    await expect(
      patchOpportunityFields(db as never, "missing", actor, { color: "Red" }),
    ).rejects.toThrow();
  });
});
