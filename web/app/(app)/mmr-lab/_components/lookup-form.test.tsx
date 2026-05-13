import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  EXAMPLE_MILEAGE,
  EXAMPLE_VIN,
  EXAMPLE_YEAR,
  LookupForm,
} from "./lookup-form";

describe("LookupForm", () => {
  it("does NOT submit when the VIN is invalid (too short)", async () => {
    const onLookup = vi.fn();
    const user = userEvent.setup();
    render(<LookupForm onLookup={onLookup} />);
    await user.type(screen.getByLabelText(/^VIN/i), "ABC123");
    await user.click(screen.getByRole("button", { name: /look up mmr/i }));
    expect(onLookup).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/VIN must be 11–17 characters/);
  });

  it("rejects VINs that contain non-A-Z/0-9 characters (no I/O/Q is not checked at v1 — but a hyphen is)", async () => {
    const onLookup = vi.fn();
    const user = userEvent.setup();
    render(<LookupForm onLookup={onLookup} />);
    await user.type(screen.getByLabelText(/^VIN/i), "1FT8W3BT-SEC27066");
    await user.click(screen.getByRole("button", { name: /look up mmr/i }));
    expect(onLookup).not.toHaveBeenCalled();
  });

  it("Fill example populates VIN, mileage, and year with the documented sandbox values", () => {
    const onLookup = vi.fn();
    render(<LookupForm onLookup={onLookup} />);
    fireEvent.click(screen.getByRole("button", { name: /fill example/i }));
    expect((screen.getByLabelText(/^VIN/i) as HTMLInputElement).value).toBe(EXAMPLE_VIN);
    expect((screen.getByLabelText(/^Mileage$/i) as HTMLInputElement).value).toBe(
      String(EXAMPLE_MILEAGE),
    );
    expect((screen.getByLabelText(/^Year$/i) as HTMLInputElement).value).toBe(
      String(EXAMPLE_YEAR),
    );
  });

  it("submits only { vin, year, mileage } to the API and surfaces asking price separately (NOT in the API payload)", async () => {
    const onLookup = vi.fn();
    const user = userEvent.setup();
    render(<LookupForm onLookup={onLookup} />);

    await user.type(screen.getByLabelText(/^VIN/i), EXAMPLE_VIN);
    await user.type(screen.getByLabelText(/^Mileage$/i), String(EXAMPLE_MILEAGE));
    await user.type(screen.getByLabelText(/^Year$/i), String(EXAMPLE_YEAR));
    await user.type(screen.getByLabelText(/Asking price/i), "62000");
    await user.type(screen.getByLabelText(/^Source/i), "facebook");
    await user.type(screen.getByLabelText(/^Notes/i), "test note");
    await user.click(screen.getByRole("button", { name: /look up mmr/i }));

    expect(onLookup).toHaveBeenCalledTimes(1);
    const submit = onLookup.mock.calls[0]?.[0];
    expect(submit.api).toEqual({ vin: EXAMPLE_VIN, year: EXAMPLE_YEAR, mileage: EXAMPLE_MILEAGE });
    expect(submit.askingPrice).toBe(62000);
    // Belt-and-suspenders: the API payload must not carry any client-only field.
    expect(submit.api).not.toHaveProperty("askingPrice");
    expect(submit.api).not.toHaveProperty("source");
    expect(submit.api).not.toHaveProperty("notes");
    expect(submit.api).not.toHaveProperty("make");
    expect(submit.api).not.toHaveProperty("model");
    expect(submit.api).not.toHaveProperty("trim");
  });

  it("trims + upper-cases VINs before submitting", async () => {
    const onLookup = vi.fn();
    const user = userEvent.setup();
    render(<LookupForm onLookup={onLookup} />);
    await user.type(screen.getByLabelText(/^VIN/i), "  1ft8w3bt1sec27066  ");
    await user.click(screen.getByRole("button", { name: /look up mmr/i }));
    expect(onLookup).toHaveBeenCalledWith({
      api: { vin: EXAMPLE_VIN },
      askingPrice: null,
      make: null,
      model: null,
      trim: null,
    });
  });

  it("rejects mileage outside [0, 2_000_000]", async () => {
    const onLookup = vi.fn();
    const user = userEvent.setup();
    render(<LookupForm onLookup={onLookup} />);
    await user.type(screen.getByLabelText(/^VIN/i), EXAMPLE_VIN);
    await user.type(screen.getByLabelText(/^Mileage$/i), "3000000");
    await user.click(screen.getByRole("button", { name: /look up mmr/i }));
    expect(onLookup).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Mileage must be 0–2,000,000/);
  });

  it("rejects year outside [1900, 2100]", async () => {
    const onLookup = vi.fn();
    const user = userEvent.setup();
    render(<LookupForm onLookup={onLookup} />);
    await user.type(screen.getByLabelText(/^VIN/i), EXAMPLE_VIN);
    await user.type(screen.getByLabelText(/^Year$/i), "1850");
    await user.click(screen.getByRole("button", { name: /look up mmr/i }));
    expect(onLookup).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Year must be 1900–2100/);
  });
});
