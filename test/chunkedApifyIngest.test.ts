import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "../src/types/env";
import type { IngestRequest } from "../src/validate";
import { dispatchApifyIngest, runChunkedApifyIngest } from "../src/ingest/chunkedApifyIngest";
import { INGEST_CHUNK_SIZE } from "../src/ingest/runIngestItemLoop";

vi.mock("../src/ingest/handleIngest", () => ({
  ingestCore: vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true, processed: 1 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ),
}));

vi.mock("../src/ingest/runIngestItemLoop", async () => {
  const actual = await vi.importActual<typeof import("../src/ingest/runIngestItemLoop")>(
    "../src/ingest/runIngestItemLoop",
  );
  return {
    ...actual,
    runIngestItemLoop: vi.fn(),
  };
});

vi.mock("../src/persistence/supabase", () => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock("../src/persistence/retry", () => ({
  withRetry: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock("../src/persistence/sourceRuns", () => ({
  upsertSourceRun: vi.fn(),
  completeSourceRunSafe: vi.fn().mockResolvedValue(undefined),
}));

import { ingestCore } from "../src/ingest/handleIngest";
import { runIngestItemLoop } from "../src/ingest/runIngestItemLoop";
import { upsertSourceRun, completeSourceRunSafe } from "../src/persistence/sourceRuns";
import { getSupabaseClient } from "../src/persistence/supabase";

const ctx = {
  waitUntil: vi.fn(),
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

const env = {} as Env;

function makeEnvelope(itemCount: number): IngestRequest {
  return {
    source: "craigslist",
    run_id: "run-chunk-test",
    region: "dallas_tx",
    scraped_at: "2026-08-08T16:00:00.000Z",
    items: Array.from({ length: itemCount }, (_, i) => ({
      url: `https://dallas.craigslist.org/cto/d/item-${i}.html`,
      title: `2020 Toyota Camry ${i}`,
      year: 2020,
      make: "toyota",
      model: "camry",
      priceUsd: 15000 + i,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(upsertSourceRun).mockResolvedValue({
    id: "sr-1",
    status: "running",
    processed: 0,
    rejected: 0,
    created_leads: 0,
  });
  vi.mocked(runIngestItemLoop).mockResolvedValue({
    processed: INGEST_CHUNK_SIZE,
    rejected: 0,
    created_leads: 1,
    truncated: false,
    items_skipped: 0,
    excellentLeads: [],
  });
  vi.mocked(getSupabaseClient).mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              processed: 20,
              rejected: 0,
              created_leads: 3,
              status: "completed",
              error_message: null,
            },
            error: null,
          }),
        }),
      }),
    }),
  } as never);
});

describe("dispatchApifyIngest", () => {
  it("passes small batches through to ingestCore", async () => {
    const envelope = makeEnvelope(3);
    const res = await dispatchApifyIngest(envelope, env, ctx);
    expect(res.status).toBe(200);
    expect(vi.mocked(ingestCore)).toHaveBeenCalledOnce();
    expect(vi.mocked(ingestCore)).toHaveBeenCalledWith(envelope, env, ctx);
    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });

  it("processes large batches synchronously via chunked ingest", async () => {
    const envelope = makeEnvelope(20);
    const res = await dispatchApifyIngest(envelope, env, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.item_count).toBe(20);
    expect(body.chunks).toBe(Math.ceil(20 / INGEST_CHUNK_SIZE));
    expect(vi.mocked(ingestCore)).not.toHaveBeenCalled();
    expect(vi.mocked(runIngestItemLoop)).toHaveBeenCalledTimes(Math.ceil(20 / INGEST_CHUNK_SIZE));
    expect(body.processed).toBe(20);
    expect(body.status).toBe("completed");
  });

  it("returns idempotent response when source run already completed", async () => {
    vi.mocked(upsertSourceRun).mockResolvedValueOnce({
      id: "sr-done",
      status: "completed",
      processed: 20,
      rejected: 0,
      created_leads: 2,
    });
    const res = await dispatchApifyIngest(makeEnvelope(20), env, ctx);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.idempotent).toBe(true);
    expect(body.processed).toBe(20);
    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });
});

describe("runChunkedApifyIngest", () => {
  it("processes every chunk and completes the source run once", async () => {
    const envelope = makeEnvelope(20);
    const run = {
      id: "sr-1",
      status: "running",
      processed: 0,
      rejected: 0,
      created_leads: 0,
    };

    await runChunkedApifyIngest(envelope, env, ctx, run);

    const expectedChunks = Math.ceil(20 / INGEST_CHUNK_SIZE);
    expect(vi.mocked(runIngestItemLoop)).toHaveBeenCalledTimes(expectedChunks);
    expect(vi.mocked(completeSourceRunSafe)).toHaveBeenCalledOnce();
    const completion = vi.mocked(completeSourceRunSafe).mock.calls[0]![2];
    expect(completion.status).toBe("completed");
    expect(completion.processed).toBe(expectedChunks * INGEST_CHUNK_SIZE);
    expect(completion.created_leads).toBe(expectedChunks);
  });

  it("marks truncated when a chunk hits the per-slice deadline", async () => {
    vi.mocked(runIngestItemLoop)
      .mockResolvedValueOnce({
        processed: 5,
        rejected: 0,
        created_leads: 0,
        truncated: true,
        items_skipped: 2,
        excellentLeads: [],
      })
      .mockResolvedValue({
        processed: 7,
        rejected: 0,
        created_leads: 0,
        truncated: false,
        items_skipped: 0,
        excellentLeads: [],
      });

    await runChunkedApifyIngest(makeEnvelope(20), env, ctx, {
      id: "sr-1",
      status: "running",
      processed: 0,
      rejected: 0,
      created_leads: 0,
    });

    const completion = vi.mocked(completeSourceRunSafe).mock.calls[0]![2];
    expect(completion.status).toBe("truncated");
    expect(completion.error_message).toBe("batch_truncated:2_items_skipped");
  });
});
