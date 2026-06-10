import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResultBand } from "./result-band";

describe("ResultBand — honest, no fabrication", () => {
  it("idle: Base MMR and every right-panel value render --", () => {
    render(<ResultBand baseMmr={null} />);
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(7);
  });

  it("VIN value populates ONLY Base MMR; other zones stay --", () => {
    render(<ResultBand phase="ready" baseMmr={48600} confidence="high" method="vin" />);
    expect(screen.getByText("$48,600")).toBeInTheDocument();
    expect(screen.getByText(/high/i)).toBeInTheDocument();
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(6);
  });

  it("loading shows skeleton instead of values", () => {
    render(<ResultBand phase="loading" baseMmr={48600} />);
    expect(screen.getByLabelText(/loading mmr valuation/i)).toBeInTheDocument();
    expect(screen.queryByText("$48,600")).not.toBeInTheDocument();
  });

  it("adjustments are disabled before lookup and enabled after ready", () => {
    const { rerender } = render(<ResultBand phase="idle" baseMmr={null} />);
    expect(screen.getByLabelText(/enter odo/i)).toBeDisabled();
    expect(screen.getByLabelText(/region/i)).toBeDisabled();

    rerender(<ResultBand phase="ready" baseMmr={48600} />);
    expect(screen.getByLabelText(/enter odo/i)).toBeEnabled();
    expect(screen.getByLabelText(/region/i)).toBeEnabled();
    expect(screen.getByText(/preview/i)).toBeInTheDocument();
  });

  it("clear resets interactive adjustment fields", () => {
    render(<ResultBand phase="ready" baseMmr={48600} defaultOdometer={70740} />);
    expect(screen.getByLabelText(/enter odo/i)).toHaveValue("70740");
    fireEvent.change(screen.getByLabelText(/region/i), { target: { value: "Southeast" } });
    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(screen.getByLabelText(/enter odo/i)).toHaveValue("");
    expect(screen.getByLabelText(/region/i)).toHaveValue("");
  });

  it("renders an honest unavailable message for a missingReason (not an error UI)", () => {
    render(<ResultBand phase="unavailable" baseMmr={null} unavailableReason="no_mmr_value" />);
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
  });
});
