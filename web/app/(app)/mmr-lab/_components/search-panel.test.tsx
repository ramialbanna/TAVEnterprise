import { render, screen, fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchPanel } from "./search-panel";

afterEach(() => vi.restoreAllMocks());

describe("SearchPanel (revised: disabled Y/M/M/S — live catalog not connected)", () => {
  it("VIN submit fires only for an 11-17 char VIN", () => {
    const onVinSubmit = vi.fn();
    render(<SearchPanel onVinSubmit={onVinSubmit} vinPending={false} />);
    const vin = screen.getByPlaceholderText(/enter vin/i);
    fireEvent.change(vin, { target: { value: "SHORT" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(onVinSubmit).not.toHaveBeenCalled();
    fireEvent.change(vin, { target: { value: "1FT7W2BT4KED81759" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(onVinSubmit).toHaveBeenCalledWith("1FT7W2BT4KED81759");
  });

  it("Year/Make/Model/Style selectors are visible but disabled", () => {
    render(<SearchPanel onVinSubmit={vi.fn()} vinPending={false} />);
    for (const label of [/year/i, /make/i, /model/i, /style/i]) {
      const sel = screen.getByLabelText(label);
      expect(sel).toBeInTheDocument();
      expect(sel).toBeDisabled();
    }
  });

  it("each selector has ONLY a placeholder option — no catalog values leaked", () => {
    render(<SearchPanel onVinSubmit={vi.fn()} vinPending={false} />);
    for (const label of [/year/i, /make/i, /model/i, /style/i]) {
      const sel = screen.getByLabelText(label);
      expect(within(sel).getAllByRole("option")).toHaveLength(1);
    }
  });

  it("VIN length boundaries are inclusive [11,17]", () => {
    const onVinSubmit = vi.fn();
    render(<SearchPanel onVinSubmit={onVinSubmit} vinPending={false} />);
    const vin = screen.getByPlaceholderText(/enter vin/i);
    const search = () =>
      fireEvent.click(screen.getByRole("button", { name: /search/i }));

    fireEvent.change(vin, { target: { value: "X".repeat(10) } });
    search();
    expect(onVinSubmit).not.toHaveBeenCalled();

    fireEvent.change(vin, { target: { value: "X".repeat(11) } });
    search();
    expect(onVinSubmit).toHaveBeenLastCalledWith("X".repeat(11));

    fireEvent.change(vin, { target: { value: "X".repeat(17) } });
    search();
    expect(onVinSubmit).toHaveBeenLastCalledWith("X".repeat(17));

    onVinSubmit.mockClear();
    fireEvent.change(vin, { target: { value: "X".repeat(18) } });
    search();
    expect(onVinSubmit).not.toHaveBeenCalled();
  });

  it("explains the live catalog / API access is not connected yet", () => {
    render(<SearchPanel onVinSubmit={vi.fn()} vinPending={false} />);
    expect(screen.getByText(/live catalog not connected/i)).toBeInTheDocument();
  });

  it("performs NO network call on mount or any interaction", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<SearchPanel onVinSubmit={vi.fn()} vinPending={false} />);
    const vin = screen.getByPlaceholderText(/enter vin/i);
    fireEvent.change(vin, { target: { value: "TOO-SHORT" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    // disabled selectors cannot be changed; nothing here may touch the network
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
