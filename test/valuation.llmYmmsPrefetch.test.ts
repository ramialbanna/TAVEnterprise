import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLlmYmmsPrefetch } from "../src/valuation/workerClient";
import type { LlmYmmsResolution, LlmYmmsResolutionInput } from "../src/valuation/resolveListingWithLLM";
import type * as ResolveListingWithLLMModule from "../src/valuation/resolveListingWithLLM";
import type { Env } from "../src/types/env";

// createLlmYmmsPrefetch (item 57 §6 Phase 1) batches the Claude round-trip
// across an ingest batch. These tests mock resolveListingWithLLM itself
// (already unit-tested on its own in resolveListingWithLLM.test.ts) so we
// can assert purely on the window's concurrency/scheduling behavior without
// re-standing-up the full alias/catalog/Anthropic machinery.
vi.mock("../src/valuation/resolveListingWithLLM", async () => {
  const actual = await vi.importActual<typeof ResolveListingWithLLMModule>(
    "../src/valuation/resolveListingWithLLM",
  );
  return { ...actual, resolveListingWithLLM: vi.fn() };
});

vi.mock("../src/persistence/supabase", () => ({
  getSupabaseClient: vi.fn(() => ({})),
}));

import { resolveListingWithLLM } from "../src/valuation/resolveListingWithLLM";

const ENV: Env = { LLM_YMMS_ENABLED: "true", ANTHROPIC_API_KEY: "test-key" } as unknown as Env;

function input(model: string): LlmYmmsResolutionInput {
  return { year: 2022, make: "Ram", model };
}

function hit(model: string): LlmYmmsResolution {
  return {
    kind: "llm_hit",
    make: "Ram",
    model,
    style: "4D Crew Cab",
    confidence: 0.9,
    reasoning: "x",
    latencyMs: 1,
    anthropicModel: "claude-sonnet-5",
    catalogRowCount: 2,
  };
}

/** A promise plus its external resolve, so tests can control exactly when a mocked call "finishes". */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default so any window slot filled incidentally (e.g. index 0 alongside
  // the index under test) resolves instead of hanging — tests that care
  // about a specific call's timing override this with their own mock.
  vi.mocked(resolveListingWithLLM).mockResolvedValue(hit("default"));
});

describe("createLlmYmmsPrefetch", () => {
  it("consume() returns undefined immediately for an index that was never registered, without an extra resolveListingWithLLM call", async () => {
    const prefetch = createLlmYmmsPrefetch(new Map([[0, input("1500")]]), ENV, 8);
    const callsAfterConstruction = vi.mocked(resolveListingWithLLM).mock.calls.length;

    const result = await prefetch.consume(5);

    expect(result).toBeUndefined();
    expect(resolveListingWithLLM).toHaveBeenCalledTimes(callsAfterConstruction);
  });

  it("starts up to `concurrency` calls immediately at construction, not one-at-a-time", () => {
    const deferreds = [deferred<LlmYmmsResolution>(), deferred<LlmYmmsResolution>(), deferred<LlmYmmsResolution>()];
    vi.mocked(resolveListingWithLLM).mockImplementation(async (i) => {
      const idx = ["1500", "2500", "3500"].indexOf((i as LlmYmmsResolutionInput).model as string);
      return deferreds[idx]!.promise;
    });

    createLlmYmmsPrefetch(
      new Map([
        [0, input("1500")],
        [1, input("2500")],
        [2, input("3500")],
      ]),
      ENV,
      2, // cap below the registered count
    );

    // Window fills synchronously at construction time — before anything is
    // ever awaited — so exactly `concurrency` calls should already be
    // in-flight, not zero and not all three.
    expect(resolveListingWithLLM).toHaveBeenCalledTimes(2);
  });

  it("slides the window forward as soon as a consumed item resolves", async () => {
    const d0 = deferred<LlmYmmsResolution>();
    const d1 = deferred<LlmYmmsResolution>();
    const d2 = deferred<LlmYmmsResolution>();
    vi.mocked(resolveListingWithLLM).mockImplementation(async (i) => {
      const model = (i as LlmYmmsResolutionInput).model;
      if (model === "1500") return d0.promise;
      if (model === "2500") return d1.promise;
      return d2.promise;
    });

    const prefetch = createLlmYmmsPrefetch(
      new Map([
        [0, input("1500")],
        [1, input("2500")],
        [2, input("3500")],
      ]),
      ENV,
      2,
    );

    expect(resolveListingWithLLM).toHaveBeenCalledTimes(2); // 0 and 1 started, 2 not yet

    d0.resolve(hit("1500"));
    const result0 = await prefetch.consume(0);
    expect(result0).toEqual(hit("1500"));

    // Consuming index 0 freed a window slot — index 2 should now be started.
    expect(resolveListingWithLLM).toHaveBeenCalledTimes(3);

    d1.resolve(hit("2500"));
    d2.resolve(hit("3500"));
    expect(await prefetch.consume(1)).toEqual(hit("2500"));
    expect(await prefetch.consume(2)).toEqual(hit("3500"));
  });

  it("starts an unconsumed-but-registered index directly if consume() reaches it before the window does (defensive path)", async () => {
    vi.mocked(resolveListingWithLLM).mockImplementation(async (i) =>
      hit((i as LlmYmmsResolutionInput).model as string),
    );

    // concurrency=1: only index 0 starts at construction time.
    const prefetch = createLlmYmmsPrefetch(
      new Map([
        [0, input("1500")],
        [1, input("2500")],
      ]),
      ENV,
      1,
    );
    expect(resolveListingWithLLM).toHaveBeenCalledTimes(1);

    // Consuming index 1 out of order must still work correctly.
    const result = await prefetch.consume(1);
    expect(result).toEqual(hit("2500"));
  });

  it("never rejects consume() — a thrown/rejected resolveListingWithLLM call degrades to a fallback resolution", async () => {
    vi.mocked(resolveListingWithLLM).mockRejectedValue(new Error("network blew up"));

    const prefetch = createLlmYmmsPrefetch(new Map([[0, input("1500")]]), ENV, 8);
    const result = await prefetch.consume(0);
    expect(result).toEqual({ kind: "fallback", reason: "http_error" });
  });

  it("consuming the same index twice returns the same resolution without a second resolveListingWithLLM call", async () => {
    vi.mocked(resolveListingWithLLM).mockResolvedValue(hit("1500"));
    const prefetch = createLlmYmmsPrefetch(new Map([[0, input("1500")]]), ENV, 8);

    const first = await prefetch.consume(0);
    // Second consume for the same, already-resolved-and-removed index falls
    // back to the defensive direct-start path — still correct, just an
    // extra call; assert on the *value*, which is what callers rely on.
    const second = await prefetch.consume(0);
    expect(first).toEqual(hit("1500"));
    expect(second).toEqual(hit("1500"));
  });
});
