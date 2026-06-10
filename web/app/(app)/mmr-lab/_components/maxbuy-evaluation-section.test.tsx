import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildMockMaxbuyEvaluation } from "./maxbuy-evaluation-mock";
import { MaxbuyEvaluationSection } from "./maxbuy-evaluation-section";

describe("MaxbuyEvaluationSection — Zone C1 states", () => {
  it("idle prompts user to search", () => {
    render(<MaxbuyEvaluationSection state={{ kind: "idle" }} />);
    expect(screen.getByText(/max buy evaluation/i)).toBeInTheDocument();
    expect(screen.getByText(/search to run max buy/i)).toBeInTheDocument();
  });

  it("loading shows skeleton region", () => {
    render(<MaxbuyEvaluationSection state={{ kind: "loading" }} />);
    expect(screen.getByText(/max buy evaluation/i)).toBeInTheDocument();
    expect(screen.queryByText(/recommended max buy/i)).not.toBeInTheDocument();
  });

  it("ready vehicle_fit shows ceiling without verdict badge", () => {
    const display = buildMockMaxbuyEvaluation({ mmrValue: 23_900, adjustedMmr: 23_900 });
    render(<MaxbuyEvaluationSection state={{ kind: "ready", display }} />);
    expect(screen.getByText("Vehicle ceiling")).toBeInTheDocument();
    expect(screen.queryByText(/^Buy$/i)).not.toBeInTheDocument();
    expect(screen.getByText("$21,749")).toBeInTheDocument();
    expect(screen.getByText(/tav segment history/i)).toBeInTheDocument();
    expect(screen.getByText(/economics/i)).toBeInTheDocument();
  });

  it("ready deal_fit shows verdict and delta", () => {
    const display = buildMockMaxbuyEvaluation(
      { mmrValue: 23_900, adjustedMmr: 23_900 },
      { askingPrice: 21_000 },
    );
    render(<MaxbuyEvaluationSection state={{ kind: "ready", display }} />);
    expect(screen.getByText(/^Buy$/i)).toBeInTheDocument();
    expect(screen.getByText(/under ask/i)).toBeInTheDocument();
  });

  it("unavailable explains api off", () => {
    render(<MaxbuyEvaluationSection state={{ kind: "unavailable", reason: "api_off" }} />);
    expect(screen.getByText(/MAXBUY_EVALUATE_ENABLED/i)).toBeInTheDocument();
  });

  it("error shows message and retry", () => {
    const onRetry = vi.fn();
    render(
      <MaxbuyEvaluationSection
        state={{ kind: "error", message: "Evaluate failed." }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText(/evaluate failed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry max buy/i })).toBeInTheDocument();
  });
});
