import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { OpportunityDetail } from "@/lib/app-api/schemas";

import { OpportunityValuationBlock } from "./opportunity-valuation-block";

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

function makeDetail(overrides: Partial<OpportunityDetail> = {}): OpportunityDetail {
  return {
    id: "listing-1",
    type: "lead",
    badges: ["First seen"],
    source: "facebook",
    region: "dallas_tx",
    sourceRunId: null,
    normalizedListingId: "listing-1",
    vehicleCandidateId: null,
    leadId: "lead-1",
    title: "2019 Honda Accord",
    year: 2019,
    make: "Honda",
    model: "Accord",
    style: "EX",
    vin: "1HGBH41JXMN109123",
    price: 12000,
    mmrValue: 15000,
    spread: 3000,
    finalScore: 82,
    grade: "excellent",
    status: "new",
    submittedBy: "Jane Buyer",
    assignedTo: null,
    assignedCloserName: "Closer One",
    claimedBy: null,
    claimedAt: null,
    claimExpiresAt: null,
    lastEvaluatedBy: null,
    lastEvaluatedAt: null,
    firstSeenAt: "2026-06-01T10:00:00.000Z",
    lastSeenAt: "2026-06-02T10:00:00.000Z",
    seenCount: 3,
    listingUrl: "https://example.com/listing",
    entryMethod: "manual",
    estimateFlags: { mmr: false, mileage: false, style: false },
    reasonCodes: [],
    valuationMissingReason: null,
    scoreComponents: null,
    candidateListingCount: null,
    mileage: 32000,
    actions: [],
    ...overrides,
  };
}

function ok(data: unknown) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function maxbuyPayload(askingPrice?: number) {
  const dealFit = askingPrice !== undefined && askingPrice > 0;
  const recommendedMaxBuy = 21_749;
  return {
    contract_version: "1.0.0",
    recommendation_id: "00000000-0000-4000-8000-000000000001",
    vehicle: {
      vin: null,
      year: 2019,
      make: "HONDA",
      model: "ACCORD",
      trim: "EX",
      mileage: 32000,
      mileage_estimated: false,
    },
    mmr: {
      value: 15000,
      method: "vin",
      source: "cox",
      cache_age_seconds: 0,
      missing_reason: null,
      observed_at: "2026-06-01T00:00:00.000Z",
    },
    tav_historical: {
      n_units: 12,
      avg_buy: 14000,
      avg_sale: 16500,
      avg_gross: 800,
      avg_recon: 500,
      avg_days_to_sale: 19,
      outcome_distribution: {},
    },
    economics: {
      expected_sale_price: 16500,
      expected_transport: 425,
      expected_expenses: 780,
      expected_net_gross: dealFit ? 820 : null,
    },
    verdict: {
      display_state: dealFit ? "deal_fit" : "vehicle_fit",
      verdict: dealFit ? "BUY" : null,
      recommended_max_buy: recommendedMaxBuy,
      delta_to_ask: dealFit && askingPrice ? recommendedMaxBuy - askingPrice : null,
      data_strength: "medium",
      reason_codes: dealFit ? ["segment_benchmark", "mmr_anchor"] : ["segment_benchmark"],
      estimated_badges: [],
      hard_gate_triggered: null,
    },
    versions: {
      benchmark_version: "bm-2026w22-180d",
      feature_view_version: "fv-v1",
      policy_version: "global-v1",
      scoring_version: "maxbuy-scoring-v1",
      model_artifact_hash: null,
    },
  };
}

function mockFetchForVin() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/api/app/mmr/vin")) {
      return ok({
        mmrValue: 15000,
        confidence: "high",
        method: "vin",
        year: 2019,
        make: "Honda",
        model: "Accord",
        trim: "EX",
        mileageUsed: 32000,
        avgOdometer: 32000,
        avgCondition: 3.9,
        rangeLow: 14000,
        rangeHigh: 16000,
        adjustedMmr: 15000,
        buildOptionsIncluded: true,
        buildOptionsAdjustment: 200,
      });
    }
    if (url.includes("/api/app/maxbuy/evaluate")) {
      return ok(maxbuyPayload(12000));
    }
    return ok({});
  });
}

afterEach(() => vi.restoreAllMocks());

describe("OpportunityValuationBlock", () => {
  it("auto-runs MMR + Max buy on mount when identity is sufficient and no saved verdict", async () => {
    const fetchSpy = mockFetchForVin();
    renderWithClient(<OpportunityValuationBlock opportunity={makeDetail()} />);

    await waitFor(() =>
      expect(screen.getByText("Max buy evaluation")).toBeInTheDocument(),
    );

    expect(screen.getAllByText("$15,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$21,749").length).toBeGreaterThan(0);
    expect(
      fetchSpy.mock.calls.some((c) => String(c[0]).includes("/api/app/mmr/vin")),
    ).toBe(true);
    expect(
      fetchSpy.mock.calls.some((c) =>
        String(c[0]).includes("/api/app/maxbuy/evaluate"),
      ),
    ).toBe(true);
  });

  it("auto-runs MMR on mount when saved verdict exists and shows MMR alongside saved Max buy", async () => {
    const fetchSpy = mockFetchForVin();
    const detail = makeDetail({
      maxbuySummary: {
        recommendationId: "rec-1",
        verdict: "BUY",
        recommendedMaxBuy: 18000,
        dataStrength: "medium",
        evaluatedAt: "2026-06-01T10:00:00.000Z",
      },
    });
    renderWithClient(<OpportunityValuationBlock opportunity={detail} />);

    expect(screen.getByText("Max buy (saved)")).toBeInTheDocument();
    expect(screen.getByText("$18,000")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText("Base MMR")).toBeInTheDocument(),
    );

    expect(screen.getAllByText("$15,000").length).toBeGreaterThan(0);
    expect(
      fetchSpy.mock.calls.some((c) => String(c[0]).includes("/api/app/mmr/vin")),
    ).toBe(true);
    expect(
      fetchSpy.mock.calls.some((c) =>
        String(c[0]).includes("/api/app/maxbuy/evaluate"),
      ),
    ).toBe(false);
  });

  it("runs fresh lookup for both MMR and Max buy when requested", async () => {
    const fetchSpy = mockFetchForVin();
    const detail = makeDetail({
      maxbuySummary: {
        recommendationId: "rec-1",
        verdict: "BUY",
        recommendedMaxBuy: 18000,
        dataStrength: "medium",
        evaluatedAt: "2026-06-01T10:00:00.000Z",
      },
    });
    renderWithClient(<OpportunityValuationBlock opportunity={detail} />);

    await waitFor(() =>
      expect(screen.getByText("Base MMR")).toBeInTheDocument(),
    );

    fetchSpy.mockClear();
    screen.getByRole("button", { name: /run fresh lookup/i }).click();

    await waitFor(() =>
      expect(screen.getByText("Max buy evaluation")).toBeInTheDocument(),
    );

    expect(
      fetchSpy.mock.calls.some((c) => String(c[0]).includes("/api/app/mmr/vin")),
    ).toBe(true);
    expect(
      fetchSpy.mock.calls.some((c) =>
        String(c[0]).includes("/api/app/maxbuy/evaluate"),
      ),
    ).toBe(true);
  });

  it("shows insufficient-identity note when VIN/YMM are missing and no saved verdict", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => ok({}));
    const detail = makeDetail({
      vin: null,
      year: null,
      make: null,
      model: null,
      style: null,
      mileage: null,
      price: null,
      maxbuySummary: undefined,
    });
    renderWithClient(<OpportunityValuationBlock opportunity={detail} />);

    expect(
      screen.getByText(/add a vin or year\/make\/model/i),
    ).toBeInTheDocument();
  });
});
