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

  it("logs Anthropic's error body on a non-2xx response", async () => {
    const errorBody = JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "bad image" } });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, text: async () => errorBody })));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await callAnthropicForSellerClassify({ env: makeEnv(), title: "2018 F-150" });

    expect(result).toEqual({ kind: "http_error", status: 400 });
    const logged = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("ingest.seller_classify_http_error");
    expect(logged).toContain("bad image");
  });

  const anthropicOk = {
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
  };

  function anthropicBody(fetchMock: ReturnType<typeof vi.fn>): { messages: Array<{ content: unknown[] }> } {
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("api.anthropic.com"));
    const init = call?.[1] as RequestInit;
    return JSON.parse(init.body as string) as { messages: Array<{ content: unknown[] }> };
  }

  it("downloads the upgraded photo and sends it as a base64 image block", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.anthropic.com")) return anthropicOk;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "image/jpeg" }),
        arrayBuffer: async () => jpeg.buffer,
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callAnthropicForSellerClassify({
      env: makeEnv(),
      title: "2018 F-150",
      imageUrls: ["https://cdn.example/lot.jpg?ctp=s261x260", "https://cdn.example/second.jpg"],
    });

    expect(result.kind).toBe("ok");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://cdn.example/lot.jpg");
    expect(anthropicBody(fetchMock).messages[0]?.content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: btoa(String.fromCharCode(...jpeg)) } },
      expect.objectContaining({ type: "text" }),
    ]);
  });

  it("still classifies text-only when the photo cannot be downloaded", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.anthropic.com")) return anthropicOk;
      return { ok: false, status: 403, headers: new Headers() };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callAnthropicForSellerClassify({
      env: makeEnv(),
      title: "2018 F-150",
      imageUrls: ["https://cdn.example/lot.jpg"],
    });

    expect(result.kind).toBe("ok");
    expect(anthropicBody(fetchMock).messages[0]?.content).toEqual([expect.objectContaining({ type: "text" })]);
  });
});
