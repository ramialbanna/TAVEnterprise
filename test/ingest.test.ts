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

vi.mock("../src/persistence/schemaDrift", () => ({
  writeSchemaDrift: vi.fn(),
}));

vi.mock("../src/persistence/buyBoxScoreAttributions", () => ({
  insertBuyBoxScoreAttribution: vi.fn().mockResolvedValue("attr-uuid"),
}));

vi.mock("../src/alerts/alerts", () => ({
  sendExcellentLeadSummary: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/valuation/workerClient", async () => {
  const actual = await vi.importActual<typeof import("../src/valuation/workerClient")>("../src/valuation/workerClient");
  return { ...actual, getMmrValueFromWorker: vi.fn().mockResolvedValue(null) };
});

vi.mock("../src/persistence/valuationSnapshots", () => ({
  writeValuationSnapshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/persistence/vehicleEnrichments", () => ({
  writeVehicleEnrichment: vi.fn().mockResolvedValue(undefined),
}));

// Wrap computeFinalScore so individual tests can override it via mockReturnValueOnce.
vi.mock("../src/scoring/lead", async () => {
  const actual = await vi.importActual<typeof import("../src/scoring/lead")>("../src/scoring/lead");
  return { ...actual, computeFinalScore: vi.fn().mockImplementation(actual.computeFinalScore) };
});

import { upsertSourceRun, completeSourceRun } from "../src/persistence/sourceRuns";
import { insertRawListing } from "../src/persistence/rawListings";
import { upsertNormalizedListing } from "../src/persistence/normalizedListings";
import { upsertVehicleCandidate } from "../src/persistence/vehicleCandidates";
import { linkNormalizedListingToCandidate } from "../src/persistence/duplicateGroups";
import { fetchActiveBuyBoxRules } from "../src/persistence/buyBoxRules";
import { upsertLead } from "../src/persistence/leads";
import { writeSchemaDrift } from "../src/persistence/schemaDrift";
import { sendExcellentLeadSummary } from "../src/alerts/alerts";
import { computeFinalScore } from "../src/scoring/lead";
import { insertBuyBoxScoreAttribution } from "../src/persistence/buyBoxScoreAttributions";
import { getMmrValueFromWorker, WorkerTimeoutError, WorkerRateLimitError } from "../src/valuation/workerClient";
import { writeValuationSnapshot } from "../src/persistence/valuationSnapshots";
import { writeVehicleEnrichment } from "../src/persistence/vehicleEnrichments";

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
  vi.mocked(writeSchemaDrift).mockResolvedValue(undefined);
  vi.mocked(insertBuyBoxScoreAttribution).mockResolvedValue("attr-uuid");
  vi.mocked(getMmrValueFromWorker).mockResolvedValue(null);
  vi.mocked(writeValuationSnapshot).mockResolvedValue(undefined);
  vi.mocked(writeVehicleEnrichment).mockResolvedValue(undefined);
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

  it("records schema drift for unknown fields and still returns 200", async () => {
    const payload = JSON.stringify({
      source: "facebook",
      run_id: "run-drift-001",
      region: "dallas_tx",
      scraped_at: new Date().toISOString(),
      // verification_status is not in KNOWN_FACEBOOK_FIELDS → should trigger drift
      items: [{ url: "https://fb.com/item/drift", title: "2020 Toyota Camry SE, 62k miles", verification_status: "verified" }],
    });
    const sig = await sign(payload, SECRET);
    const res = await worker.fetch(makeRequest(payload, sig), env, ctx);

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(vi.mocked(writeSchemaDrift)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event_type: "unexpected_field", field_path: "verification_status" }),
    );
  });

  it("ingest still returns 200 when writeSchemaDrift throws", async () => {
    vi.mocked(writeSchemaDrift).mockRejectedValue(new Error("DB unavailable"));
    const payload = JSON.stringify({
      source: "facebook",
      run_id: "run-drift-002",
      region: "dallas_tx",
      scraped_at: new Date().toISOString(),
      items: [{ url: "https://fb.com/item/drift2", title: "2021 Honda Civic EX, 30k miles", unknown_future_field: "value" }],
    });
    const sig = await sign(payload, SECRET);
    const res = await worker.fetch(makeRequest(payload, sig), env, ctx);

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(1);
  });

  it("dispatches excellent lead alert via ctx.waitUntil when grade is excellent", async () => {
    vi.mocked(computeFinalScore).mockReturnValueOnce({ finalScore: 92, grade: "excellent" });
    vi.mocked(upsertLead).mockResolvedValueOnce({ id: "lead-excellent", created: true });
    const waitUntilSpy = vi.spyOn(ctx, "waitUntil");

    const sig = await sign(VALID_PAYLOAD, SECRET);
    await worker.fetch(makeRequest(VALID_PAYLOAD, sig), env, ctx);

    expect(waitUntilSpy).toHaveBeenCalled();
    expect(vi.mocked(sendExcellentLeadSummary)).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([expect.objectContaining({ leadId: "lead-excellent", finalScore: 92 })]),
      expect.objectContaining({ runId: "run-001", source: "facebook" }),
    );
  });

  it("does not dispatch alert when grade is good (not excellent)", async () => {
    vi.mocked(computeFinalScore).mockReturnValueOnce({ finalScore: 75, grade: "good" });
    const waitUntilSpy = vi.spyOn(ctx, "waitUntil");

    const sig = await sign(VALID_PAYLOAD, SECRET);
    await worker.fetch(makeRequest(VALID_PAYLOAD, sig), env, ctx);

    expect(vi.mocked(sendExcellentLeadSummary)).not.toHaveBeenCalled();
    expect(waitUntilSpy).not.toHaveBeenCalled();
  });
});

// ── MANHEIM_LOOKUP_MODE="worker" integration tests ────────────────────────────

const WORKER_MMR_RESULT = {
  mmrValue: 18_500,
  confidence: "high" as const,
  method: "vin" as const,
  rawResponse: {},
};

const workerEnv = {
  WEBHOOK_HMAC_SECRET: SECRET,
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  MANHEIM_LOOKUP_MODE: "worker",
  INTEL_WORKER_URL: "https://intel-worker.example.com",
  INTEL_WORKER_SECRET: "test-service-secret",
} as unknown as Env;

describe("POST /ingest — MANHEIM_LOOKUP_MODE=worker", () => {
  it("calls intelligence worker and writes valuation snapshot when worker returns a value", async () => {
    vi.mocked(getMmrValueFromWorker).mockResolvedValueOnce(WORKER_MMR_RESULT);
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);

    expect(res.status).toBe(200);
    expect(vi.mocked(getMmrValueFromWorker)).toHaveBeenCalledOnce();
    expect(vi.mocked(writeValuationSnapshot)).toHaveBeenCalledOnce();
    expect(vi.mocked(writeValuationSnapshot)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ valuation: expect.objectContaining({ mmrValue: 18_500, confidence: "high" }) }),
    );
  });

  it("falls back gracefully (returns 200, no snapshot) when worker call times out", async () => {
    vi.mocked(getMmrValueFromWorker).mockRejectedValueOnce(new WorkerTimeoutError());
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(vi.mocked(writeValuationSnapshot)).not.toHaveBeenCalled();
  });

  it("falls back gracefully (returns 200, no snapshot) when worker returns 429", async () => {
    vi.mocked(getMmrValueFromWorker).mockRejectedValueOnce(new WorkerRateLimitError());
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(vi.mocked(writeValuationSnapshot)).not.toHaveBeenCalled();
  });

  it("direct mode does not call getMmrValueFromWorker", async () => {
    const sig = await sign(VALID_PAYLOAD, SECRET);
    // env has no MANHEIM_LOOKUP_MODE → treated as "direct"
    await worker.fetch(makeRequest(VALID_PAYLOAD, sig), env, ctx);

    expect(vi.mocked(getMmrValueFromWorker)).not.toHaveBeenCalled();
  });
});

// ── Normalization enrichment tests ────────────────────────────────────────────

// YMM result with full normalization metadata — triggers enrichment write
const WORKER_YMM_MMR_RESULT = {
  mmrValue: 16_000,
  confidence: "medium" as const,
  method: "year_make_model" as const,
  rawResponse: {},
  lookupMake: "Toyota",
  lookupModel: "Camry",
  lookupTrim: null,
  normalizationConfidence: "exact" as const,
};

describe("POST /ingest — vehicle_enrichments normalization write", () => {
  it("writes vehicle_enrichments for YMM worker mode when vcId is available", async () => {
    vi.mocked(getMmrValueFromWorker).mockResolvedValueOnce(WORKER_YMM_MMR_RESULT);
    const sig = await sign(VALID_PAYLOAD, SECRET);
    await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);

    expect(vi.mocked(writeVehicleEnrichment)).toHaveBeenCalledOnce();
    expect(vi.mocked(writeVehicleEnrichment)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        vehicleCandidateId: "vc-uuid",
        enrichmentSource: "mmr_normalization",
        enrichmentType: "normalization",
        payload: expect.objectContaining({
          lookup_make: "Toyota",
          lookup_model: "Camry",
          normalization_confidence: "exact",
          trim_sent_to_worker: false,
        }),
      }),
    );
  });

  it("does not write vehicle_enrichments for VIN-path worker result", async () => {
    // WORKER_MMR_RESULT has method: "vin" — should not trigger enrichment
    vi.mocked(getMmrValueFromWorker).mockResolvedValueOnce(WORKER_MMR_RESULT);
    const sig = await sign(VALID_PAYLOAD, SECRET);
    await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);

    expect(vi.mocked(writeVehicleEnrichment)).not.toHaveBeenCalled();
  });

  it("does not write vehicle_enrichments in direct mode (YMM result without normalization metadata)", async () => {
    // Direct-mode MmrResult has no normalizationConfidence field
    const directYmmResult = { mmrValue: 16_000, confidence: "medium" as const, method: "year_make_model" as const, rawResponse: {} };
    vi.mocked(getMmrValueFromWorker).mockResolvedValueOnce(directYmmResult);
    const sig = await sign(VALID_PAYLOAD, SECRET);
    // Even with workerEnv, if normalizationConfidence is absent the guard fails
    await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);

    expect(vi.mocked(writeVehicleEnrichment)).not.toHaveBeenCalled();
  });

  it("enrichment write failure does not fail ingest (returns 200) and logs event", async () => {
    vi.mocked(getMmrValueFromWorker).mockResolvedValueOnce(WORKER_YMM_MMR_RESULT);
    vi.mocked(writeVehicleEnrichment).mockRejectedValueOnce(new Error("db constraint"));
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    // Snapshot still written despite enrichment failure
    expect(vi.mocked(writeValuationSnapshot)).toHaveBeenCalledOnce();
  });
});
