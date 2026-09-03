import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callAnthropicForSellerClassify } from "../sellerClassifyClient";
import { SELLER_CLASSIFY_TOOL_NAME } from "../sellerClassifyPrompt";
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

describe("callAnthropicForSellerClassify", () => {
  it("returns not_configured when the API key is missing", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const result = await callAnthropicForSellerClassify({
      env: makeEnv({ ANTHROPIC_API_KEY: "" }),
      title: "2018 F-150",
    });
    expect(result).toEqual({ kind: "not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("parses a valid tool_use response", async () => {
    const proposal = {
      seller_type: "dealer",
      confidence: 0.91,
      reasoning: "Stock number and we finance.",
      signals: ["stock_number", "financing_language"],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          model: "claude-haiku-4-5",
          content: [{ type: "tool_use", name: SELLER_CLASSIFY_TOOL_NAME, id: "toolu_1", input: proposal }],
        }),
      })),
    );

    const result = await callAnthropicForSellerClassify({
      env: makeEnv(),
      title: "2018 F-150",
      description: "We finance. Stock #12",
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.proposal).toEqual(proposal);
      expect(result.model).toBe("claude-haiku-4-5");
    }
  });

  it("sends an upgraded HTTPS photo as an image content block", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        model: "claude-haiku-4-5",
        content: [{
          type: "tool_use",
          name: SELLER_CLASSIFY_TOOL_NAME,
          id: "toolu_1",
          input: {
            seller_type: "dealer",
            confidence: 0.9,
            reasoning: "Lot photo.",
            signals: ["dealer_lot_photo"],
          },
        }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await callAnthropicForSellerClassify({
      env: makeEnv(),
      title: "2018 F-150",
      imageUrls: ["https://cdn.example/lot.jpg?ctp=s261x260", "https://cdn.example/second.jpg"],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as {
      messages: Array<{ content: unknown[] }>;
    };
    expect(body.messages[0].content).toEqual([
      { type: "image", source: { type: "url", url: "https://cdn.example/lot.jpg" } },
      expect.objectContaining({ type: "text" }),
    ]);
  });
});
