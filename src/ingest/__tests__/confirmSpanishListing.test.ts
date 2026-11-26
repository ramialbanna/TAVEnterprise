import { beforeEach, describe, expect, it, vi } from "vitest";

import { confirmSpanishListing } from "../confirmSpanishListing";
import { callAnthropicForSpanishListing } from "../../llm/spanishListingClient";
import type { Env } from "../../types/env";

vi.mock("../../llm/spanishListingClient", () => ({
  callAnthropicForSpanishListing: vi.fn(),
}));

const env = { ANTHROPIC_API_KEY: "test-key" } as Env;

beforeEach(() => {
  vi.mocked(callAnthropicForSpanishListing).mockReset();
});

describe("confirmSpanishListing", () => {
  it("does not call Claude when the wordlist does not nominate", async () => {
    const decision = await confirmSpanishListing(
      { title: "2018 F-150", description: "Clean title, 80k miles, automatic." },
      env,
    );
    expect(decision.refuse).toBe(false);
    expect(callAnthropicForSpanishListing).not.toHaveBeenCalled();
  });

  it("keeps an English ad the wordlist nominated", async () => {
    vi.mocked(callAnthropicForSpanishListing).mockResolvedValue({
      kind: "ok",
      proposal: { language: "english", confidence: 0.94, reasoning: "English ad." },
      latencyMs: 20,
      model: "claude-haiku-4-5",
    });
    const decision = await confirmSpanishListing(
      { title: "2018 F-150", description: "Troca for sale in Del Rio. Clean title, 80k miles." },
      env,
    );
    expect(decision.refuse).toBe(false);
    expect(decision.language).toBe("english");
    expect(decision.source).toBe("llm");
  });

  it("refuses an ad Claude says is written in Spanish", async () => {
    vi.mocked(callAnthropicForSpanishListing).mockResolvedValue({
      kind: "ok",
      proposal: { language: "spanish", confidence: 0.96, reasoning: "The ad is in Spanish." },
      latencyMs: 20,
      model: "claude-haiku-4-5",
    });
    const decision = await confirmSpanishListing(
      { title: "2019 Ford F-250", description: "Título limpio. Vendo." },
      env,
    );
    expect(decision.refuse).toBe(true);
    expect(decision.source).toBe("llm");
  });

  it("drops a low-confidence Spanish call", async () => {
    vi.mocked(callAnthropicForSpanishListing).mockResolvedValue({
      kind: "ok",
      proposal: { language: "spanish", confidence: 0.6, reasoning: "Mixed." },
      latencyMs: 20,
      model: "claude-haiku-4-5",
    });
    const decision = await confirmSpanishListing(
      { title: "2019 Ford F-250", description: "Título limpio. Vendo." },
      env,
    );
    expect(decision.refuse).toBe(true);
    expect(decision.source).toBe("llm");
  });

  it("drops the listing when Claude times out", async () => {
    vi.mocked(callAnthropicForSpanishListing).mockResolvedValue({ kind: "timeout" });
    const decision = await confirmSpanishListing(
      { title: "2019 Ford F-250", description: "Título limpio. Vendo." },
      env,
    );
    expect(decision.refuse).toBe(true);
    expect(decision.source).toBe("wordlist");
  });

  it("drops the listing when there is no time left to ask Claude", async () => {
    const decision = await confirmSpanishListing(
      { title: "2019 Ford F-250", description: "Título limpio. Vendo." },
      env,
      { allowLlm: false },
    );
    expect(decision.refuse).toBe(true);
    expect(decision.source).toBe("wordlist");
    expect(callAnthropicForSpanishListing).not.toHaveBeenCalled();
  });
});
