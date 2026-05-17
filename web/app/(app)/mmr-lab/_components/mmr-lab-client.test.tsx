import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MmrLabClient } from "./mmr-lab-client";

function ok(data: unknown) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
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
    return ok({});
  });
  return fetchSpy;
}

afterEach(() => vi.restoreAllMocks());

describe("MmrLabClient — live catalog + honest valuation", () => {
  it("empty initial state has no Fill example and fetches only the catalog years", async () => {
    const fetchSpy = mockCatalog();
    render(<MmrLabClient />);
    expect(
      screen.queryByRole("button", { name: /fill example/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(7);
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "2026" })).toBeInTheDocument(),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/api/app/mmr/catalog/years");
  });

  it("catalog cascade + mileage posts YMM and renders Manheim fields", async () => {
    const fetchSpy = mockCatalog();
    render(<MmrLabClient />);

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
  });

  it("catalog not connected preserves honest disabled selectors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      ok({ items: [], catalogState: "not_connected", cached: false, reason: "not_provisioned" }),
    );
    render(<MmrLabClient />);
    await waitFor(() => expect(screen.getByText(/not_provisioned/i)).toBeInTheDocument());
    for (const label of [/year/i, /make/i, /model/i, /style/i]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
  });

  it("VIN path still calls /api/app/mmr/vin and populates Base MMR", async () => {
    const fetchSpy = mockCatalog();
    render(<MmrLabClient />);
    fireEvent.change(screen.getByPlaceholderText(/enter vin/i), {
      target: { value: "1FT7W2BT4KED81759" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(screen.getByText("$48,600")).toBeInTheDocument());
    expect(fetchSpy.mock.calls.some((call) => String(call[0]).includes("/api/app/mmr/vin"))).toBe(true);
  });

  it("VIN unavailable (mmrValue:null) → honest state, no fabricated money", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/app/mmr/catalog/years")) {
        return ok({ items: ["2026"], catalogState: "connected", cached: false, reason: null });
      }
      if (url.includes("/api/app/mmr/vin")) {
        return ok({ mmrValue: null, missingReason: "no_mmr_value" });
      }
      return ok({});
    });
    render(<MmrLabClient />);
    fireEvent.change(screen.getByPlaceholderText(/enter vin/i), {
      target: { value: "1FT7W2BT4KED81759" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(screen.getByText(/no MMR value was returned/i)).toBeInTheDocument());
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
  });
});
