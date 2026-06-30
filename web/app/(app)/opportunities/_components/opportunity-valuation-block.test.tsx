import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

    await waitFor(() => expect(screen.getByText("MMR")).toBeInTheDocument());

    expect(screen.queryByText(/^high$/i)).toBeNull();
    expect(screen.queryByText(/^medium$/i)).toBeNull();
    expect(screen.queryByText(/^low$/i)).toBeNull();

    await waitFor(() => expect(screen.getByLabelText(/deal grade b/i)).toBeInTheDocument());
    expect(screen.getByText("$21,749")).toBeInTheDocument();
    expect(screen.queryByText("Base MMR")).toBeNull();
    expect(screen.queryByText("Max buy evaluation")).toBeNull();
    expect(
      fetchSpy.mock.calls.some((c) => String(c[0]).includes("/api/app/mmr/vin")),
    ).toBe(true);
    expect(
      fetchSpy.mock.calls.some((c) =>
        String(c[0]).includes("/api/app/maxbuy/evaluate"),
      ),
    ).toBe(true);
  });

  it("auto-runs MMR on mount when saved verdict exists and shows compact cards", async () => {
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

    await waitFor(() => expect(screen.getByLabelText(/deal grade b/i)).toBeInTheDocument());
    expect(screen.getByText("$18,000")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("MMR")).toBeInTheDocument());

    expect(screen.queryByText(/^high$/i)).toBeNull();
    expect(screen.queryByText(/^medium$/i)).toBeNull();
    expect(screen.queryByText(/^low$/i)).toBeNull();

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

  it("auto-runs MMR without odometer for saved Y/M/M/S", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/app/mmr/ymm")) {
        return ok({
          mmrValue: 14000,
          confidence: "medium",
          method: "year_make_model",
          year: 2019,
          make: "Honda",
          model: "Accord",
          trim: "EX",
          adjustedMmr: 14000,
          rangeLow: 13000,
          rangeHigh: 15000,
        });
      }
      return ok({});
    });

    renderWithClient(
      <OpportunityValuationBlock
        opportunity={makeDetail({
          vin: null,
          mileage: null,
          price: null,
        })}
      />,
    );

    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some((c) => String(c[0]).includes("/api/app/mmr/ymm")),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.getByText("MMR")).toBeInTheDocument());

    expect(screen.queryByText(/^high$/i)).toBeNull();
    expect(screen.queryByText(/^medium$/i)).toBeNull();
    expect(screen.queryByText(/^low$/i)).toBeNull();
    expect(
      screen.getByText(/add mileage and asking price to run max buy on this deal/i),
    ).toBeInTheDocument();
    expect(
      fetchSpy.mock.calls.some((c) =>
        String(c[0]).includes("/api/app/maxbuy/evaluate"),
      ),
    ).toBe(false);
  });

  it("expands MMR adjustments on Adjust click", async () => {
    mockFetchForVin();
    const user = userEvent.setup();
    renderWithClient(<OpportunityValuationBlock opportunity={makeDetail()} />);

    await waitFor(() => expect(screen.getByText("MMR")).toBeInTheDocument());

    expect(screen.queryByText(/^high$/i)).toBeNull();
    expect(screen.queryByText(/^medium$/i)).toBeNull();
    expect(screen.queryByText(/^low$/i)).toBeNull();
    expect(screen.queryByLabelText("Enter ODO (mi)")).toBeNull();

    await user.click(screen.getByRole("button", { name: /^adjust$/i }));

    expect(screen.getByLabelText("Enter ODO (mi)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hide adjustments/i })).toBeInTheDocument();
  });

  it("shows max buy unavailable state in summary card", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/app/mmr/vin")) {
        return ok({
          mmrValue: 15000,
          confidence: "high",
          method: "vin",
          adjustedMmr: 15000,
          rangeLow: 14000,
          rangeHigh: 16000,
        });
      }
      if (url.includes("/api/app/maxbuy/evaluate")) {
        return new Response(
          JSON.stringify({ ok: false, error: "maxbuy_disabled" }),
          { status: 503, headers: { "content-type": "application/json" } },
        );
      }
      return ok({});
    });

    renderWithClient(<OpportunityValuationBlock opportunity={makeDetail()} />);

    await waitFor(() =>
      expect(screen.getByText(/max buy evaluate is disabled in this environment/i)).toBeInTheDocument(),
    );
  });

  it("refresh valuation runs both MMR and Max buy when saved verdict exists", async () => {
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

    await waitFor(() => expect(screen.getByText("MMR")).toBeInTheDocument());

    expect(screen.queryByText(/^high$/i)).toBeNull();
    expect(screen.queryByText(/^medium$/i)).toBeNull();
    expect(screen.queryByText(/^low$/i)).toBeNull();

    fetchSpy.mockClear();
    screen.getByRole("button", { name: /refresh valuation/i }).click();

    await waitFor(() => expect(screen.getByText("$21,749")).toBeInTheDocument());
    expect(screen.getByText(/live evaluation/i)).toBeInTheDocument();
    expect(screen.queryByText(/as of/i)).toBeNull();
    expect(screen.queryByText(/^high$/i)).toBeNull();
    expect(screen.queryByText(/^medium$/i)).toBeNull();
    expect(screen.queryByText(/^low$/i)).toBeNull();

    const mmrCall = fetchSpy.mock.calls.find((c) =>
      String(c[0]).includes("/api/app/mmr/vin"),
    );
    expect(mmrCall).toBeTruthy();
    expect(JSON.parse(String(mmrCall![1]?.body))).toMatchObject({
      refresh_valuation: true,
    });

    expect(
      fetchSpy.mock.calls.some((c) =>
        String(c[0]).includes("/api/app/maxbuy/evaluate"),
      ),
    ).toBe(true);
  });

  it("shows F grade for saved pass with low segment data", async () => {
    mockFetchForVin();
    renderWithClient(
      <OpportunityValuationBlock
        opportunity={makeDetail({
          maxbuySummary: {
            recommendationId: "rec-1",
            verdict: "PASS",
            recommendedMaxBuy: 28652,
            dataStrength: "low",
            evaluatedAt: "2026-06-26T20:25:00.000Z",
          },
        })}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText(/deal grade f/i)).toBeInTheDocument());
    expect(screen.queryByText("Data strength")).toBeNull();
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
      screen.getByText(/add vehicle identity to run mmr and max buy/i),
    ).toBeInTheDocument();
  });
});
