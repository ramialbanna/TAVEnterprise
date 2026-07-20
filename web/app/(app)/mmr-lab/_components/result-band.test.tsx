import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EMPTY_MMR_ADJUSTMENTS } from "./mmr-adjustments";
import { ResultBand } from "./result-band";

const noop = () => {};

describe("ResultBand — honest, no fabrication", () => {
  it("idle: shows a lightweight example hint instead of a bare -- grid (NEXT_STEPS #58)", () => {
    render(
      <ResultBand
        baseMmr={null}
        adjustments={EMPTY_MMR_ADJUSTMENTS}
        onAdjustmentsChange={noop}
        onAdjustmentsClear={noop}
      />,
    );
    expect(screen.getByText(/no vehicle looked up yet/i)).toBeInTheDocument();
    expect(screen.getByText(/1HGCM82633A004352/)).toBeInTheDocument();
    expect(screen.queryByText("--")).not.toBeInTheDocument();
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
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(4);
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

  it("adjustments are disabled before ready and enabled after ready", () => {
    // Idle no longer renders the adjustments panel at all (#58 empty state) —
    // use "unavailable" (a lookup happened, no MMR value) to exercise the
    // disabled-but-present panel, then transition to "ready".
    const { rerender } = render(
      <ResultBand
        phase="unavailable"
        unavailableReason="no_mmr_value"
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

  it("adjustments stay enabled while recomputing", () => {
    render(
      <ResultBand
        phase="recomputing"
        baseMmr={48600}
        adjustedMmr={48600}
        adjustments={{ ...EMPTY_MMR_ADJUSTMENTS, odometer: "70740" }}
        onAdjustmentsChange={noop}
        onAdjustmentsClear={noop}
      />,
    );
    expect(screen.getByLabelText(/enter odo/i)).toBeEnabled();
    expect(screen.getByRole("button", { name: "YES" })).toBeEnabled();
    expect(screen.getByText(/updating/i)).toBeInTheDocument();
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

  it("shows odometer dollar delta beside the mileage input", () => {
    render(
      <ResultBand
        phase="ready"
        baseMmr={20200}
        adjustedMmr={23800}
        odometerAdjustment={3400}
        buildOptionsAdjustment={200}
        adjustments={{ ...EMPTY_MMR_ADJUSTMENTS, odometer: "40000", buildOptions: true }}
        onAdjustmentsChange={noop}
        onAdjustmentsClear={noop}
      />,
    );
    expect(screen.getByText("+$3,400")).toBeInTheDocument();
    expect(screen.getByText("+$200")).toBeInTheDocument();
  });

  it("shows grade and color dollar deltas beside the selects", () => {
    render(
      <ResultBand
        phase="ready"
        baseMmr={20200}
        adjustedMmr={23700}
        odometerAdjustment={3340}
        buildOptionsAdjustment={200}
        gradeAdjustment={120}
        colorAdjustment={-160}
        adjustments={{
          ...EMPTY_MMR_ADJUSTMENTS,
          odometer: "40000",
          grade: "4.0",
          exteriorColor: "Black",
          buildOptions: true,
        }}
        onAdjustmentsChange={noop}
        onAdjustmentsClear={noop}
      />,
    );
    expect(screen.getByText("+$120")).toBeInTheDocument();
    expect(screen.getByText("-$160")).toBeInTheDocument();
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

  it("avgCondition renders as decimal (routes.ts normalizes Cox 10× integer before sending)", () => {
    render(
      <ResultBand
        phase="ready"
        baseMmr={43500}
        avgOdometer={114741}
        avgCondition={3.9}
        adjustments={EMPTY_MMR_ADJUSTMENTS}
        onAdjustmentsChange={noop}
        onAdjustmentsClear={noop}
      />,
    );
    expect(screen.getByText("3.9")).toBeInTheDocument();
    expect(screen.queryByText("39")).not.toBeInTheDocument();
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
