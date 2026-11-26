import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callAnthropicForSpanishListing } from "../spanishListingClient";
import { SPANISH_LISTING_TOOL_NAME } from "../spanishListingPrompt";
import type { Env } from "../../types/env";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ANTHROPIC_API_KEY: "test-anthropic-key",
    SELLER_CLASSIFY_MODEL: "claude-haiku-4-5",
    ...overrides,
  } as Env;
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callAnthropicForSpanishListing", () => {
  it("returns not_configured when the API key is missing", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const result = await callAnthropicForSpanishListing({
      env: makeEnv({ ANTHROPIC_API_KEY: "" }),
      title: "2019 Ford F-250",
    });
    expect(result).toEqual({ kind: "not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("parses a spanish tool response", async () => {
    const proposal = {
      language: "spanish",
      confidence: 0.96,
      reasoning: "The description is in Spanish.",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          model: "claude-haiku-4-5",
          content: [{ type: "tool_use", name: SPANISH_LISTING_TOOL_NAME, input: proposal }],
        }),
      })),
    );

    const result = await callAnthropicForSpanishListing({
      env: makeEnv(),
      title: "2019 Ford F-250",
      description: "Título limpio. Vendo.",
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.proposal).toEqual(proposal);
    }
  });
});
