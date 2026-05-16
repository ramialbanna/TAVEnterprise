import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types/env";
import type * as DatasetFetchModule from "../src/apify/datasetFetch";
import type * as HandleIngestModule from "../src/ingest/handleIngest";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../src/apify/datasetFetch", async () => {
  const actual = await vi.importActual<typeof DatasetFetchModule>("../src/apify/datasetFetch");
  return {
    ...actual,
    fetchApifyDatasetItems:        vi.fn(),
    fetchApifyRunDefaultDataset:   vi.fn(),
  };
});

vi.mock("../src/ingest/handleIngest", async () => {
  const actual = await vi.importActual<typeof HandleIngestModule>("../src/ingest/handleIngest");
  return {
    ...actual,
    ingestCore: vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, processed: 0, rejected: 0, created_leads: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  };
});

import {
  fetchApifyDatasetItems,
  fetchApifyRunDefaultDataset,
  ApifyAuthError,
  ApifyDatasetFetchError,
} from "../src/apify/datasetFetch";
import { ingestCore } from "../src/ingest/handleIngest";
import { MAX_INGEST_ITEMS } from "../src/validate";

const ctx = {
  waitUntil: (_p: Promise<unknown>) => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

// Task IDs that the regionMap actually recognises.
const TASK_EAST = "nccVufFs2grLH4Qsj"; // → dallas_tx
const TASK_WEST = "vk7OijnAOOo8V1ekc"; // → unmapped

const APIFY_SECRET = "test-apify-webhook-secret";
const APIFY_PAT    = "test-apify-pat";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "x",
    WEBHOOK_HMAC_SECRET: "x",
    NORMALIZER_SECRET: "x",
    MANHEIM_CLIENT_ID: "",
    MANHEIM_CLIENT_SECRET: "",
    MANHEIM_USERNAME: "",
    MANHEIM_PASSWORD: "",
    MANHEIM_TOKEN_URL: "",
    MANHEIM_MMR_URL: "",
    ALERT_WEBHOOK_URL: "",
    TWILIO_ACCOUNT_SID: "",
    TWILIO_AUTH_TOKEN: "",
    TWILIO_FROM_NUMBER: "",
    ALERT_TO_NUMBER: "",
    TAV_KV: {} as KVNamespace,
    ADMIN_API_SECRET: "x",
    APP_API_SECRET: "x",
    HYBRID_BUYBOX_ENABLED: "false",
    MANHEIM_LOOKUP_MODE: "direct",
    INTEL_WORKER_URL: "",
    INTEL_WORKER_SECRET: "",
    APIFY_WEBHOOK_SECRET: APIFY_SECRET,
    APIFY_TOKEN: APIFY_PAT,
    APIFY_WEBHOOK_ENABLED: "true",
    ...overrides,
  };
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/apify-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function succeededPayload(overrides: Partial<{
  run_id: string;
  actor_task_id: string;
  default_dataset_id?: string;
  finished_at?: string;
  event_type: string;
}> = {}) {
  return {
    eventType: overrides.event_type ?? "ACTOR.RUN.SUCCEEDED",
    resource: {
      id:               overrides.run_id ?? "Mq4gK3drUlfveMWLx",
      actorTaskId:      overrides.actor_task_id ?? TASK_EAST,
      defaultDatasetId: overrides.default_dataset_id ?? "ds-test-123",
      finishedAt:       overrides.finished_at ?? "2026-05-14T15:00:00.000Z",
      status:           "SUCCEEDED",
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchApifyDatasetItems).mockResolvedValue({ items: [], truncated: false });
  vi.mocked(fetchApifyRunDefaultDataset).mockResolvedValue("ds-fallback-456");
  vi.mocked(ingestCore).mockResolvedValue(
    new Response(JSON.stringify({ ok: true, processed: 2, rejected: 0, created_leads: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ── 1. Feature flag + auth ────────────────────────────────────────────────────

describe("POST /apify-webhook — feature flag and auth", () => {
  it("returns 503 when APIFY_WEBHOOK_ENABLED != 'true'", async () => {
    const env = makeEnv({ APIFY_WEBHOOK_ENABLED: "false" });
    const req = makeRequest(succeededPayload(), { Authorization: `Bearer ${APIFY_SECRET}` });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(503);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("apify_bridge_disabled");
    expect(vi.mocked(ingestCore)).not.toHaveBeenCalled();
  });

  it("returns 503 when APIFY_WEBHOOK_SECRET is unset", async () => {
    const env = makeEnv({ APIFY_WEBHOOK_SECRET: "" });
    const req = makeRequest(succeededPayload(), { Authorization: `Bearer anything` });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(503);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("apify_auth_not_configured");
  });

  it("returns 401 when Authorization header is missing", async () => {
    const env = makeEnv();
    const req = makeRequest(succeededPayload());
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(401);
    expect(vi.mocked(ingestCore)).not.toHaveBeenCalled();
  });

  it("returns 401 when bearer token does not match (constant-time compare)", async () => {
    const env = makeEnv();
    const req = makeRequest(succeededPayload(), { Authorization: "Bearer wrong-token" });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(401);
    expect(vi.mocked(ingestCore)).not.toHaveBeenCalled();
  });

  it("returns 401 when scheme is not Bearer", async () => {
    const env = makeEnv();
    const req = makeRequest(succeededPayload(), { Authorization: `Token ${APIFY_SECRET}` });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(401);
  });
});

// ── 2. Event type filter ──────────────────────────────────────────────────────

describe("POST /apify-webhook — event type filter", () => {
  it("processes ACTOR.RUN.SUCCEEDED", async () => {
    vi.mocked(fetchApifyDatasetItems).mockResolvedValueOnce({
      items: [{ url: "https://fb.com/1", title: "2020 Toyota Camry SE" }],
      truncated: false,
    });
    const env = makeEnv();
    const req = makeRequest(succeededPayload({ event_type: "ACTOR.RUN.SUCCEEDED" }), {
      Authorization: `Bearer ${APIFY_SECRET}`,
    });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(200);
    expect(vi.mocked(ingestCore)).toHaveBeenCalledOnce();
  });

  it("noops 200 on ACTOR.RUN.FAILED", async () => {
    const env = makeEnv();
    const req = makeRequest(succeededPayload({ event_type: "ACTOR.RUN.FAILED" }), {
      Authorization: `Bearer ${APIFY_SECRET}`,
    });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.skipped).toBe("event_type_ignored");
    expect(vi.mocked(ingestCore)).not.toHaveBeenCalled();
    expect(vi.mocked(fetchApifyDatasetItems)).not.toHaveBeenCalled();
  });

  it("noops 200 on ACTOR.RUN.ABORTED", async () => {
    const env = makeEnv();
    const req = makeRequest(succeededPayload({ event_type: "ACTOR.RUN.ABORTED" }), {
      Authorization: `Bearer ${APIFY_SECRET}`,
    });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(200);
    expect(vi.mocked(ingestCore)).not.toHaveBeenCalled();
  });

  it("noops 200 on ACTOR.RUN.TIMED_OUT", async () => {
    const env = makeEnv();
    const req = makeRequest(succeededPayload({ event_type: "ACTOR.RUN.TIMED_OUT" }), {
      Authorization: `Bearer ${APIFY_SECRET}`,
    });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(200);
    expect(vi.mocked(ingestCore)).not.toHaveBeenCalled();
  });

  it("noops 200 on ACTOR.RUN.CREATED (started events)", async () => {
    const env = makeEnv();
    const req = makeRequest(succeededPayload({ event_type: "ACTOR.RUN.CREATED" }), {
      Authorization: `Bearer ${APIFY_SECRET}`,
    });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(200);
    expect(vi.mocked(ingestCore)).not.toHaveBeenCalled();
  });
});

// ── 3. Task → region mapping ──────────────────────────────────────────────────

describe("POST /apify-webhook — region mapping", () => {
  it("noops 200 with apify.bridge.unmapped_task for tx-west", async () => {
    const env = makeEnv();
    const req = makeRequest(succeededPayload({ actor_task_id: TASK_WEST }), {
      Authorization: `Bearer ${APIFY_SECRET}`,
    });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.skipped).toBe("unmapped_task");
    expect(vi.mocked(ingestCore)).not.toHaveBeenCalled();
    expect(vi.mocked(fetchApifyDatasetItems)).not.toHaveBeenCalled();
  });

  it("returns 400 when resource.actorTaskId is missing entirely", async () => {
    const env = makeEnv();
    const payload = succeededPayload();
    delete (payload.resource as Record<string, unknown>).actorTaskId;
    const req = makeRequest(payload, { Authorization: `Bearer ${APIFY_SECRET}` });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(400);
  });

  it("dispatches with region=dallas_tx for tx-east", async () => {
    vi.mocked(fetchApifyDatasetItems).mockResolvedValueOnce({
      items: [{ url: "https://fb.com/1", title: "2020 Toyota Camry SE" }],
      truncated: false,
    });
    const env = makeEnv();
    const req = makeRequest(succeededPayload(), { Authorization: `Bearer ${APIFY_SECRET}` });
    await worker.fetch(req, env, ctx);
    const call = vi.mocked(ingestCore).mock.calls[0];
    expect(call).toBeDefined();
    expect(call![0].region).toBe("dallas_tx");
  });
});

// ── 4. defaultDatasetId fallback ──────────────────────────────────────────────

describe("POST /apify-webhook — defaultDatasetId fallback", () => {
  it("uses payload.resource.defaultDatasetId when present", async () => {
    vi.mocked(fetchApifyDatasetItems).mockResolvedValueOnce({
      items: [{ url: "https://fb.com/1", title: "2020 Toyota Camry SE" }],
      truncated: false,
    });
    const env = makeEnv();
    const req = makeRequest(succeededPayload({ default_dataset_id: "ds-from-payload" }), {
      Authorization: `Bearer ${APIFY_SECRET}`,
    });
    await worker.fetch(req, env, ctx);
    expect(vi.mocked(fetchApifyRunDefaultDataset)).not.toHaveBeenCalled();
    expect(vi.mocked(fetchApifyDatasetItems)).toHaveBeenCalledWith("ds-from-payload", expect.any(Object));
  });

  it("falls back to GET /actor-runs/{id} when defaultDatasetId is missing", async () => {
    vi.mocked(fetchApifyRunDefaultDataset).mockResolvedValueOnce("ds-from-run");
    vi.mocked(fetchApifyDatasetItems).mockResolvedValueOnce({
      items: [{ url: "https://fb.com/1", title: "2020 Toyota Camry SE" }],
      truncated: false,
    });
    const env = makeEnv();
    const payload = succeededPayload();
    delete (payload.resource as Record<string, unknown>).defaultDatasetId;
    const req = makeRequest(payload, { Authorization: `Bearer ${APIFY_SECRET}` });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(200);
    expect(vi.mocked(fetchApifyRunDefaultDataset)).toHaveBeenCalledOnce();
    expect(vi.mocked(fetchApifyDatasetItems)).toHaveBeenCalledWith("ds-from-run", expect.any(Object));
  });
});

// ── 5. Empty dataset ──────────────────────────────────────────────────────────

describe("POST /apify-webhook — empty dataset", () => {
  it("noops 200 with apify.bridge.empty_dataset and does NOT call ingestCore", async () => {
    vi.mocked(fetchApifyDatasetItems).mockResolvedValueOnce({ items: [], truncated: false });
    const env = makeEnv();
    const req = makeRequest(succeededPayload(), { Authorization: `Bearer ${APIFY_SECRET}` });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.skipped).toBe("empty_dataset");
    expect(vi.mocked(ingestCore)).not.toHaveBeenCalled();
  });
});

// ── 5b. Raidr-api payload mapping ────────────────────────────────────────────

describe("POST /apify-webhook — raidr-api payload mapping", () => {
  it("maps Apify dataset items through payloadAdapter before ingestCore", async () => {
    vi.mocked(fetchApifyDatasetItems).mockResolvedValueOnce({
      items: [
        {
          __typename: "MarketplaceListing",
          id: "1686857085840236",
          marketplace_listing_title: "2020 Toyota Camry SE 62k miles",
          custom_title: "2020 Toyota Camry SE 62k miles",
          listing_price: { amount: "18500.00", formatted_amount: "$18,500" },
          listing_date_ms: 1778443122000,
          marketplace_listing_seller: { name: "Dealer Joe" },
          location: { reverse_geocode: { city: "Boerne", state: "TX" } },
          is_live: true,
        },
      ],
      truncated: false,
    });

    const env = makeEnv();
    const req = makeRequest(succeededPayload(), { Authorization: `Bearer ${APIFY_SECRET}` });
    const res = await worker.fetch(req, env, ctx);

    expect(res.status).toBe(200);
    expect(vi.mocked(ingestCore)).toHaveBeenCalledOnce();
    const [envelope] = vi.mocked(ingestCore).mock.calls[0]!;
    expect(envelope.items).toHaveLength(1);
    const mapped = envelope.items[0] as Record<string, unknown>;
    expect(mapped.url).toBe("https://www.facebook.com/marketplace/item/1686857085840236/");
    expect(mapped.title).toBe("2020 Toyota Camry SE 62k miles");
    expect(mapped.price).toBe("18500.00");
    expect(mapped.sellerName).toBe("Dealer Joe");
    expect(mapped.postedAt).toBe(new Date(1778443122000).toISOString());
    // Original raidr-api keys preserved for audit / drift
    expect(mapped.id).toBe("1686857085840236");
    expect(mapped.marketplace_listing_title).toBe("2020 Toyota Camry SE 62k miles");
  });
});

// ── 6. Happy path ─────────────────────────────────────────────────────────────

describe("POST /apify-webhook — happy path", () => {
  it("builds the canonical IngestRequest envelope and calls ingestCore", async () => {
    const item1 = { url: "https://fb.com/1", title: "2020 Toyota Camry SE", price: "$18,500" };
    const item2 = { url: "https://fb.com/2", title: "2022 Honda Civic Sport", price: "$22,000" };
    vi.mocked(fetchApifyDatasetItems).mockResolvedValueOnce({
      items: [item1, item2],
      truncated: false,
    });

    const env = makeEnv();
    const req = makeRequest(
      succeededPayload({
        run_id: "abcDEF1234567890Z",
        finished_at: "2026-05-14T15:00:00.000Z",
      }),
      { Authorization: `Bearer ${APIFY_SECRET}` },
    );
    const res = await worker.fetch(req, env, ctx);

    expect(res.status).toBe(200);
    expect(vi.mocked(ingestCore)).toHaveBeenCalledOnce();
    const [envelope] = vi.mocked(ingestCore).mock.calls[0]!;
    expect(envelope).toEqual({
      source:     "facebook",
      run_id:     "abcDEF1234567890Z",
      region:     "dallas_tx",
      scraped_at: "2026-05-14T15:00:00.000Z",
      items:      [item1, item2],
    });
  });

  it("falls back to current time when finishedAt is missing", async () => {
    vi.mocked(fetchApifyDatasetItems).mockResolvedValueOnce({
      items: [{ url: "https://fb.com/1", title: "2020 Toyota Camry SE" }],
      truncated: false,
    });
    const env = makeEnv();
    const payload = succeededPayload();
    delete (payload.resource as Record<string, unknown>).finishedAt;
    const req = makeRequest(payload, { Authorization: `Bearer ${APIFY_SECRET}` });
    await worker.fetch(req, env, ctx);
    const [envelope] = vi.mocked(ingestCore).mock.calls[0]!;
    expect(envelope.scraped_at).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
  });
});

// ── 7. Apify upstream failures ────────────────────────────────────────────────

describe("POST /apify-webhook — upstream Apify failures", () => {
  it("returns 502 when Apify dataset fetch returns auth error (bad APIFY_TOKEN)", async () => {
    vi.mocked(fetchApifyDatasetItems).mockRejectedValueOnce(new ApifyAuthError(401));
    const env = makeEnv();
    const req = makeRequest(succeededPayload(), { Authorization: `Bearer ${APIFY_SECRET}` });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(502);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("apify_upstream_auth_failed");
    expect(vi.mocked(ingestCore)).not.toHaveBeenCalled();
  });

  it("returns 502 when Apify dataset fetch returns 5xx", async () => {
    vi.mocked(fetchApifyDatasetItems).mockRejectedValueOnce(new ApifyDatasetFetchError(503, "down"));
    const env = makeEnv();
    const req = makeRequest(succeededPayload(), { Authorization: `Bearer ${APIFY_SECRET}` });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(502);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("apify_upstream_failed");
    expect(vi.mocked(ingestCore)).not.toHaveBeenCalled();
  });

  it("returns 502 when run-detail fallback fetch fails", async () => {
    vi.mocked(fetchApifyRunDefaultDataset).mockRejectedValueOnce(new ApifyAuthError(403));
    const env = makeEnv();
    const payload = succeededPayload();
    delete (payload.resource as Record<string, unknown>).defaultDatasetId;
    const req = makeRequest(payload, { Authorization: `Bearer ${APIFY_SECRET}` });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(502);
    expect(vi.mocked(fetchApifyDatasetItems)).not.toHaveBeenCalled();
  });
});

// ── 8. Body / payload edge cases ──────────────────────────────────────────────

describe("POST /apify-webhook — body validation", () => {
  it("returns 400 on invalid JSON body", async () => {
    const env = makeEnv();
    const req = new Request("http://localhost/apify-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${APIFY_SECRET}` },
      body: "{not json",
    });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 on payload missing resource.id", async () => {
    const env = makeEnv();
    const req = makeRequest(
      { eventType: "ACTOR.RUN.SUCCEEDED", resource: { actorTaskId: TASK_EAST } },
      { Authorization: `Bearer ${APIFY_SECRET}` },
    );
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(400);
  });
});

// ── 9. Ingest contract — bridge must not bypass IngestRequestSchema max ────────

describe("POST /apify-webhook — ingest item cap", () => {
  it("caps dataset items at MAX_INGEST_ITEMS before calling ingestCore", async () => {
    const overflow = Array.from({ length: MAX_INGEST_ITEMS + 1 }, (_, i) => ({
      url: `https://fb.com/${i}`,
      title: `Vehicle ${i}`,
    }));
    vi.mocked(fetchApifyDatasetItems).mockResolvedValueOnce({ items: overflow, truncated: true });

    const env = makeEnv();
    const req = makeRequest(succeededPayload(), { Authorization: `Bearer ${APIFY_SECRET}` });
    const res = await worker.fetch(req, env, ctx);

    expect(res.status).toBe(200);
    expect(vi.mocked(ingestCore)).toHaveBeenCalledOnce();
    const [envelope] = vi.mocked(ingestCore).mock.calls[0]!;
    expect(envelope.items).toHaveLength(MAX_INGEST_ITEMS);
  });
});
