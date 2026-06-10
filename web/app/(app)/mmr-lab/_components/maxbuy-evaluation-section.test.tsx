import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { buildMockMaxbuyEvaluation } from "./maxbuy-evaluation-mock";
import { MaxbuyEvaluationSection, type MaxbuyEvaluationState } from "./maxbuy-evaluation-section";

function renderSection(state: MaxbuyEvaluationState) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MaxbuyEvaluationSection state={state} />
    </QueryClientProvider>,
  );
}

describe("MaxbuyEvaluationSection — Zone C1 states", () => {
  it("idle prompts user to search", () => {
    renderSection({ kind: "idle" });
    expect(screen.getByText(/max buy evaluation/i)).toBeInTheDocument();
    expect(screen.getByText(/search to run max buy on this vehicle/i)).toBeInTheDocument();
  });

  it("loading shows skeleton region", () => {
    renderSection({ kind: "loading" });
    expect(screen.getByText(/max buy evaluation/i)).toBeInTheDocument();
    expect(screen.queryByText(/recommended max buy/i)).not.toBeInTheDocument();
  });

  it("ready vehicle_fit shows ceiling without verdict badge", () => {
    const display = buildMockMaxbuyEvaluation({ mmrValue: 23_900, adjustedMmr: 23_900 });
    renderSection({ kind: "ready", display });
    expect(screen.getByText("Vehicle ceiling")).toBeInTheDocument();
    expect(screen.queryByText(/^Buy$/i)).not.toBeInTheDocument();
    expect(screen.getByText("$21,749")).toBeInTheDocument();
    expect(screen.getByText(/tav segment history/i)).toBeInTheDocument();
    expect(screen.getByText(/economics/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pass anyway/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /bid lower/i })).toBeInTheDocument();
  });

  it("ready deal_fit shows verdict and delta", () => {
    const display = buildMockMaxbuyEvaluation(
      { mmrValue: 23_900, adjustedMmr: 23_900 },
      { askingPrice: 21_000 },
    );
    renderSection({ kind: "ready", display });
    expect(screen.getByText(/^Buy$/i)).toBeInTheDocument();
    expect(screen.getByText(/under ask/i)).toBeInTheDocument();
  });

  it("unavailable explains api off", () => {
    renderSection({ kind: "unavailable", reason: "api_off" });
    expect(screen.getByText(/MAXBUY_EVALUATE_ENABLED/i)).toBeInTheDocument();
  });

  it("error shows message and retry", () => {
    const onRetry = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MaxbuyEvaluationSection
          state={{ kind: "error", message: "Evaluate failed." }}
          onRetry={onRetry}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/evaluate failed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry max buy/i })).toBeInTheDocument();
  });
});
