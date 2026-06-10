import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MmrLabClient } from "./mmr-lab-client";

function renderClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MmrLabClient />
    </QueryClientProvider>,
  );
}

function ok(data: unknown) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function maxbuyEvaluatePayload(askingPrice?: number) {
  const dealFit = askingPrice !== undefined && askingPrice > 0;
  const recommendedMaxBuy = 21_749;
  return {
    contract_version: "1.0.0",
    recommendation_id: "00000000-0000-4000-8000-000000000001",
    vehicle: {
      vin: null,
      year: 2026,
      make: "TESLA",
      model: "MODEL Y AWD",
      trim: "4D SUV PERFORMANCE",
      mileage: 70740,
      mileage_estimated: false,
    },
    mmr: {
      value: 23900,
      method: "ymm",
      source: "cox",
      cache_age_seconds: 0,
      missing_reason: null,
      observed_at: "2026-06-01T00:00:00.000Z",
    },
    tav_historical: {
      n_units: 38,
      avg_buy: 21349,
      avg_sale: 24349,
      avg_gross: 910,
      avg_recon: 500,
      avg_days_to_sale: 19,
      outcome_distribution: {},
    },
    economics: {
      expected_sale_price: 24349,
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

function mockCatalog(fetchSpy = vi.spyOn(globalThis, "fetch")) {
  fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/app/mmr/catalog/years")) {
      return ok({ items: ["2026"], catalogState: "connected", cached: false, reason: null });
    }
    if (url.includes("/api/app/mmr/catalog/makes")) {
      return ok({ items: ["TESLA"], catalogState: "connected", cached: false, reason: null });
    }
    if (url.includes("/api/app/mmr/catalog/models")) {
      return ok({ items: ["MODEL Y AWD"], catalogState: "connected", cached: false, reason: null });
    }
    if (url.includes("/api/app/mmr/catalog/styles")) {
      return ok({ items: ["4D SUV PERFORMANCE"], catalogState: "connected", cached: false, reason: null });
    }
    if (url.includes("/api/app/mmr/ymm") && init?.method === "POST") {
      return ok({
        mmrValue: 23900,
        confidence: "medium",
        method: "year_make_model",
        mileageUsed: 70740,
        avgOdometer: 70740,
        avgCondition: 3.9,
        rangeLow: 22700,
        rangeHigh: 25100,
        adjustedMmr: 23900,
        retailValue: 26600,
        retailRangeLow: 23500,
        retailRangeHigh: 29800,
      });
    }
    if (url.includes("/api/app/mmr/vin") && init?.method === "POST") {
      return ok({ mmrValue: 48600, confidence: "high", method: "vin" });
    }
    if (url.includes("/api/app/maxbuy/evaluate") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { asking_price?: number };
      return ok(maxbuyEvaluatePayload(body.asking_price));
    }
    return ok({});
  });
  return fetchSpy;
}

afterEach(() => vi.restoreAllMocks());

describe("MmrLabClient — live catalog + honest valuation", () => {
  it("empty initial state has no Fill example and fetches only the catalog years", async () => {
    const fetchSpy = mockCatalog();
    renderClient();
    expect(
      screen.queryByRole("button", { name: /fill example/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(7);
    expect(screen.getByText(/search to run max buy/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "2026" })).toBeInTheDocument(),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/api/app/mmr/catalog/years");
  });

  it("catalog cascade + mileage posts YMM and MaxBuy evaluate in parallel", async () => {
    const fetchSpy = mockCatalog();
    renderClient();

    await waitFor(() => expect(screen.getByRole("option", { name: "2026" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/year/i), { target: { value: "2026" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "TESLA" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/make/i), { target: { value: "TESLA" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "MODEL Y AWD" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/model/i), { target: { value: "MODEL Y AWD" } });
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "4D SUV PERFORMANCE" })).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText(/style/i), { target: { value: "4D SUV PERFORMANCE" } });
    fireEvent.change(screen.getByLabelText(/mileage/i), { target: { value: "70740" } });
    fireEvent.click(screen.getByRole("button", { name: /value selected vehicle/i }));

    await waitFor(() => expect(screen.getAllByText("$23,900").length).toBeGreaterThanOrEqual(1));
    expect(screen.getByText("2026 TESLA MODEL Y AWD 4D SUV PERFORMANCE")).toBeInTheDocument();
    expect(screen.getByText("$22,700 - $25,100")).toBeInTheDocument();
    expect(screen.getByText("$26,600")).toBeInTheDocument();
    expect(screen.getByText("$23,500 - $29,800")).toBeInTheDocument();
    expect(fetchSpy.mock.calls.some((call) => String(call[0]).includes("/api/app/mmr/ymm"))).toBe(true);
    expect(
      fetchSpy.mock.calls.some((call) => String(call[0]).includes("/api/app/maxbuy/evaluate")),
    ).toBe(true);
    await waitFor(() => expect(screen.getByText(/max buy evaluation/i)).toBeInTheDocument());
    expect(screen.getByText("Vehicle ceiling")).toBeInTheDocument();
    expect(screen.getByText("$21,749")).toBeInTheDocument();
  });

  it("lane ask price switches MaxBuy to deal_fit verdict after search", async () => {
    mockCatalog();
    renderClient();

    fireEvent.change(screen.getByLabelText(/lane ask price/i), { target: { value: "21000" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "2026" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/year/i), { target: { value: "2026" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "TESLA" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/make/i), { target: { value: "TESLA" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "MODEL Y AWD" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/model/i), { target: { value: "MODEL Y AWD" } });
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "4D SUV PERFORMANCE" })).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText(/style/i), { target: { value: "4D SUV PERFORMANCE" } });
    fireEvent.change(screen.getByLabelText(/mileage/i), { target: { value: "70740" } });
    fireEvent.click(screen.getByRole("button", { name: /value selected vehicle/i }));

    await waitFor(() => expect(screen.getByText(/^Buy$/i)).toBeInTheDocument());
    expect(screen.getByText(/under ask/i)).toBeInTheDocument();
  });

  it("updating lane ask after search re-runs live MaxBuy evaluate", async () => {
    mockCatalog();
    renderClient();

    await waitFor(() => expect(screen.getByRole("option", { name: "2026" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/year/i), { target: { value: "2026" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "TESLA" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/make/i), { target: { value: "TESLA" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "MODEL Y AWD" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/model/i), { target: { value: "MODEL Y AWD" } });
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "4D SUV PERFORMANCE" })).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText(/style/i), { target: { value: "4D SUV PERFORMANCE" } });
    fireEvent.change(screen.getByLabelText(/mileage/i), { target: { value: "70740" } });
    fireEvent.click(screen.getByRole("button", { name: /value selected vehicle/i }));

    await waitFor(() => expect(screen.getByText("Vehicle ceiling")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/lane ask price/i), { target: { value: "21000" } });
    await waitFor(() => expect(screen.getByText(/^Buy$/i)).toBeInTheDocument());
  });

  it("MMR failure does not block MaxBuy zone from showing results", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/app/mmr/catalog/years")) {
        return ok({ items: ["2026"], catalogState: "connected", cached: false, reason: null });
      }
      if (url.includes("/api/app/mmr/vin") && init?.method === "POST") {
        return new Response(JSON.stringify({ ok: false, error: "bad_vin" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/app/maxbuy/evaluate") && init?.method === "POST") {
        return ok(maxbuyEvaluatePayload());
      }
      return ok({});
    });

    renderClient();
    fireEvent.change(screen.getByPlaceholderText(/enter vin/i), {
      target: { value: "1FT7W2BT4KED81759" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => expect(screen.getByText("$21,749")).toBeInTheDocument());
    expect(screen.getByText("Vehicle ceiling")).toBeInTheDocument();
  });

  it("catalog not connected preserves honest disabled selectors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      ok({ items: [], catalogState: "not_connected", cached: false, reason: "not_provisioned" }),
    );
    renderClient();
    await waitFor(() => expect(screen.getByText(/not_provisioned/i)).toBeInTheDocument());
    for (const label of [/year/i, /make/i, /model/i, /style/i]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
  });

  it("VIN path still calls /api/app/mmr/vin and populates Base MMR", async () => {
    const fetchSpy = mockCatalog();
    renderClient();
    fireEvent.change(screen.getByPlaceholderText(/enter vin/i), {
      target: { value: "1FT7W2BT4KED81759" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(screen.getAllByText("$48,600").length).toBeGreaterThanOrEqual(1));
    expect(fetchSpy.mock.calls.some((call) => String(call[0]).includes("/api/app/mmr/vin"))).toBe(true);
    expect(
      fetchSpy.mock.calls.some((call) => String(call[0]).includes("/api/app/maxbuy/evaluate")),
    ).toBe(true);
  });

  it("VIN unavailable (mmrValue:null) → honest state, no fabricated money", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/app/mmr/catalog/years")) {
        return ok({ items: ["2026"], catalogState: "connected", cached: false, reason: null });
      }
      if (url.includes("/api/app/mmr/vin")) {
        return ok({ mmrValue: null, missingReason: "no_mmr_value" });
      }
      if (url.includes("/api/app/maxbuy/evaluate") && init?.method === "POST") {
        return ok(maxbuyEvaluatePayload());
      }
      return ok({});
    });
    renderClient();
    fireEvent.change(screen.getByPlaceholderText(/enter vin/i), {
      target: { value: "1FT7W2BT4KED81759" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(screen.getByText(/no MMR value was returned/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("$21,749")).toBeInTheDocument());
  });
});
