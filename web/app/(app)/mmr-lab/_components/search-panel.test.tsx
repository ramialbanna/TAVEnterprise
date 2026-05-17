import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchPanel } from "./search-panel";

describe("SearchPanel", () => {
  it("VIN submit fires only for an 11-17 char VIN", () => {
    const onVinSubmit = vi.fn();
    render(
      <SearchPanel onVinSubmit={onVinSubmit} onIdentityChange={vi.fn()} vinPending={false} />,
    );
    const vin = screen.getByPlaceholderText(/enter vin/i);
    fireEvent.change(vin, { target: { value: "SHORT" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(onVinSubmit).not.toHaveBeenCalled();
    fireEvent.change(vin, { target: { value: "1FT7W2BT4KED81759" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(onVinSubmit).toHaveBeenCalledWith("1FT7W2BT4KED81759");
  });

  it("Make disabled until Year, Model until Make, Style until Model", () => {
    render(
      <SearchPanel onVinSubmit={vi.fn()} onIdentityChange={vi.fn()} vinPending={false} />,
    );
    expect(screen.getByLabelText(/make/i)).toBeDisabled();
    expect(screen.getByLabelText(/model/i)).toBeDisabled();
    expect(screen.getByLabelText(/style/i)).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/year/i), { target: { value: "2026" } });
    expect(screen.getByLabelText(/make/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/model/i)).toBeDisabled();
  });

  it("full Y/M/M/S selection emits identity and fires NO network call", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const onIdentityChange = vi.fn();
    render(
      <SearchPanel
        onVinSubmit={vi.fn()}
        onIdentityChange={onIdentityChange}
        vinPending={false}
      />,
    );
    fireEvent.change(screen.getByLabelText(/year/i), { target: { value: "2026" } });
    fireEvent.change(screen.getByLabelText(/make/i), { target: { value: "CADILLAC" } });
    fireEvent.change(screen.getByLabelText(/model/i), { target: { value: "ESCALADE IQ" } });
    fireEvent.change(screen.getByLabelText(/style/i), { target: { value: "4D SUV SPORT" } });
    expect(onIdentityChange).toHaveBeenLastCalledWith({
      year: 2026,
      make: "CADILLAC",
      model: "ESCALADE IQ",
      style: "4D SUV SPORT",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("changing Year clears make/model/style", () => {
    const onIdentityChange = vi.fn();
    render(
      <SearchPanel
        onVinSubmit={vi.fn()}
        onIdentityChange={onIdentityChange}
        vinPending={false}
      />,
    );
    fireEvent.change(screen.getByLabelText(/year/i), { target: { value: "2026" } });
    fireEvent.change(screen.getByLabelText(/make/i), { target: { value: "CADILLAC" } });
    fireEvent.change(screen.getByLabelText(/year/i), { target: { value: "2019" } });
    expect(onIdentityChange).toHaveBeenLastCalledWith({ year: 2019 });
  });
});
