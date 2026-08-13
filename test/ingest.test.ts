import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types/env";
import type * as LeadScoringModule from "../src/scoring/lead";
import type * as WorkerClientModule from "../src/valuation/workerClient";

// Mock the entire persistence layer so unit tests never touch a real DB.
vi.mock("../src/persistence/supabase", () => ({
  getSupabaseClient: vi.fn(() => ({})),
}));

vi.mock("../src/persistence/sourceRuns", () => ({
  upsertSourceRun: vi.fn(),
  completeSourceRun: vi.fn(),
  completeSourceRunSafe: vi.fn().mockResolvedValue(undefined),
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
  const actual = await vi.importActual<typeof WorkerClientModule>("../src/valuation/workerClient");
  return {
    ...actual,
    getMmrValueFromWorker: vi.fn().mockResolvedValue(null),
    getMmrLookupOutcome: vi.fn().mockResolvedValue({ kind: "miss", reason: "not_configured", method: null }),
  };
});

vi.mock("../src/persistence/valuationSnapshots", () => ({
  writeValuationSnapshot:     vi.fn().mockResolvedValue(undefined),
  writeValuationMissSnapshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/persistence/vehicleEnrichments", () => ({
  writeVehicleEnrichment: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/ingest/coxNoDataRetryPass", () => ({
  runCoxNoDataRetryPass: vi.fn().mockResolvedValue({ attempted: 0, recovered: 0 }),
  MAX_RETRIES_PER_SLICE: 10,
}));

// Wrap computeFinalScore so individual tests can override it via mockReturnValueOnce.
vi.mock("../src/scoring/lead", async () => {
  const actual = await vi.importActual<typeof LeadScoringModule>("../src/scoring/lead");
  return { ...actual, computeFinalScore: vi.fn().mockImplementation(actual.computeFinalScore) };
});

import { upsertSourceRun, completeSourceRun, completeSourceRunSafe } from "../src/persistence/sourceRuns";
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
import { getMmrValueFromWorker, getMmrLookupOutcome } from "../src/valuation/workerClient";
import { writeValuationSnapshot, writeValuationMissSnapshot } from "../src/persistence/valuationSnapshots";
import { writeVehicleEnrichment } from "../src/persistence/vehicleEnrichments";
import { runCoxNoDataRetryPass } from "../src/ingest/coxNoDataRetryPass";

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
  vi.mocked(completeSourceRunSafe).mockResolvedValue(undefined);
  vi.mocked(insertRawListing).mockResolvedValue({ id: "raw-uuid" });
  vi.mocked(upsertNormalizedListing).mockResolvedValue({ id: "norm-uuid", isNew: true, priceChanged: false, mileageChanged: false });
  vi.mocked(upsertVehicleCandidate).mockResolvedValue({ id: "vc-uuid", isNew: true });
  vi.mocked(linkNormalizedListingToCandidate).mockResolvedValue(undefined);
  vi.mocked(fetchActiveBuyBoxRules).mockResolvedValue([]);
  vi.mocked(upsertLead).mockResolvedValue({ id: "lead-uuid", created: true });
  vi.mocked(writeSchemaDrift).mockResolvedValue(undefined);
  vi.mocked(insertBuyBoxScoreAttribution).mockResolvedValue("attr-uuid");
  vi.mocked(getMmrValueFromWorker).mockResolvedValue(null);
  vi.mocked(getMmrLookupOutcome).mockResolvedValue({ kind: "miss", reason: "not_configured", method: null });
  vi.mocked(writeValuationSnapshot).mockResolvedValue(undefined);
  vi.mocked(writeValuationMissSnapshot).mockResolvedValue(undefined);
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

const CRAIGSLIST_PAYLOAD = JSON.stringify({
  source: "craigslist",
  run_id: "run-cl-001",
  region: "dallas_tx",
  scraped_at: new Date().toISOString(),
  items: [{
    url: "https://dallas.craigslist.org/ftw/cto/d/dallas-2019-honda-accord-sport/1234567890.html",
    title: "2019 Honda Accord Sport - low miles",
    year: 2019,
    make: "honda",
    model: "accord",
    trim: "sport",
    price: 18500,
    mileage: 62000,
    body_text: "Garage kept, one owner.",
  }],
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

  it("returns 200 with processed > 0 for craigslist source", async () => {
    const sig = await sign(CRAIGSLIST_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(CRAIGSLIST_PAYLOAD, sig), env, ctx);

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.source).toBe("craigslist");
    expect(body.processed).toBe(1);
    expect(body.rejected).toBe(0);
    expect(vi.mocked(upsertNormalizedListing)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        source: "craigslist",
        make: "honda",
        model: "accord",
        description: "Garage kept, one owner.",
      }),
      expect.anything(),
      expect.anything(),
    );
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

  it("returns 503 when the HMAC secret is not configured", async () => {
    const misconfiguredEnv = { ...env, WEBHOOK_HMAC_SECRET: "" } as Env;
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), misconfiguredEnv, ctx);

    expect(res.status).toBe(503);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("ingest_auth_not_configured");
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

  it("returns 503 for /admin when the admin secret is not configured", async () => {
    const misconfiguredEnv = { ...env, ADMIN_API_SECRET: "" } as Env;
    const req = new Request("http://localhost/admin/import-batches", {
      method: "GET",
      headers: { Authorization: "Bearer " },
    });
    const res = await worker.fetch(req, misconfiguredEnv, ctx);

    expect(res.status).toBe(503);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("admin_auth_not_configured");
  });

  it("returns JSON 503 (not a thrown 1101) when listImportBatches errors", async () => {
    const ADMIN = "admin-test-secret";
    const adminEnv = { ...env, ADMIN_API_SECRET: ADMIN } as Env;
    const req = new Request("http://localhost/admin/import-batches", {
      method: "GET",
      headers: { Authorization: `Bearer ${ADMIN}` },
    });
    const res = await worker.fetch(req, adminEnv, ctx);

    expect(res.status).toBe(503);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("db_error");
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
    // waitUntil is still called once — for completeSourceRunSafe. The
    // assertion is that no excellent-lead alert went out.
    expect(waitUntilSpy).toHaveBeenCalledTimes(1);
  });
});

// ── MANHEIM_LOOKUP_MODE="worker" integration tests ────────────────────────────

const WORKER_MMR_RESULT = {
  mmrValue: 18_500,
  confidence: "high" as const,
  method: "vin" as const,
  rawResponse: {},
};

/** Item 72 — 2010 is below VALUATION_MIN_YEAR (2011). */
const BELOW_YEAR_FLOOR_PAYLOAD = JSON.stringify({
  source: "facebook",
  run_id: "run-002",
  region: "dallas_tx",
  scraped_at: new Date().toISOString(),
  items: [{ url: "https://fb.com/item/124", title: "2010 Toyota Camry SE, 180k miles, $4,500" }],
});

const BELOW_YEAR_FLOOR_VIN_PAYLOAD = JSON.stringify({
  source: "facebook",
  run_id: "run-003",
  region: "dallas_tx",
  scraped_at: new Date().toISOString(),
  items: [{
    url: "https://fb.com/item/125",
    title: "2010 Toyota Camry SE, 180k miles, $4,500",
    vin: "4T1BF3EK5AU513879",
  }],
});

const AT_YEAR_FLOOR_PAYLOAD = JSON.stringify({
  source: "facebook",
  run_id: "run-004",
  region: "dallas_tx",
  scraped_at: new Date().toISOString(),
  items: [{ url: "https://fb.com/item/126", title: "2011 Toyota Camry SE, 160k miles, $6,500" }],
});

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
    vi.mocked(getMmrLookupOutcome).mockResolvedValueOnce({ kind: "hit", result: WORKER_MMR_RESULT });
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);

    expect(res.status).toBe(200);
    expect(vi.mocked(getMmrLookupOutcome)).toHaveBeenCalledOnce();
    expect(vi.mocked(writeValuationSnapshot)).toHaveBeenCalledOnce();
    expect(vi.mocked(writeValuationSnapshot)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ valuation: expect.objectContaining({ mmrValue: 18_500, confidence: "high" }) }),
    );
    expect(vi.mocked(writeValuationMissSnapshot)).not.toHaveBeenCalled();
  });

  it("falls back gracefully (returns 200) when worker call times out and persists miss with reason 'cox_timeout'", async () => {
    vi.mocked(getMmrLookupOutcome).mockResolvedValueOnce({ kind: "miss", reason: "cox_timeout", method: "year_make_model" });
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(vi.mocked(writeValuationSnapshot)).not.toHaveBeenCalled();
    expect(vi.mocked(writeValuationMissSnapshot)).toHaveBeenCalledOnce();
    expect(vi.mocked(writeValuationMissSnapshot)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ missingReason: "cox_timeout" }),
    );
  });

  it("falls back gracefully (returns 200) when worker returns 429 and persists miss with reason 'cox_rate_limited'", async () => {
    vi.mocked(getMmrLookupOutcome).mockResolvedValueOnce({ kind: "miss", reason: "cox_rate_limited", method: "year_make_model" });
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(vi.mocked(writeValuationSnapshot)).not.toHaveBeenCalled();
    expect(vi.mocked(writeValuationMissSnapshot)).toHaveBeenCalledOnce();
  });

  it("persists miss with reason 'trim_missing' when adapter produced no trim", async () => {
    vi.mocked(getMmrLookupOutcome).mockResolvedValueOnce({ kind: "miss", reason: "trim_missing", method: "year_make_model" });
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);
    expect(res.status).toBe(200);
    expect(vi.mocked(writeValuationMissSnapshot)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ missingReason: "trim_missing", method: "year_make_model" }),
    );
  });

  it("persists miss with reason 'mileage_missing' when adapter produced no mileage", async () => {
    vi.mocked(getMmrLookupOutcome).mockResolvedValueOnce({ kind: "miss", reason: "mileage_missing", method: "year_make_model" });
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);
    expect(res.status).toBe(200);
    expect(vi.mocked(writeValuationMissSnapshot)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ missingReason: "mileage_missing" }),
    );
  });

  it("persists miss with reason 'cox_no_data' when worker returned a negative envelope", async () => {
    vi.mocked(getMmrLookupOutcome).mockResolvedValueOnce({ kind: "miss", reason: "cox_no_data", method: "vin" });
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);
    expect(res.status).toBe(200);
    expect(vi.mocked(writeValuationMissSnapshot)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ missingReason: "cox_no_data", method: "vin" }),
    );
  });

  it("item 72: skips the lookup entirely for a no-VIN listing below the year floor", async () => {
    const sig = await sign(BELOW_YEAR_FLOOR_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(BELOW_YEAR_FLOOR_PAYLOAD, sig), workerEnv, ctx);

    expect(res.status).toBe(200);
    // No catalog cascade and no Manheim round-trip: Unprocessed Leads hides
    // 2010-and-older, so a buyer could never act on the price anyway.
    expect(vi.mocked(getMmrLookupOutcome)).not.toHaveBeenCalled();
    expect(vi.mocked(writeValuationSnapshot)).not.toHaveBeenCalled();
    expect(vi.mocked(writeValuationMissSnapshot)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ missingReason: "year_below_valuation_floor", method: null }),
    );
  });

  it("item 72: still runs the lookup for a below-floor listing that has a VIN", async () => {
    vi.mocked(getMmrLookupOutcome).mockResolvedValueOnce({ kind: "hit", result: WORKER_MMR_RESULT });
    const sig = await sign(BELOW_YEAR_FLOOR_VIN_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(BELOW_YEAR_FLOOR_VIN_PAYLOAD, sig), workerEnv, ctx);

    expect(res.status).toBe(200);
    // The VIN path never touches the catalog, so the year floor must not gate it.
    expect(vi.mocked(getMmrLookupOutcome)).toHaveBeenCalledOnce();
    expect(vi.mocked(writeValuationSnapshot)).toHaveBeenCalledOnce();
  });

  it("item 72: still runs the lookup at the floor year itself", async () => {
    vi.mocked(getMmrLookupOutcome).mockResolvedValueOnce({ kind: "hit", result: WORKER_MMR_RESULT });
    const sig = await sign(AT_YEAR_FLOOR_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(AT_YEAR_FLOOR_PAYLOAD, sig), workerEnv, ctx);

    expect(res.status).toBe(200);
    expect(vi.mocked(getMmrLookupOutcome)).toHaveBeenCalledOnce();
    expect(vi.mocked(writeValuationSnapshot)).toHaveBeenCalledOnce();
  });

  it("item 72: persists the Cox tokens Manheim refused on the miss snapshot", async () => {
    vi.mocked(getMmrLookupOutcome).mockResolvedValueOnce({
      kind: "miss",
      reason: "cox_no_data",
      method: "year_make_model",
      lookupMake: "TOYOTA",
      lookupModel: "CAMRY V6",
      lookupTrim: "4D SEDAN LE",
    });
    const sig = await sign(VALID_PAYLOAD, SECRET);
    await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);

    expect(vi.mocked(writeValuationMissSnapshot)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        missingReason: "cox_no_data",
        lookupMake: "TOYOTA",
        lookupModel: "CAMRY V6",
        lookupTrim: "4D SEDAN LE",
      }),
    );
  });

  it("item 72: schedules the retry pass outside the batch on a cox_no_data miss", async () => {
    vi.mocked(getMmrLookupOutcome).mockResolvedValueOnce({
      kind: "miss",
      reason: "cox_no_data",
      method: "year_make_model",
      lookupMake: "TOYOTA",
      lookupModel: "CAMRY V6",
      lookupTrim: "4D SEDAN LE",
    });
    const waitUntilSpy = vi.spyOn(ctx, "waitUntil");
    const sig = await sign(VALID_PAYLOAD, SECRET);
    await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);

    // Inline retry never fired in production because the batch had no headroom
    // left; the pass must be handed to waitUntil so it runs past the deadline.
    expect(vi.mocked(runCoxNoDataRetryPass)).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: [
          expect.objectContaining({
            rejectedModel: "CAMRY V6",
            rejectedStyle: "4D SEDAN LE",
          }),
        ],
      }),
    );
    expect(waitUntilSpy).toHaveBeenCalled();
  });

  it("item 72: does not schedule a retry pass for non-cox_no_data misses", async () => {
    vi.mocked(getMmrLookupOutcome).mockResolvedValueOnce({
      kind: "miss",
      reason: "trim_missing",
      method: "year_make_model",
    });
    const sig = await sign(VALID_PAYLOAD, SECRET);
    await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);

    expect(vi.mocked(runCoxNoDataRetryPass)).not.toHaveBeenCalled();
  });

  it("miss-snapshot persistence failure does not fail ingest", async () => {
    vi.mocked(getMmrLookupOutcome).mockResolvedValueOnce({ kind: "miss", reason: "cox_no_data", method: "vin" });
    vi.mocked(writeValuationMissSnapshot).mockRejectedValueOnce(new Error("db constraint"));
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
  });

  it("item 57 §6: passes a precomputed llmResolution (from the batch prefetch) into getMmrLookupOutcome for a no-VIN YMM item", async () => {
    vi.mocked(getMmrLookupOutcome).mockResolvedValueOnce({ kind: "hit", result: WORKER_MMR_RESULT });
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);

    expect(res.status).toBe(200);
    expect(vi.mocked(getMmrLookupOutcome)).toHaveBeenCalledOnce();
    // workerEnv does not set LLM_YMMS_ENABLED, so the prefetched resolution
    // for this item is the flag's own inert fallback — proving the prefetch
    // ran (this item registers for it: no VIN, full YMM from the title) and
    // its result reached getMmrLookupOutcome as the 3rd arg, exactly the
    // shape performMmrCall already treats as "resolve inline instead".
    expect(vi.mocked(getMmrLookupOutcome)).toHaveBeenCalledWith(
      expect.anything(),
      workerEnv,
      { llmResolution: { kind: "fallback", reason: "llm_disabled" } },
    );
  });

  it("direct mode does not call getMmrLookupOutcome and does not write miss snapshots", async () => {
    const sig = await sign(VALID_PAYLOAD, SECRET);
    // env has no MANHEIM_LOOKUP_MODE → treated as "direct"
    await worker.fetch(makeRequest(VALID_PAYLOAD, sig), env, ctx);

    expect(vi.mocked(getMmrLookupOutcome)).not.toHaveBeenCalled();
    expect(vi.mocked(writeValuationMissSnapshot)).not.toHaveBeenCalled();
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
    vi.mocked(getMmrLookupOutcome).mockResolvedValueOnce({ kind: "hit", result: WORKER_YMM_MMR_RESULT });
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
    vi.mocked(getMmrLookupOutcome).mockResolvedValueOnce({ kind: "hit", result: WORKER_MMR_RESULT });
    const sig = await sign(VALID_PAYLOAD, SECRET);
    await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);

    expect(vi.mocked(writeVehicleEnrichment)).not.toHaveBeenCalled();
  });

  it("does not write vehicle_enrichments in direct mode (YMM result without normalization metadata)", async () => {
    // Direct-mode MmrResult has no normalizationConfidence field
    const directYmmResult = { mmrValue: 16_000, confidence: "medium" as const, method: "year_make_model" as const, rawResponse: {} };
    vi.mocked(getMmrLookupOutcome).mockResolvedValueOnce({ kind: "hit", result: directYmmResult });
    const sig = await sign(VALID_PAYLOAD, SECRET);
    // Even with workerEnv, if normalizationConfidence is absent the guard fails
    await worker.fetch(makeRequest(VALID_PAYLOAD, sig), workerEnv, ctx);

    expect(vi.mocked(writeVehicleEnrichment)).not.toHaveBeenCalled();
  });

  it("enrichment write failure does not fail ingest (returns 200) and logs event", async () => {
    vi.mocked(getMmrLookupOutcome).mockResolvedValueOnce({ kind: "hit", result: WORKER_YMM_MMR_RESULT });
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

// ── Deadline-aware truncation ────────────────────────────────────────────────

describe("POST /ingest — deadline-aware truncation", () => {
  // Build a multi-item payload so we can simulate per-item deadline checks.
  function manyItemPayload(n: number): string {
    return JSON.stringify({
      source: "facebook",
      run_id: "run-deadline",
      region: "dallas_tx",
      scraped_at: new Date().toISOString(),
      items: Array.from({ length: n }, (_, i) => ({
        url: `https://fb.com/d/${i}`,
        title: `2020 Toyota Camry SE, ${50 + i}k miles, $${15000 + i}`,
      })),
    });
  }

  it("normal run: completes with status='completed', no truncated/items_skipped in response", async () => {
    const payload = manyItemPayload(3);
    const sig = await sign(payload, SECRET);
    const res = await worker.fetch(makeRequest(payload, sig), env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(3);
    expect(body).not.toHaveProperty("truncated");
    expect(body).not.toHaveProperty("items_skipped");
    // Source-run completion routed through waitUntil with status='completed'
    expect(vi.mocked(completeSourceRunSafe)).toHaveBeenCalledOnce();
    const [, , completion] = vi.mocked(completeSourceRunSafe).mock.calls[0]!;
    expect(completion.status).toBe("completed");
    expect(completion.error_message).toBeNull();
    expect(completion.processed).toBe(3);
  });

  it("deadline hit mid-loop: breaks, marks remaining as items_skipped, status='truncated'", async () => {
    // After the first item's raw insert, jump the clock past the deadline so
    // the next loop iteration trips. The deadline is computed once at loop
    // entry from real Date.now(); the per-item advancement we apply later
    // does not affect that initial computation, which is the point.
    let advanced = false;
    vi.mocked(insertRawListing).mockImplementation(async () => {
      if (!advanced) {
        advanced = true;
        const futureNow = Date.now() + 60_000;
        vi.spyOn(Date, "now").mockReturnValue(futureNow);
      }
      return { id: "raw-uuid" };
    });

    const payload = manyItemPayload(5);
    const sig = await sign(payload, SECRET);
    const res = await worker.fetch(makeRequest(payload, sig), env, ctx);

    vi.spyOn(Date, "now").mockRestore();

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.truncated).toBe(true);
    expect(body.items_skipped).toBeGreaterThan(0);
    // Items skipped should NOT be counted as rejected.
    expect((body.processed as number) + (body.rejected as number) + (body.items_skipped as number)).toBe(5);

    expect(vi.mocked(completeSourceRunSafe)).toHaveBeenCalledOnce();
    const [, , completion] = vi.mocked(completeSourceRunSafe).mock.calls[0]!;
    expect(completion.status).toBe("truncated");
    expect(completion.error_message).toMatch(/^batch_truncated:\d+_items_skipped$/);
  });

  it("truncated counts: items_skipped is exactly items.length - itemIndex at break", async () => {
    // Same advancement pattern, but verify the arithmetic: 1 processed +
    // 4 skipped = 5 total; rejected stays 0; items_skipped reflects the
    // un-iterated tail, not adapter rejections.
    let advanced = false;
    vi.mocked(insertRawListing).mockImplementation(async () => {
      if (!advanced) {
        advanced = true;
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);
      }
      return { id: "raw-uuid" };
    });

    const payload = manyItemPayload(5);
    const sig = await sign(payload, SECRET);
    const res = await worker.fetch(makeRequest(payload, sig), env, ctx);

    vi.spyOn(Date, "now").mockRestore();

    const body = await res.json() as Record<string, unknown>;
    expect(body.processed).toBe(1);
    expect(body.rejected).toBe(0);
    expect(body.items_skipped).toBe(4);
  });

  it("completeSourceRunSafe is invoked via execCtx.waitUntil", async () => {
    const waitUntilSpy = vi.spyOn(ctx, "waitUntil");
    const sig = await sign(VALID_PAYLOAD, SECRET);
    await worker.fetch(makeRequest(VALID_PAYLOAD, sig), env, ctx);
    expect(waitUntilSpy).toHaveBeenCalled();
    expect(vi.mocked(completeSourceRunSafe)).toHaveBeenCalledOnce();
  });

  it("response shape: no truncated/items_skipped fields when deadline is not hit", async () => {
    const sig = await sign(VALID_PAYLOAD, SECRET);
    const res = await worker.fetch(makeRequest(VALID_PAYLOAD, sig), env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty("truncated");
    expect(body).not.toHaveProperty("items_skipped");
  });
});
