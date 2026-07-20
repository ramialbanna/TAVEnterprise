import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callAnthropicForYmms } from "../anthropicClient";
import { YMMS_TOOL_NAME } from "../ymmsPrompt";
import type { Env } from "../../types/env";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ANTHROPIC_API_KEY: "test-anthropic-key",
    LLM_YMMS_ENABLED: "true",
    LLM_YMMS_MODEL: "claude-sonnet-4-5",
    ...overrides,
  } as Env;
}

function toolUseResponse(input: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      model: "claude-sonnet-4-5",
      content: [{ type: "tool_use", name: YMMS_TOOL_NAME, id: "toolu_1", input }],
    }),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callAnthropicForYmms", () => {
  it("returns not_configured when ANTHROPIC_API_KEY is a placeholder", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const result = await callAnthropicForYmms({
      env: makeEnv({ ANTHROPIC_API_KEY: "" }),
      userPrompt: "prompt",
    });
    expect(result).toEqual({ kind: "not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("parses a valid tool_use response into a proposal", async () => {
    const proposal = {
      make: "Ram",
      model: "1500",
      style: "4D Crew Cab Big Horn",
      confidence: 0.82,
      reasoning: "Title mentions Crew Cab and Big Horn.",
      needsReview: false,
    };
    vi.stubGlobal("fetch", vi.fn(async () => toolUseResponse(proposal)));

    const result = await callAnthropicForYmms({ env: makeEnv(), userPrompt: "prompt" });

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.proposal).toEqual(proposal);
      expect(result.model).toBe("claude-sonnet-4-5");
      expect(typeof result.latencyMs).toBe("number");
    }
  });

  it("sends the forced tool_choice and Anthropic auth headers", async () => {
    const fetchMock = vi.fn(async () =>
      toolUseResponse({
        make: "Ram",
        model: "1500",
        style: "Big Horn",
        confidence: 0.5,
        reasoning: "x",
        needsReview: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await callAnthropicForYmms({ env: makeEnv(), userPrompt: "prompt text" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("test-anthropic-key");
    expect(init.headers["anthropic-version"]).toBeTruthy();
    const body = JSON.parse(init.body);
    expect(body.tool_choice).toEqual({ type: "tool", name: YMMS_TOOL_NAME });
    expect(body.tools[0].name).toBe(YMMS_TOOL_NAME);
    expect(body.messages[0].content).toBe("prompt text");
  });

  it("returns rate_limited on HTTP 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}), text: async () => "" })),
    );
    const result = await callAnthropicForYmms({ env: makeEnv(), userPrompt: "prompt" });
    expect(result).toEqual({ kind: "rate_limited" });
  });

  it("returns http_error with status on a non-2xx, non-429 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => "unavailable" })),
    );
    const result = await callAnthropicForYmms({ env: makeEnv(), userPrompt: "prompt" });
    expect(result).toEqual({ kind: "http_error", status: 503 });
  });

  it("returns timeout when the request is aborted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }),
    );
    const result = await callAnthropicForYmms({ env: makeEnv(), userPrompt: "prompt" });
    expect(result).toEqual({ kind: "timeout" });
  });

  it("returns invalid_response when no propose_cox_ymms tool_use block is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: "text", text: "I refuse to use tools." }] }),
      })),
    );
    const result = await callAnthropicForYmms({ env: makeEnv(), userPrompt: "prompt" });
    expect(result.kind).toBe("invalid_response");
  });

  it("returns invalid_response when the tool_use input fails schema validation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => toolUseResponse({ make: "Ram" })));
    const result = await callAnthropicForYmms({ env: makeEnv(), userPrompt: "prompt" });
    expect(result.kind).toBe("invalid_response");
  });
});
