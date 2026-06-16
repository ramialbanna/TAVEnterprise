import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EMPTY_MMR_ADJUSTMENTS } from "./mmr-adjustments";
import { ResultBand } from "./result-band";

const noop = () => {};

describe("ResultBand — honest, no fabrication", () => {
  it("idle: Base MMR and every right-panel value render --", () => {
    render(
      <ResultBand
        baseMmr={null}
        adjustments={EMPTY_MMR_ADJUSTMENTS}
        onAdjustmentsChange={noop}
        onAdjustmentsClear={noop}
      />,
    );
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(7);
  });

  it("VIN value populates ONLY Base MMR; other zones stay --", () => {
    render(
      <ResultBand
        phase="ready"
        baseMmr={48600}
        confidence="high"
        method="vin"
        adjustments={EMPTY_MMR_ADJUSTMENTS}
        onAdjustmentsChange={noop}
        onAdjustmentsClear={noop}
      />,
    );
    expect(screen.getByText("$48,600")).toBeInTheDocument();
    expect(screen.getByText(/high/i)).toBeInTheDocument();
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(6);
  });

  it("loading shows skeleton instead of values", () => {
    render(
      <ResultBand
        phase="loading"
        baseMmr={48600}
        adjustments={EMPTY_MMR_ADJUSTMENTS}
        onAdjustmentsChange={noop}
        onAdjustmentsClear={noop}
      />,
    );
    expect(screen.getByLabelText(/loading mmr valuation/i)).toBeInTheDocument();
    expect(screen.queryByText("$48,600")).not.toBeInTheDocument();
  });

  it("adjustments are disabled before lookup and enabled after ready", () => {
    const { rerender } = render(
      <ResultBand
        phase="idle"
        baseMmr={null}
        adjustments={EMPTY_MMR_ADJUSTMENTS}
        onAdjustmentsChange={noop}
        onAdjustmentsClear={noop}
      />,
    );
    expect(screen.getByLabelText(/enter odo/i)).toBeDisabled();
    expect(screen.getByLabelText(/region/i)).toBeDisabled();

    rerender(
      <ResultBand
        phase="ready"
        baseMmr={48600}
        adjustments={{ ...EMPTY_MMR_ADJUSTMENTS, odometer: "70740" }}
        onAdjustmentsChange={noop}
        onAdjustmentsClear={noop}
      />,
    );
    expect(screen.getByLabelText(/enter odo/i)).toBeEnabled();
    expect(screen.getByLabelText(/region/i)).toBeEnabled();
    expect(screen.getByText(/recompute adjusted mmr from cox/i)).toBeInTheDocument();
  });

  it("clear resets interactive adjustment fields via callback", () => {
    const onClear = vi.fn();
    const onChange = vi.fn();
    render(
      <ResultBand
        phase="ready"
        baseMmr={48600}
        adjustments={{ ...EMPTY_MMR_ADJUSTMENTS, odometer: "70740", region: "Southeast" }}
        onAdjustmentsChange={onChange}
        onAdjustmentsClear={onClear}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(onClear).toHaveBeenCalled();
  });

  it("shows build options dollar delta when YES is selected and Cox reports adjustment", () => {
    render(
      <ResultBand
        phase="ready"
        baseMmr={20200}
        adjustedMmr={20400}
        buildOptionsAdjustment={200}
        adjustments={{ ...EMPTY_MMR_ADJUSTMENTS, buildOptions: true }}
        onAdjustmentsChange={noop}
        onAdjustmentsClear={noop}
      />,
    );
    expect(screen.getByText("+$200")).toBeInTheDocument();
  });

  it("hides build options delta when NO is selected", () => {
    render(
      <ResultBand
        phase="ready"
        baseMmr={20200}
        adjustedMmr={20200}
        buildOptionsAdjustment={200}
        adjustments={{ ...EMPTY_MMR_ADJUSTMENTS, buildOptions: false }}
        onAdjustmentsChange={noop}
        onAdjustmentsClear={noop}
      />,
    );
    expect(screen.queryByText("+$200")).not.toBeInTheDocument();
  });

  it("renders an honest unavailable message for a missingReason (not an error UI)", () => {
    render(
      <ResultBand
        phase="unavailable"
        baseMmr={null}
        unavailableReason="no_mmr_value"
        adjustments={EMPTY_MMR_ADJUSTMENTS}
        onAdjustmentsChange={noop}
        onAdjustmentsClear={noop}
      />,
    );
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
  });
});
