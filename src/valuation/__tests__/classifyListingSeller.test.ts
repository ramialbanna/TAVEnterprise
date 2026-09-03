import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { classifyListingSeller, shouldAutoRejectDealer } from "../classifyListingSeller";
import { callAnthropicForSellerClassify } from "../../llm/sellerClassifyClient";
import type { Env } from "../../types/env";

vi.mock("../../llm/sellerClassifyClient", () => ({
  callAnthropicForSellerClassify: vi.fn(),
}));

const ENV = { ANTHROPIC_API_KEY: "test-key", SELLER_CLASSIFY_MODEL: "claude-haiku-4-5" } as unknown as Env;

beforeEach(() => {
  vi.mocked(callAnthropicForSellerClassify).mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("classifyListingSeller", () => {
  it("returns the heuristic result without calling Haiku on a slam-dunk dealer", async () => {
    const result = await classifyListingSeller(
      {
        title: "2018 F-150",
        description: "We finance! Visit our lot. Stock #1",
        sellerName: "Metro Auto Group",
      },
      ENV,
    );
    expect(result.source).toBe("heuristic");
    expect(result.sellerType).toBe("dealer");
    expect(callAnthropicForSellerClassify).not.toHaveBeenCalled();
  });

  it("does not ask Haiku when the description names a Cars LLC", async () => {
    const result = await classifyListingSeller(
      {
        title: "2019 Cadillac Escalade ESV",
        description: "This vehicle is for sale by ARROYOS XCLUSIVE CARS LLC 2.",
        images: ["https://cdn.example/one-car.jpg"],
      },
      ENV,
    );
    expect(result.source).toBe("heuristic");
    expect(shouldAutoRejectDealer(result)).toBe(true);
    expect(callAnthropicForSellerClassify).not.toHaveBeenCalled();
  });

  it("does not call Haiku when there are no dealer signals and no photo", async () => {
    const result = await classifyListingSeller(
      { title: "2016 Honda CR-V", description: "Great daily driver.", sellerName: "Maria" },
      ENV,
    );
    expect(result.sellerType).toBe("unknown");
    expect(callAnthropicForSellerClassify).not.toHaveBeenCalled();
  });

  it("asks Haiku when text is clean but a listing photo exists", async () => {
    vi.mocked(callAnthropicForSellerClassify).mockResolvedValue({
      kind: "ok",
      proposal: {
        seller_type: "dealer",
        confidence: 0.9,
        reasoning: "Photo shows a dealer lot with rows of cars.",
        signals: ["dealer_lot_photo"],
      },
      latencyMs: 80,
      model: "claude-haiku-4-5",
    });

    const result = await classifyListingSeller(
      {
        title: "2016 Honda CR-V",
        description: "Great daily driver.",
        sellerName: "Maria",
        images: ["https://cdn.example/lot.jpg"],
      },
      ENV,
    );
    expect(callAnthropicForSellerClassify).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrls: ["https://cdn.example/lot.jpg"],
      }),
    );
    expect(result).toMatchObject({ sellerType: "dealer", source: "llm", confidence: 0.9 });
  });

  it("asks Haiku when heuristics are inconclusive, and uses the LLM result", async () => {
    vi.mocked(callAnthropicForSellerClassify).mockResolvedValue({
      kind: "ok",
      proposal: {
        seller_type: "private_party",
        confidence: 0.7,
        reasoning: "Personal tone; CARFAX is not dealer evidence.",
        signals: ["personal_seller"],
      },
      latencyMs: 40,
      model: "claude-haiku-4-5",
    });

    const result = await classifyListingSeller(
      { title: "2018 F-150", description: "Clean CARFAX, financing possible.", sellerName: "James" },
      ENV,
    );
    expect(callAnthropicForSellerClassify).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ sellerType: "private_party", source: "llm", confidence: 0.7 });
  });

  it("fails open to the heuristic when Haiku errors", async () => {
    vi.mocked(callAnthropicForSellerClassify).mockResolvedValue({ kind: "timeout" });
    const result = await classifyListingSeller(
      { title: "2018 F-150", description: "Clean CARFAX and a leftover warranty.", sellerName: "James" },
      ENV,
    );
    expect(result.source).toBe("heuristic");
    expect(result.confidence).toBeLessThan(0.85);
  });

  it("skips Haiku when allowLlm is false", async () => {
    await classifyListingSeller(
      { title: "2018 F-150", description: "Clean CARFAX, financing possible.", sellerName: "James" },
      ENV,
      { allowLlm: false },
    );
    expect(callAnthropicForSellerClassify).not.toHaveBeenCalled();
  });
});
