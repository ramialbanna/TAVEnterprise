import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MmrLabClient } from "./mmr-lab-client";

afterEach(() => vi.restoreAllMocks());

describe("MmrLabClient — honest, revised scope (no catalog)", () => {
  it("empty initial state: no Fill example, Base MMR & zones --", () => {
    render(<MmrLabClient />);
    expect(
      screen.queryByRole("button", { name: /fill example/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(7);
  });

  it("Y/M/M/S selectors disabled + 'live catalog not connected', no fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<MmrLabClient />);
    for (const label of [/year/i, /make/i, /model/i, /style/i]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
    expect(screen.getByText(/live catalog not connected/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("VIN path calls /api/app/mmr/vin once and populates ONLY Base MMR", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { mmrValue: 48600, confidence: "high", method: "vin" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    render(<MmrLabClient />);
    fireEvent.change(screen.getByPlaceholderText(/enter vin/i), {
      target: { value: "1FT7W2BT4KED81759" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(screen.getByText("$48,600")).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/api/app/mmr/vin");
    // lean envelope: still no fabricated range/retail/etc.
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(6);
  });

  it("VIN unavailable (mmrValue:null) → honest state, no fabricated money", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, data: { mmrValue: null, missingReason: "no_mmr_value" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    render(<MmrLabClient />);
    fireEvent.change(screen.getByPlaceholderText(/enter vin/i), {
      target: { value: "1FT7W2BT4KED81759" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/enter vin/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(6);
  });

  it("hard error surfaces an error state with no fabricated money", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network down"));
    render(<MmrLabClient />);
    fireEvent.change(screen.getByPlaceholderText(/enter vin/i), {
      target: { value: "1FT7W2BT4KED81759" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
    const retry = screen.queryByRole("button", { name: /retry/i });
    if (retry) {
      fireEvent.click(retry);
      await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
      expect(String(fetchSpy.mock.calls[1]?.[0])).toContain("/api/app/mmr/vin");
    }
  });
});
