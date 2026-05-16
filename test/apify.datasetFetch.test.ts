import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchApifyDatasetItems,
  fetchApifyRunDefaultDataset,
  ApifyAuthError,
  ApifyDatasetFetchError,
  MAX_ITEMS_PER_RUN,
} from "../src/apify/datasetFetch";

const ENV = { APIFY_TOKEN: "test-apify-token" };

function mockFetchSequence(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("no more mock responses queued");
    return {
      ok:     next.status >= 200 && next.status < 300,
      status: next.status,
      json:   vi.fn().mockResolvedValue(next.body),
      text:   vi.fn().mockResolvedValue(typeof next.body === "string" ? next.body : JSON.stringify(next.body)),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchApifyRunDefaultDataset", () => {
  it("returns defaultDatasetId from run record", async () => {
    mockFetchSequence([{ status: 200, body: { data: { defaultDatasetId: "ds-abc" } } }]);
    const id = await fetchApifyRunDefaultDataset("run-1", ENV);
    expect(id).toBe("ds-abc");
  });

  it("sends Authorization: Bearer <APIFY_TOKEN>", async () => {
    const { calls } = mockFetchSequence([{ status: 200, body: { data: { defaultDatasetId: "ds-abc" } } }]);
    await fetchApifyRunDefaultDataset("run-1", ENV);
    const auth = (calls[0]!.init?.headers as Record<string, string>).Authorization;
    expect(auth).toBe("Bearer test-apify-token");
  });

  it("throws ApifyAuthError on 401", async () => {
    mockFetchSequence([{ status: 401, body: "" }]);
    await expect(fetchApifyRunDefaultDataset("run-1", ENV)).rejects.toBeInstanceOf(ApifyAuthError);
  });

  it("throws ApifyAuthError on 403", async () => {
    mockFetchSequence([{ status: 403, body: "" }]);
    await expect(fetchApifyRunDefaultDataset("run-1", ENV)).rejects.toBeInstanceOf(ApifyAuthError);
  });

  it("throws ApifyDatasetFetchError on 500", async () => {
    mockFetchSequence([{ status: 500, body: "boom" }]);
    await expect(fetchApifyRunDefaultDataset("run-1", ENV)).rejects.toBeInstanceOf(ApifyDatasetFetchError);
  });

  it("throws ApifyDatasetFetchError when defaultDatasetId is missing", async () => {
    mockFetchSequence([{ status: 200, body: { data: { id: "run-1" } } }]);
    await expect(fetchApifyRunDefaultDataset("run-1", ENV)).rejects.toBeInstanceOf(ApifyDatasetFetchError);
  });

  it("throws ApifyAuthError when APIFY_TOKEN is empty", async () => {
    await expect(fetchApifyRunDefaultDataset("run-1", { APIFY_TOKEN: "" }))
      .rejects.toBeInstanceOf(ApifyAuthError);
  });

  it("attaches an AbortSignal timeout to the run fetch", async () => {
    const { calls } = mockFetchSequence([{ status: 200, body: { data: { defaultDatasetId: "ds-x" } } }]);
    await fetchApifyRunDefaultDataset("run-1", ENV);
    expect(calls[0]!.init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("fetchApifyDatasetItems", () => {
  it("returns items from a single page when below page size", async () => {
    mockFetchSequence([
      { status: 200, body: [{ url: "https://fb.com/1" }, { url: "https://fb.com/2" }] },
    ]);
    const { items, truncated } = await fetchApifyDatasetItems("ds-1", ENV);
    expect(items).toHaveLength(2);
    expect(truncated).toBe(false);
  });

  it("returns empty + truncated=false on empty dataset", async () => {
    mockFetchSequence([{ status: 200, body: [] }]);
    const { items, truncated } = await fetchApifyDatasetItems("ds-1", ENV);
    expect(items).toEqual([]);
    expect(truncated).toBe(false);
  });

  it("paginates across multiple pages until a short final page", async () => {
    // First page returns 1000 items (a full page), second page returns 3 → stop.
    const pageOne = Array.from({ length: 1000 }, (_, i) => ({ url: `https://fb.com/${i}` }));
    const pageTwo = [{ url: "https://fb.com/last1" }, { url: "https://fb.com/last2" }, { url: "https://fb.com/last3" }];
    mockFetchSequence([
      { status: 200, body: pageOne },
      { status: 200, body: pageTwo },
    ]);
    const { items, truncated } = await fetchApifyDatasetItems("ds-1", ENV);
    expect(items).toHaveLength(1003);
    expect(truncated).toBe(false);
  });

  it("truncates at MAX_ITEMS_PER_RUN and flags truncated=true when more would be available", async () => {
    // Generate enough full pages to exactly hit MAX_ITEMS_PER_RUN, then probe returns 1 item.
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ url: `https://fb.com/${i}` }));
    const pages = Array.from({ length: MAX_ITEMS_PER_RUN / 1000 }, () => ({ status: 200, body: fullPage }));
    pages.push({ status: 200, body: [{ url: "https://fb.com/overflow" }] }); // probe
    mockFetchSequence(pages);
    const { items, truncated } = await fetchApifyDatasetItems("ds-1", ENV);
    expect(items).toHaveLength(MAX_ITEMS_PER_RUN);
    expect(truncated).toBe(true);
  });

  it("throws ApifyAuthError on 401", async () => {
    mockFetchSequence([{ status: 401, body: "" }]);
    await expect(fetchApifyDatasetItems("ds-1", ENV)).rejects.toBeInstanceOf(ApifyAuthError);
  });

  it("throws ApifyAuthError on 403", async () => {
    mockFetchSequence([{ status: 403, body: "" }]);
    await expect(fetchApifyDatasetItems("ds-1", ENV)).rejects.toBeInstanceOf(ApifyAuthError);
  });

  it("throws ApifyDatasetFetchError on 500", async () => {
    mockFetchSequence([{ status: 500, body: "boom" }]);
    await expect(fetchApifyDatasetItems("ds-1", ENV)).rejects.toBeInstanceOf(ApifyDatasetFetchError);
  });

  it("throws ApifyDatasetFetchError on unexpected non-array body", async () => {
    mockFetchSequence([{ status: 200, body: { not: "an array" } }]);
    await expect(fetchApifyDatasetItems("ds-1", ENV)).rejects.toBeInstanceOf(ApifyDatasetFetchError);
  });

  it("throws ApifyAuthError when APIFY_TOKEN is empty", async () => {
    await expect(fetchApifyDatasetItems("ds-1", { APIFY_TOKEN: "" }))
      .rejects.toBeInstanceOf(ApifyAuthError);
  });

  it("attaches an AbortSignal timeout to dataset fetches", async () => {
    const { calls } = mockFetchSequence([{ status: 200, body: [{ url: "https://fb.com/1" }] }]);
    await fetchApifyDatasetItems("ds-1", ENV);
    expect(calls[0]!.init?.signal).toBeInstanceOf(AbortSignal);
  });
});
