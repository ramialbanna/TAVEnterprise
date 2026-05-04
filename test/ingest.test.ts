import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types/env";

// Mock the entire persistence layer so unit tests never touch a real DB.
vi.mock("../src/persistence/supabase", () => ({
  getSupabaseClient: vi.fn(() => ({})),
}));

vi.mock("../src/persistence/sourceRuns", () => ({
  upsertSourceRun: vi.fn(),
  completeSourceRun: vi.fn(),
}));

vi.mock("../src/persistence/rawListings", () => ({
  insertRawListing: vi.fn(),
}));

vi.mock("../src/persistence/deadLetter", () => ({
  writeDeadLetter: vi.fn(),
}));

vi.mock("../src/persistence/filteredOut", () => ({
  writeFilteredOut: vi.fn(),
}));

vi.mock("../src/persistence/normalizedListings", () => ({
  upsertNormalizedListing: vi.fn(),
}));

vi.mock("../src/persistence/vehicleCandidates", () => ({
  upsertVehicleCandidate: vi.fn(),
}));

vi.mock("../src/persistence/duplicateGroups", () => ({
  linkNormalizedListingToCandidate: vi.fn(),
}));

vi.mock("../src/persistence/buyBoxRules", () => ({
  fetchActiveBuyBoxRules: vi.fn(),
}));

vi.mock("../src/persistence/leads", () => ({
  upsertLead: vi.fn(),
}));

import { upsertSourceRun, completeSourceRun } from "../src/persistence/sourceRuns";
import { insertRawListing } from "../src/persistence/rawListings";
import { upsertNormalizedListing } from "../src/persistence/normalizedListings";
import { upsertVehicleCandidate } from "../src/persistence/vehicleCandidates";
import { linkNormalizedListingToCandidate } from "../src/persistence/duplicateGroups";
import { fetchActiveBuyBoxRules } from "../src/persistence/buyBoxRules";
import { upsertLead } from "../src/persistence/leads";

const RUNNING_RUN = { id: "run-uuid-1", status: "running", processed: 0, rejected: 0, created_leads: 0 };
const COMPLETED_RUN = { id: "run-uuid-2", status: "completed", processed: 4, rejected: 1, created_leads: 2 };

const SECRET = "test-ingest-secret";
const env = {
  WEBHOOK_HMAC_SECRET: SECRET,
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
} as unknown as Env;

const ctx = {
  waitUntil: (_p: Promise<unknown>) => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(upsertSourceRun).mockResolvedValue(RUNNING_RUN);
  vi.mocked(completeSourceRun).mockResolvedValue(undefined);
  vi.mocked(insertRawListing).mockResolvedValue({ id: "raw-uuid" });
  vi.mocked(upsertNormalizedListing).mockResolvedValue({ id: "norm-uuid", isNew: true, priceChanged: false, mileageChanged: false });
  vi.mocked(upsertVehicleCandidate).mockResolvedValue({ id: "vc-uuid", isNew: true });
  vi.mocked(linkNormalizedListingToCandidate).mockResolvedValue(undefined);
  vi.mocked(fetchActiveBuyBoxRules).mockResolvedValue([]);
  vi.mocked(upsertLead).mockResolvedValue({ id: "lead-uuid", created: true });
});

async function sign(body: string, secret: string): Promise<string> {
  const encoded = new TextEncoder().encode(body);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoded);
  const hex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

function makeRequest(body: string, signature: string, extraHeaders?: Record<string, string>): Request {
  return new Request("http://localhost/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tav-signature": signature,
      ...extraHeaders,
    },
    body,
  });
}

const VALID_PAYLOAD = JSON.stringify({
  source: "facebook",
  run_id: "run-001",
  region: "dallas_tx",
  scraped_at: new Date().toISOString(),
  items: [{ url: "https://fb.com/item/123", title: "2020 Toyota Camry SE, 62k miles, $18,500" }],
});

describe("POST /ingest", () => {
  it("returns 200 with item counts for a valid request", async () => {
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), env, ctx);

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.source).toBe("facebook");
    expect(body.run_id).toBe("run-001");
    expect(body.processed).toBe(1); // 1 item successfully inserted
    expect(body.rejected).toBe(0);
    expect(body.created_leads).toBe(0);
  });

  it("returns stored counters for a completed run (idempotency gate)", async () => {
    vi.mocked(upsertSourceRun).mockResolvedValue(COMPLETED_RUN);
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), env, ctx);

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(4);
    expect(body.rejected).toBe(1);
    expect(body.created_leads).toBe(2);
    // Items must not be reprocessed — insertRawListing should not be called.
    expect(vi.mocked(insertRawListing)).not.toHaveBeenCalled();
  });

  it("returns 503 when upsertSourceRun exhausts retries", async () => {
    vi.mocked(upsertSourceRun).mockRejectedValue(new TypeError("network failure"));
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), env, ctx);
    expect(res.status).toBe(503);
  });

  it("returns 401 for a missing x-tav-signature header", async () => {
    const req = new Request("http://localhost/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: VALID_PAYLOAD,
    });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 for a wrong signature", async () => {
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, "sha256=badc0ffee"), env, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 401 for a valid signature over a different secret", async () => {
    const sig = await sign(VALID_PAYLOAD, "wrong-secret");
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), env, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    const body = "not-json{{{";
    const sig = await sign(body, SECRET);
    const req = new Request("http://localhost/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tav-signature": sig },
      body,
    });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(400);
    expect((await res.json() as Record<string, unknown>).error).toBe("invalid_json");
  });

  it("returns 400 when source is missing", async () => {
    const payload = JSON.stringify({
      run_id: "run-001",
      region: "dallas_tx",
      scraped_at: new Date().toISOString(),
      items: [{ title: "test" }],
    });
    const sig = await sign(payload, SECRET);
    const res = await worker.fetch(makeRequest(payload, sig), env, ctx);
    expect(res.status).toBe(400);
    expect((await res.json() as Record<string, unknown>).error).toBe("invalid_payload");
  });

  it("returns 400 for an empty items array", async () => {
    const payload = JSON.stringify({
      source: "facebook",
      run_id: "run-001",
      region: "dallas_tx",
      scraped_at: new Date().toISOString(),
      items: [],
    });
    const sig = await sign(payload, SECRET);
    const res = await worker.fetch(makeRequest(payload, sig), env, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 413 when Content-Length header exceeds 2MB", async () => {
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(
      makeRequest(VALID_PAYLOAD, sig, { "content-length": String(3 * 1024 * 1024) }),
      env,
      ctx,
    );
    expect(res.status).toBe(413);
    expect((await res.json() as Record<string, unknown>).error).toBe("payload_too_large");
  });

  it("returns 404 for GET /ingest", async () => {
    const res = await worker.fetch(new Request("http://localhost/ingest"), env, ctx);
    expect(res.status).toBe(404);
  });

  it("existing GET /health still returns 200", async () => {
    const res = await worker.fetch(new Request("http://localhost/health"), env, ctx);
    expect(res.status).toBe(200);
  });
});
