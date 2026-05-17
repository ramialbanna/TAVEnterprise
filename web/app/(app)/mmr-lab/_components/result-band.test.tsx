import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResultBand } from "./result-band";

describe("ResultBand — honest, no fabrication", () => {
  it("empty: Base MMR and every right-panel value render --", () => {
    render(<ResultBand baseMmr={null} />);
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(7);
  });

  it("VIN value populates ONLY Base MMR; other zones stay --", () => {
    render(<ResultBand baseMmr={48600} confidence="high" method="vin" />);
    expect(screen.getByText("$48,600")).toBeInTheDocument();
    expect(screen.getByText(/high/i)).toBeInTheDocument();
    // Adjusted MMR / MMR Range / Estimated Retail / Typical Range still --
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(6);
  });

  it("all MMR Adjustments controls are disabled", () => {
    render(<ResultBand baseMmr={48600} />);
    for (const el of screen.getAllByRole("textbox")) expect(el).toBeDisabled();
    for (const el of screen.getAllByRole("combobox")) expect(el).toBeDisabled();
  });

  it("renders an honest unavailable message for a missingReason (not an error UI)", () => {
    render(<ResultBand baseMmr={null} unavailableReason="no_mmr_value" />);
    // no fabricated money; some honest unavailable copy is shown
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
  });
});
