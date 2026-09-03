import { describe, expect, it, vi } from "vitest";
import { insertLlmYmmsDecision } from "../llmYmmsDecisions";
import type { SupabaseClient } from "../supabase";

function makeDb(error: unknown = null): { db: SupabaseClient; insertSpy: ReturnType<typeof vi.fn> } {
  const insertSpy = vi.fn().mockResolvedValue({ error });
  const db = {
    schema: vi.fn(() => ({ from: vi.fn(() => ({ insert: insertSpy })) })),
  } as unknown as SupabaseClient;
  return { db, insertSpy };
}

describe("insertLlmYmmsDecision — item 72 audit gap", () => {
  it("persists normalized_listing_id when the caller supplies it", async () => {
    const { db, insertSpy } = makeDb();

    await insertLlmYmmsDecision(db, {
      normalizedListingId: "nl-uuid-1",
      year: 2019,
      inputMake: "Toyota",
      inputModel: "Camry",
      outcome: "alias_hit",
      proposedMake: "TOYOTA",
      proposedModel: "CAMRY 4C",
      proposedStyle: "4D SEDAN LE",
    });

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        normalized_listing_id: "nl-uuid-1",
        year: 2019,
        input_make: "Toyota",
        outcome: "alias_hit",
      }),
    );
  });

  it("writes null listing id when the caller omits it (MMR Lab / VIN-only)", async () => {
    const { db, insertSpy } = makeDb();

    await insertLlmYmmsDecision(db, {
      year: 2019,
      inputMake: "Toyota",
      outcome: "offline_hit",
    });

    expect(insertSpy.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ normalized_listing_id: null }),
    );
  });
});
